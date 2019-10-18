const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const moment = require('moment');

const {variant: {parse: variantParser}, position: {Position}} = require('@bcgsc/knowledgebase-parser');

const {logger} = require('./logging');
const _pubmed = require('./entrez/pubmed');
const _hgnc = require('./hgnc');
const _ctg = require('./clinicaltrialsgov');
const {
    orderPreferredOntologyTerms,
    convertRowFields
} = require('./util');
const {
    preferredDiseases,
    rid,
    preferredFeatures,
    INTERNAL_SOURCE_NAME
} = require('./graphkb');


const SOURCE_DEFN = {
    name: 'iprkb',
    url: 'https://ipr.bcgsc.ca/knowledgebase/references',
    description: 'The predecessor to GraphKB',
    displayName: 'IPRKB'
};

const DEFAULT_ASSEMBLY = 'GRCh37';


const HEADER = {
    ident: 'kb_reference_uuid',
    createdAt: 'kb_reference_created_date',
    reviewStatus: 'kb_reference_review_status',
    createdBy: 'kb_reference_created_by_user',
    reviewedBy: 'kb_reference_reviewed_by_user',
    variants: 'kb_reference_events_expression',
    statementType: 'kb_reference_type',
    relevance: 'kb_reference_relevance',
    subject: 'kb_reference_context',
    diseaseList: 'kb_reference_disease_list',
    evidenceLevel: 'kb_reference_evidence',
    evidenceType: 'kb_reference_id_type',
    evidenceId: 'kb_reference_ref_id',
    evidenceTitle: 'kb_reference_id_title'
};


const THERAPY_MAPPING = {
    'gamma secretase inhibitor': 'enzyme inhibitors: gamma secretase inhibitors',
    'rapamycin (mtor inhibitor)': 'rapamycin',
    asp3026: 'asp-3026',
    ap26113: 'ap-26113',
    selumitinib: 'selumetinib',
    lapitinib: 'lapatinib',
    tratuzumab: 'trastuzumab',
    'dacomitinib (pf 00299804)': 'dacomitinib',
    oliparib: 'olaparib'
};


const RELEVANCE_SKIP = [
    // not considered infomative enough to load to GraphKB
    'not determined',
    'test target',
    'not specified',
    'equally-as-effective-as',
    'more-effective-than',
    // new GraphKB will only use oncokb list for these
    'cancer associated gene',
    'oncogene',
    'putative tumour suppressor',
    'tumour suppressor',
    'putative oncogene'
];


const stripRefSeqVersion = (name) => {
    const match = /^(n[mpg]_\d+)\.\d+$/.exec(name);
    return match
        ? match[1]
        : name;
};


const getFeature = async (conn, rawName) => {
    let name = rawName;
    if (/^hla\.[a-z0-9]+$/i.exec(name)) {
        name.replace('.', '-');
    }
    name = name.replace(/\.\d+$/, '');
    try {
        return await conn.getUniqueRecordBy({
            target: 'Feature',
            filters: {
                OR: [
                    {name: stripRefSeqVersion(name)},
                    {sourceId: stripRefSeqVersion(name)}
                ]
            },
            sort: preferredFeatures
        });
    } catch (err) {
        // see if it is a hugo gene
        try {
            return await _hgnc.fetchAndLoadBySymbol({conn, symbol: name});
        } catch (otherErr) {}
        // or an old symbol for a hugo gene
        try {
            return await _hgnc.fetchAndLoadBySymbol({conn, symbol: name, paramType: 'prev_symbol'});
        } catch (otherErr) {}
        throw err;
    }
};


const stripDrugPlurals = name => name.toLowerCase().trim().replace(/\bmimetics\b/, 'mimetic').replace(/\binhibitors\b/, 'inhibitor');


/**
 * Determine what the statement applies to based on its type, relevance, and context
 *
 * @returns {object} the record the statement applies to
 */
const extractAppliesTo = async (conn, record, source) => {
    const {
        statementType,
        subject: appliesToInput,
        variants,
        features,
        disease,
        evidence,
        relevance
    } = record;

    const subject = appliesToInput && appliesToInput.replace(/-/g, ' ');

    if (statementType === 'therapeutic') {
        if (relevance.includes('resistance') || relevance.includes('sensitivity') || relevance.includes('response')) {
            let drugName = stripDrugPlurals(subject);
            if (THERAPY_MAPPING[drugName]) {
                drugName = THERAPY_MAPPING[drugName];
            }
            return conn.addTherapyCombination(source, drugName);
        } if (relevance === 'targetable') {
            if (!disease) {
                throw new Error(`required disease not defined (relevance=${relevance}, statementType=${statementType})`);
            }
            return conn.getUniqueRecordBy({
                target: 'Disease',
                filters: {name: disease},
                sort: preferredDiseases
            });
        } if (relevance === 'eligibility') {
            if (evidence.length === 1) {
                return evidence[0];
            }
        }
    } if (statementType === 'biological' || statementType === 'occurrence') {
        if (/.*\bfunction(al)?.*/.exec(relevance) || relevance.includes('dominant negative')) {
            if (features.length + variants.length === 1) {
                if (features.length) {
                    return features[0];
                }
                const [{
                    reference1,
                    reference2
                }] = variants;
                if (reference1 && !reference2) {
                    return reference1;
                }
            }
            throw new Error(`Unable to determine feature target (variants=Array[${variants.length}], features=Array[${features.length}])`);
        } else if (['recurrent', 'observed', 'pathogenic', 'mutation hotspot'].includes(relevance)) {
            if (!disease) {
                if (subject && (subject.includes('somatic') || subject === 'cancer')) {
                    return conn.getUniqueRecordBy({
                        target: 'Disease',
                        filters: {name: 'cancer'},
                        sort: preferredDiseases
                    });
                }
                throw new Error(`required disease not defined (relevance=${relevance}, statementType=${statementType})`);
            }
            return conn.getUniqueRecordBy({
                target: 'Disease',
                filters: {name: disease},
                sort: preferredDiseases
            });
        } else if (
            [
                'tumour suppressive',
                'likely tumour suppressive',
                'oncogenic',
                'likely oncogenic',
                'haploinsufficient',
                'oncogenic fusion',
                'disruptive fusion'
            ].includes(relevance)
        ) {
            if (features.length + variants.length === 1) {
                return features[0] || variants[0];
            }
        }
        throw new Error(`unable to determine the target gene (${features.length}) or variant (${variants.length}) being referenced (relevance=${relevance})`);
    } else if (statementType === 'diagnostic') {
        return conn.getUniqueRecordBy({
            target: 'Disease',
            filters: {name: disease},
            sort: preferredDiseases
        });
    } else if (statementType === 'prognostic') {
        return conn.getVocabularyTerm('patient');
    }
    throw new Error(`not implemented (relevance=${relevance}, statementType=${statementType}, disease=${disease || ''})`);
};


const extractRelevance = (record) => {
    const {
        statementType,
        relevance: rawRelevance,
        subject
    } = record;

    const relevance = rawRelevance
        .replace(/-/g, ' ')
        .replace(/\binferred\b/, 'likely')
        .replace(/\putative\b/, 'likely')
        .replace(/\boncogene\b/, 'oncogenic')
        .replace(/\btumou?r suppressor\b/, 'tumour suppressive');

    if (statementType === 'diagnostic') {
        return 'diagnostic indicator';
    } if (statementType === 'prognostic') {
        if (/^favou?rable$/.exec(relevance)) {
            return 'favourable prognosis';
        } if (/^unfavou?rable prognosis$/.exec(relevance)) {
            return 'unfavourable prognosis';
        }
        return 'prognostic indicator';
    } if (subject === 'oncogenic fusion' && relevance.includes('gain of function')) {
        return 'oncogenic fusion';
    } if (relevance === 'associated with') {
        if (subject.toLowerCase() === 'pathogenic germline mutation') {
            return 'pathogenic';
        }
        return subject;
    }
    return relevance;
};


/**
 * Parse CategoryVariants and convert deprecated PositionalVariant syntax.
 * Convert them to the current syntax and return them
 */
const convertDeprecatedSyntax = (string) => {
    if (typeof string !== 'string') {
        throw new Error(`bad input (${string}) must be a string`);
    }
    string = string.toString().trim();
    const result = {};
    const zygosity = /.*(_(ns|heterozygous|homozygous|na|any)(\s*\(germline\))?)$/.exec(string);
    if (zygosity) {
        if (zygosity[3]) {
            result.germline = true;
        }
        if (zygosity[2] === 'heterozygous' || zygosity[2] === 'homozygous') {
            result.zygosity = zygosity[2];
        }
        string = string.slice(0, string.length - zygosity[1].length).trim();
    }
    let match = null;
    if (string.startsWith('FANN_')) {
        Object.assign(result, {name: string.slice(5), isFeature: true});
    } else if (match = /^SV_e.([^(]+)\(([^,]+)(,\s*([^)]+))?\)\(([^,]+),([^)]+)\)$/.exec(string)) {
        // exon level structural variant
        result.type = 'structural variant';
        const cytobandPattern = /^(1[0-9]|2[0-2]|[1-9]|X|Y)([pq]\d+(\.\d+)?)$/;
        let submatch;
        match = {
            type: match[1],
            reference1: match[2],
            reference2: match[3]
                ? match[4]
                : match[2],
            pos1Prefix: 'e',
            pos2Prefix: 'e',
            pos1: match[5],
            pos2: match[6]
        };
        if (match.pos1.includes(':')) {
            match.reference1 = match.pos1.slice(0, match.pos1.indexOf(':'));
            match.pos1 = match.pos1.slice(match.pos1.indexOf(':') + 1);
        }
        if (match.pos2.includes(':')) {
            match.reference2 = match.pos2.slice(0, match.pos2.indexOf(':'));
            match.pos2 = match.pos2.slice(match.pos2.indexOf(':') + 1);
        }
        if (match.pos2 === 'na' && (submatch = cytobandPattern.exec(match.reference2))) {
            match.reference2 = submatch[1];
            match.pos2 = submatch[2];
            match.pos2Prefix = 'y';
        }
        if (match.pos1 === 'na' && (submatch = cytobandPattern.exec(match.reference1))) {
            match.reference1 = submatch[1];
            match.pos1 = submatch[2];
            match.pos1Prefix = 'y';
        }
        if (match.pos1.includes('intron')) {
            match.pos1Prefix = 'i';
            match.pos1 = match.pos1.replace('intron', '').trim();
        }
        if (match.pos2.includes('intron')) {
            match.pos2Prefix = 'i';
            match.pos2 = match.pos2.replace('intron', '').trim();
        }
        result.type = match.type;
        if (match.pos1 === '?' && match.pos2 === '?') {
            if (match.reference1 === '?') {
                result.reference1 = match.reference2;
            } else if (match.reference2 === '?') {
                result.reference1 = match.reference1;
            } else {
                result.reference1 = match.reference1;
                result.reference2 = match.reference2;
            }
        } else {
            result.positional = `(${match.reference1},${match.reference2}):${match.type}(${match.pos1Prefix}.${match.pos1},${match.pos2Prefix}.${match.pos2})`;
        }
    } else if (match = /^(SV|CNV|MUT)_([^_:]+)(_([^_]+))?$/.exec(string)) {
        let type;
        if (match[1] === 'CNV') {
            type = 'copy variant';
        } else if (match[1] === 'SV') {
            type = 'structural variant';
        } else {
            type = 'mutation';
        }
        if (match[3] && !['not specified', 'any'].includes(match[4])) {
            type = match[4];
        }
        Object.assign(result, {type, reference1: match[2]});
    } else if (match = /^ELV-(PROT|RNA)_([^_]+)_([^_]+)$/.exec(string)) {
        const type = match[1] === 'PROT'
            ? 'protein'
            : 'RNA';
        Object.assign(result, {reference1: match[2], type: match[3].replace(' ', ` ${type} `)});
    } else if (!/[.;,:_]/.exec(string)) {
        Object.assign(result, {name: string, isFeature: true});
    } else if (!/[!&$#]/.exec(string) && string.includes(':')) {
        if (/^(MUT|CNV)_/.exec(string)) {
            string = string.slice(4);
        }
        if (match = /(X\[(\d+|n)\])$/.exec(string)) {
            string = string.slice(0, string.length - match[1].length);
            if (match[2] !== 'n') {
                string = `${string}${match[2]}`;
            }
        }
        if (match = /^([^_]+)_(not specified|any)$/.exec(string)) {
            Object.assign(result, {reference1: match[1], type: 'mutation'});
        } else {
            if (match = /^.+:([^:]+:[^:]+)$/.exec(string)) { // if multiple features are defined, use the most specific
                string = match[1];
            }
            const [reference1] = string.split(':');
            string = string.slice(reference1.length + 1);
            if (match = /^(p.[X?][n?](_[X?][n?])?(fs|\*|spl|dup))$/.exec(string)) {
                result.reference1 = reference1;
                if (match[3] === 'spl') {
                    result.type = 'splice-site';
                } else if (match[3] === '*') {
                    result.type = 'truncating';
                } else if (match[3] === 'fs') {
                    result.type = 'frameshift';
                } else if (match[3] === 'dup') {
                    result.type = 'duplication';
                }
            } else if (match = /^(p.[X?]\*)$/.exec(string)) {
                Object.assign(result, {reference1, type: 'truncating'});
            } else if (match = /^(p.[X?][n?]fs)$/.exec(string)) {
                Object.assign(result, {reference1, type: 'frameshift'});
            } else if (match = /^(e\.(\d+)\?)$/.exec(string)) {
                Object.assign(result, {positional: `${reference1}:e.${match[2]}mut`});
            } else {
                Object.assign(result, {positional: `${reference1}:${string}`});
            }
        }
    } else {
        logger.warn(`unable to convert syntax for ${string}`);
        throw new Error(`invalid syntax (${string}`);
    }
    if (result.reference1) {
        result.reference1 = stripRefSeqVersion(result.reference1.toLowerCase().trim());
    }
    if (result.reference2) {
        result.reference2 = stripRefSeqVersion(result.reference2.toLowerCase().trim());
    }
    if (result.positional) {
        try {
            result.positional = variantParser(result.positional).toJSON();
            for (const [key, value] of Object.entries(result.positional)) {
                if (result.positional[key] instanceof Position) {
                    result.positional[key] = value.toJSON();
                }
            }
        } catch (err) {
            logger.warn(`unable to parse syntax for ${string} from ${result.positional}`);
        }
    }
    return result;
};

/**
 * Sort through the record history to retrieve the current state of the record
 * the user who created the record and the user who reviewed the record
 *
 * Removes historical records after assigning a review status and created by user
 */
const cleanHistory = (jsonList) => {
    // won't be able to port over the old uuid's for any rows that will be split into multiple statements
    // can still find the correct users though
    // will only port review history for now as well as creation date
    const records = {};
    for (const record of jsonList) {
        record._raw = {...record};
        record.reviewStatus = record.reviewStatus
            ? record.reviewStatus.toLowerCase().trim()
            : '';
        if (records[record.ident] === undefined) {
            records[record.ident] = [];
        }
        record.createdAt = moment(record.createdAt).unix();

        records[record.ident].push(record);
    }
    for (const ident of Object.keys(records)) {
        if (records[ident].length > 1) {
            records[ident] = records[ident].sort((r1, r2) => r2.createdAt - r1.createdAt);
            if (records[ident][0].reviewStatus === 'reviewed') {
                records[ident][0].history = records[ident].slice(1);
            }
        }
        records[ident] = records[ident][0];
    }
    return Object.values(records);
};

const cleanStringList = (string, delim = ';') => Array.from(
    string.toString().split(delim),
    x => x.trim()
).filter(x => x !== '' && x !== 'not specified');


/**
 * Given a list of json records. Expand statments so that all semi-colon delimited lists are split
 * into separate records
 */
const expandRecords = (jsonList) => {
    const records = [];
    for (const record of jsonList) {
        const {
            variants: variantsList,
            subject: appliesToList,
            diseaseList,
            ...rest
        } = record;
        // columns to product on: context (;), disease_list (;), events_expression (|), ref_id (;)
        const parsedAppliesTo = cleanStringList(appliesToList || '');
        if (parsedAppliesTo.length === 0) {
            parsedAppliesTo.push(null);
        }
        for (const subject of parsedAppliesTo) {
            for (const coReqVariants of cleanStringList(variantsList, '|')) {
                const newRecord = {subject, ...rest};
                newRecord.variants = cleanStringList(coReqVariants, '&');

                for (const pmid of cleanStringList(record.evidenceId)) {
                    newRecord.support = [{
                        sourceId: pmid,
                        summary: record.summary
                    }];
                }
                const diseases = cleanStringList(diseaseList || '');
                if (diseases.length === 0) {
                    records.push(newRecord);
                } else {
                    for (const disease of diseases) {
                        records.push({...newRecord, disease});
                    }
                }
            }
        }
    }
    return records;
};


const processVariant = async (conn, variant) => {
    const reference1 = rid(await getFeature(conn, variant.reference1 || variant.positional.reference1));
    let reference2 = null;

    if (variant.reference2 || (variant.positional && variant.positional.reference2)) {
        reference2 = rid(await getFeature(conn, variant.reference2 || variant.positional.reference2));
    }
    const type = rid(await conn.getVocabularyTerm(variant.type || variant.positional.type));

    if (variant.positional) {
        const {
            positional, noFeatures, multiFeature, prefix, ...content
        } = {
            ...variant, ...variant.positional, reference1, reference2, type
        };

        // default genomic variants to hg19 when not given
        if (content.break1Repr.startsWith('g.') && !content.assembly) {
            content.assembly = DEFAULT_ASSEMBLY;
        }

        return conn.addVariant({
            endpoint: 'positionalvariants',
            content,
            existsOk: true
        });
    }
    return conn.addVariant({
        endpoint: 'categoryvariants',
        content: {
            ...variant,
            reference1,
            reference2,
            type
        },
        existsOk: true
    });
};


const processRecord = async ({conn, record: inputRecord, source}) => {
    const record = {...inputRecord, variants: []};
    const conditions = [];
    const evidence = [];

    for (const variant of inputRecord.variants) {
        record.variants.push(convertDeprecatedSyntax(variant));
    }
    const variants = await Promise.all(
        record.variants
            .filter(v => !v.isFeature)
            .map(async variant => processVariant(conn, variant))
    );

    const features = await Promise.all(
        record.variants.filter(v => v.isFeature).map(async v => getFeature(conn, v.name))
    );
    for (const variant of variants) {
        conditions.push(rid(variant));
    }
    // try to find the disease name in GraphKB
    let disease;
    if (record.disease) {
        try {
            disease = await conn.getUniqueRecordBy({
                target: 'Disease',
                filters: {name: record.disease},
                sort: preferredDiseases
            });
        } catch (err) {
            throw err;
        }
        conditions.push(rid(disease));
    }

    // check that the expected pubmedIds exist in the db
    for (const {sourceId} of record.support) {
        let evidenceRec;
        if (sourceId.startsWith('NCT')) {
            evidenceRec = await _ctg.fetchAndLoadById(conn, sourceId);
        } else {
            [evidenceRec] = await _pubmed.fetchAndLoadByIds(conn, [sourceId]);
        }
        if (!evidenceRec) {
            throw new Error(`unable to retrieve evidence record for sourceId (${sourceId})`);
        }
        evidence.push(rid(evidenceRec));
    }

    // determine the record relevance
    const relevance = await conn.getVocabularyTerm(extractRelevance(record));

    // determine the subject
    const subject = await extractAppliesTo(
        conn,
        {
            ...record, variants, features, evidence, relevance: relevance.name
        },
        source
    );

    const reviews = [];
    let reviewStatus = 'pending';
    if (record.createdBy) {
        reviews.push({
            createdBy: record.createdBy,
            createdAt: record.createdAt,
            status: 'initial'
        });
    }
    if (record.reviewedBy && record.reviewedBy !== record.createdBy) {
        reviewStatus = 'passed';
        reviews.push({
            createdBy: record.reviewedBy,
            createdAt: record.reviewedAt || record.createdAt,
            status: 'passed'
        });
    }
    if (subject && !conditions.includes(rid(subject))) {
        conditions.push(rid(subject));
    }
    // console.log(record);
    // now create the statement
    await conn.addRecord({
        endpoint: 'statements',
        content: {
            subject: rid(subject),
            relevance: rid(relevance),
            evidence,
            conditions,
            source: rid(source),
            sourceId: record.ident,
            reviewStatus,
            reviews
        },
        existsOk: true,
        fetchExisting: false
    });
};


const uploadFile = async ({filename, conn, errorLogPrefix}) => {
    logger.info('loading content from IPR');
    const counts = {
        error: 0, skip: 0, history: 0, success: 0
    };
    logger.info(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    logger.info('parsing into json');

    const jsonList = parse(content, {
        delimiter: '\t',
        escape: null,
        comment: '##',
        columns: true,
        quote: false,
        auto_parse: true
    });
    logger.info(`${jsonList.length} initial records`);
    let records = [];

    for (const record of jsonList) {
        const newRecord = convertRowFields(HEADER, record);

        if (
            (!['pubmed', 'pmcid'].includes(newRecord.evidenceType) && !newRecord.evidenceType.startsWith('ClinicalT'))
            || newRecord.reviewStatus.toLowerCase() === 'flagged-incorrect'
            || newRecord.relevance === 'observed'
        ) {
            counts.skip++;
            continue;
        }
        records.push(newRecord);
    }
    logger.info(`${records.length} non-skipped records`);
    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });

    records = cleanHistory(records);
    logger.info(`${records.length} records after cleaning history`);

    records = expandRecords(records);
    logger.info(`${records.length} records after list expansion`);

    const pubmedIdList = new Set();
    const users = {};
    for (const record of records) {
        for (const {sourceId} of record.support) {
            if (!sourceId.startsWith('NCT')) {
                pubmedIdList.add(sourceId);
            }
        }
        if (record.createdBy && users[record.createdBy] === undefined) {
            users[record.createdBy] = rid(await conn.addRecord({
                endpoint: 'users',
                content: {name: record.createdBy},
                existsOk: true
            }));
        }
        if (record.reviewedBy && users[record.reviewedBy] === undefined) {
            users[record.reviewedBy] = rid(await conn.addRecord({
                endpoint: 'users',
                content: {name: record.reviewedBy},
                existsOk: true
            }));
        }
        if (record.createdBy) {
            record.createdBy = users[record.createdBy];
        }
        if (record.reviewedBy) {
            record.reviewedBy = users[record.reviewedBy];
        }
        if (record.support.length === 1 && record.evidenceId === '25801821') {
            // MSK-IMPACT panel
            if (!record.subject && record.relevance === 'mutation hotspot') {
                record.subject = 'cancer';
            }
        }
    }
    logger.info(`loading ${pubmedIdList.size} articles from pubmed`);
    await _pubmed.preLoadCache(conn);
    await _pubmed.fetchAndLoadByIds(conn, Array.from(pubmedIdList));

    const errorList = [];

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        logger.info(`processing ${record.ident} (${i} / ${records.length})`);
        if (record.history) {
            counts.history++;
        }
        if (RELEVANCE_SKIP.includes(record.relevance)) {
            counts.skip++;
            continue;
        }
        try {
            await processRecord({conn, record, source});
            counts.success++;
        } catch (err) {
            const error = err.error || err;
            errorList.push({
                row: record,
                index: i,
                error,
                errorMessage: error.toString()
            });
            logger.error(error);
            counts.error++;
        }
    }
    const errorLogFile = `${errorLogPrefix}-iprkb.json`;
    logger.info(`writing errors to ${errorLogFile}`);
    fs.writeFileSync(errorLogFile, JSON.stringify({records: errorList}, null, 2));
    logger.info(JSON.stringify(counts));
    logger.info(JSON.stringify(users));
};

module.exports = {
    uploadFile, convertDeprecatedSyntax, SOURCE_DEFN, kb: true
};
