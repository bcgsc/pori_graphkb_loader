const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const moment = require('moment');

const {variant: {parse: variantParser}, position: {Position}} = require('@bcgsc/knowledgebase-parser');

const {logger} = require('./logging');
const _pubmed = require('./pubmed');
const {
    preferredDiseases, rid, preferredDrugs, preferredFeatures, INTERNAL_SOURCE_NAME, orderPreferredOntologyTerms
} = require('./util');


const SOURCE_DEFN = {
    name: 'ipr',
    url: 'https://ipr.bcgsc.ca/knowledgebase/references',
    description: 'The predecessor to GraphKB'
};

const TYPE_MAPPING = {
    MUT: 'mutation',
    SV: 'structural',
    CNV: 'copy number',
    'ELV-RNA': 'RNA expression',
    'ELV-PROT': 'protein expression'
};

const RELEVANCE_MAP = {
    favourable: 'favourable prognosis',
    oncogene: 'oncogenic',
    unfavourable: 'unfavourable prognosis',
    diagnostic: 'favours diagnosis',
    'putative tumour suppressor': 'likely tumour suppressive',
    'tumour suppressor': 'tumour suppressive',
    'putative oncogene': 'likely oncogenic'
};

const REMAPPED_COLUMNS = {
    'KB Reference UUID': 'ident',
    'KB Reference Created Date': 'createdAt',
    'KB Reference Review Status': 'reviewStatus',
    'KB Reference Created by User': 'createdBy',
    'KB Reference Reviewed by User': 'reviewedBy',
    'KB Reference Events Expression': 'variants',
    'KB Reference Type': 'statementType',
    'KB Reference Relevance': 'relevance',
    'KB Reference Context': 'appliesTo',
    'KB Reference Disease List': 'diseaseList',
    'KB Reference Evidence': 'evidenceLevel',
    'KB Reference ID Type': 'evidenceType',
    'KB Reference Ref ID': 'evidenceId',
    'KB Reference ID Title': 'evidenceTitle'
};


const THERAPY_MAPPING = {
    'gamma secretase inhibitor': 'enzyme inhibitors: gamma secretase inhibitors',
    'rapamycin (mtor inhibitor)': 'rapamycin'
};


const stripRefSeqVersion = (name) => {
    const match = /^(n[mpg]_\d+)\.\d+$/.exec(name);
    return match
        ? match[1]
        : name;
};

/**
 * Determine what the statement applies to based on its type, relevance, and context
 *
 * @returns {object} the record the statement applies to
 */
const extractAppliesTo = async (conn, record) => {
    const {
        statementType,
        appliesTo: appliesToInput,
        variants,
        disease
    } = record;

    const appliesTo = appliesToInput && appliesToInput.replace(/-/g, ' ');
    const relevance = record.relevance.replace(/-/g, ' ');

    if (statementType === 'therapeutic') {
        if ([
            'inferred resistance',
            'acquired resistance',
            'inferred resistance',
            'inferred sensitivity',
            'minimal resistance',
            'no resistance',
            'no response',
            'no sensitivity',
            'reduced sensitivity',
            'resistance',
            'response',
            'sensitivity'
        ].includes(relevance)) {
            let drugName = appliesTo.toLowerCase().replace(/\binhibitors\b/, 'inhibitor');
            if (THERAPY_MAPPING[drugName]) {
                drugName = THERAPY_MAPPING[drugName];
            }
            return conn.getUniqueRecordBy({
                endpoint: 'therapies',
                where: {name: drugName, sourceId: drugName, or: 'sourceId,name'},
                sort: preferredDrugs
            });
        } if (relevance === 'targetable') {
            return conn.getUniqueRecordBy({
                endpoint: 'diseases',
                where: {name: disease},
                sort: preferredDiseases
            });
        }
    } if (statementType === 'biological' || statementType === 'occurrence') {
        if (/.*\bfunction(al)?.*/.exec(relevance) || relevance.includes('dominant negative')) {
            if (variants.length === 1) {
                const [{
                    name, positional, isFeature, reference1
                }] = variants;
                if (isFeature) {
                    return conn.getUniqueRecordBy({
                        endpoint: 'features',
                        where: {
                            name,
                            sourceId: name,
                            or: 'sourceId,name'
                        },
                        sort: preferredFeatures
                    });
                } if (!positional && reference1) {
                    return conn.getUniqueRecordBy({
                        endpoint: 'features',
                        where: {
                            name: reference1,
                            sourceId: reference1,
                            or: 'sourceId,name'
                        },
                        sort: preferredFeatures
                    });
                }
                try {
                    const parsed = variantParser(positional);
                    if (!parsed.reference2) {
                        return conn.getUniqueRecordBy({
                            endpoint: 'features',
                            where: {
                                name: parsed.reference1,
                                sourceId: parsed.reference1,
                                or: 'sourceId,name'
                            },
                            sort: preferredFeatures
                        });
                    }
                } catch (err) {
                    logger.warn(`unable to parse applies to from variants ${variants}`);
                    throw err;
                }
            } else {
                throw new Error(`Unable to determine feature target (variants=Array[${variants.length}])`);
            }
        } else if (['recurrent', 'observed', 'pathogenic', 'mutation hotspot'].includes(relevance)) {
            if (!disease) {
                throw new Error(`required disease not defined (relevance=${relevance}, statementType=${statementType})`);
            }
            return conn.getUniqueRecordBy({
                endpoint: 'diseases',
                where: {name: disease},
                sort: preferredDiseases
            });
        } else if (relevance.includes('tumour suppressor')
            || [
                'test target',
                'cancer associated gene',
                'oncogene',
                'putative oncogene',
                'commonly amplified oncogene',
                'haploinsufficient'
            ].includes(relevance)
        ) {
            if (variants.length === 1) {
                const [{isFeature, name}] = variants;
                if (isFeature) {
                    return conn.getUniqueRecordBy({
                        endpoint: 'features',
                        where: {
                            name,
                            sourceId: name,
                            or: 'sourceId,name'
                        },
                        sort: preferredFeatures
                    });
                }
            }
            throw new Error(`unable to determine the gene being referenced (relevance=${relevance})`);
        } else if (relevance === 'oncogenic') {
            // applies to the variant
        }
    } else if (statementType === 'diagnostic') {
        return conn.getUniqueRecordBy({
            endpoint: 'diseases',
            where: {name: disease},
            sort: preferredDiseases
        });
    } else if (statementType === 'prognostic') {
        return conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: 'patient', source: {name: 'bcgsc'}}
        });
    }
    throw new Error(`not implemented (relevance=${relevance}, statementType=${statementType}, disease=${disease || ''})`);
};


const extractRelevance = (record) => {
    const {
        statementType,
        relevance: rawRelevance
    } = record;

    const relevance = rawRelevance.replace(/-/g, ' ').replace(/\binferred\b/, 'likely');

    if (statementType === 'diagnostic' || statementType === 'prognostic') {
        return statementType;
    }
    return relevance;
};

/**
 * @param {Object} db the orientjs database connection object
 * @param {Object.<string,ClassModel>} schema the mapping of all database models
 * @param {Object} user the user creating the records
 */
const createGRCh37 = async (db, schema, user) => {
    const source = await selectOrCreate(db, {
        content: {name: 'GRCh', version: '37'}, schema, user, model: schema.Source
    });
    for (const chr of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 'X', 'Y']) {
        await selectOrCreate(db, {
            user,
            schema,
            model: schema.Feature,
            content: {
                biotype: 'chromosome', name: chr, sourceId: chr, source: source['@rid']
            }
        });
    }
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
    } else if (match = /^SV_e.([^\(]+)\(([^,]+)(,\s*([^\)]+))?\)\(([^,]+),([^\)]+)\)$/.exec(string)) {
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
        if (string.startsWith('MUT_')) {
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
            if (match = /(:p.[X?][n?](_[X?][n?])?(fs|\*|spl|dup))$/.exec(string)) {
                result.reference1 = string.slice(0, string.length - match[1].length);
                if (match[3] === 'spl') {
                    result.type = 'splice-site';
                } else if (match[3] === '*') {
                    result.type = 'truncating';
                } else if (match[3] === 'fs') {
                    result.type = 'frameshift';
                } else if (match[3] === 'dup') {
                    result.type = 'duplication';
                }
            } else if (match = /(:p.[X?]\*)$/.exec(string)) {
                string = string.slice(0, string.length - match[1].length);
                Object.assign(result, {reference1: string, type: 'truncating'});
            } else if (match = /(:p.[X?][n?]fs)$/.exec(string)) {
                string = string.slice(0, string.length - match[1].length);
                Object.assign(result, {reference1: string, type: 'frameshift'});
            } else {
                Object.assign(result, {positional: string});
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


const cleanHistory = (jsonList) => {
    /**
     * Sort through the record history to retrieve the current state of the record
     * the user who created the record and the user who reviewed the record
     *
     * Removes historical records after assigning a review status and created by user
     */
    // won't be able to port over the old uuid's for any rows that will be split into multiple statements
    // can still find the correct users though
    // will only port review history for now as well as creation date
    const records = {};
    for (const record of jsonList) {
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
            appliesTo: appliesToList,
            diseaseList,
            ...rest
        } = record;
        // columns to product on: context (;), disease_list (;), events_expression (|), ref_id (;)
        const parsedAppliesTo = cleanStringList(appliesToList || '');
        if (parsedAppliesTo.length === 0) {
            parsedAppliesTo.push(null);
        }
        for (const appliesTo of parsedAppliesTo) {
            for (const coReqVariants of cleanStringList(variantsList, '|')) {
                const newRecord = Object.assign({appliesTo}, rest);
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
                        records.push(Object.assign({}, newRecord, {disease}));
                    }
                }
            }
        }
    }
    return records;
};


const processVariant = async (conn, variant) => {
    const reference1 = rid(await conn.getUniqueRecordBy({
        endpoint: 'features',
        where: {
            name: variant.reference1 || variant.positional.reference1,
            sourceId: variant.reference1 || variant.positional.reference1,
            or: 'sourceId,name'
        },
        sort: preferredFeatures
    }));
    let reference2 = null;

    if (variant.reference2 || (variant.positional && variant.positional.reference2)) {
        reference2 = rid(await conn.getUniqueRecordBy({
            endpoint: 'features',
            where: {
                name: variant.reference2 || variant.positional.reference2,
                sourceId: variant.reference2 || variant.positional.reference2,
                or: 'sourceId,name'
            },
            sort: preferredFeatures
        }));
    }
    const type = rid(await conn.getUniqueRecordBy({
        endpoint: 'vocabulary',
        where: {name: variant.type || variant.positional.type, source: {name: INTERNAL_SOURCE_NAME}},
        sort: orderPreferredOntologyTerms
    }));

    if (variant.positional) {
        const {
            positional, noFeatures, multiFeature, prefix, ...content
        } = {
            ...variant, ...variant.positional, reference1, reference2, type
        };
        return conn.addRecord({
            endpoint: 'positionalvariants',
            content,
            fetchConditions: {
                germline: null,
                reference2: null,
                zygosity: null,
                break1End: null,
                break2Start: null,
                break2End: null,
                untemplatedSeq: null,
                untemplatedSeqSize: null,
                refSeq: null,
                ...content
            },
            existsOk: true
        });
    }
    return conn.addRecord({
        endpoint: 'categoryvariants',
        content: {
            ...variant,
            reference1,
            reference2,
            type
        },
        fetchConditions: {
            germline: null,
            zygosity: null,
            ...variant,
            reference1,
            reference2,
            type
        },
        existsOk: true
    });
};


const processRecord = async ({conn, record: inputRecord, source}) => {
    const record = Object.assign({}, inputRecord, {variants: []});
    const impliedBy = [];
    const supportedBy = [];

    for (const variant of inputRecord.variants) {
        record.variants.push(convertDeprecatedSyntax(variant));
    }
    const variants = await Promise.all(record.variants.map(async variant => processVariant(conn, variant)));
    for (const variant of variants) {
        impliedBy.push({target: rid(variant)});
    }
    // try to find the disease name in GraphKB
    let disease;
    if (record.disease) {
        try {
            disease = await conn.getUniqueRecordBy({
                endpoint: 'diseases',
                where: {name: record.disease},
                sort: preferredDiseases
            });
        } catch (err) {
            throw err;
        }
        impliedBy.push({target: rid(disease)});
    }

    // check that the expected pubmedIds exist in the db
    for (const {sourceId, summary} of record.support) {
        const article = await _pubmed.fetchArticle(conn, sourceId);
        supportedBy.push({target: rid(article), summary});
    }
    // determine the appliesTo
    const appliesTo = await extractAppliesTo(conn, record);

    // determine the record relevance
    const relevance = await conn.getUniqueRecordBy({
        endpoint: 'vocabulary',
        where: {name: extractRelevance(record), source: {name: INTERNAL_SOURCE_NAME}},
        sort: orderPreferredOntologyTerms
    });
    // now create the statement
    return conn.addRecord({
        endpoint: 'statements',
        content: {
            appliesTo: rid(appliesTo),
            relevance: rid(relevance),
            supportedBy,
            impliedBy,
            source: rid(source),
            sourceId: record.ident
        },
        existsOk: true,
        fetchExisting: false
    });
};


const uploadFile = async ({filename, conn}) => {
    logger.info('loading content from IPR');
    const counts = {
        error: 0, skip: 0, history: 0, success: 0, fusionErrors: 0
    };
    const users = {};
    logger.info(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    logger.info('parsing into json');

    const jsonList = parse(content, {
        delimiter: ',',
        escape: null,
        comment: '##',
        columns: true,
        auto_parse: true,
        quote: '"'
    });
    logger.info(`${jsonList.length} initial records`);
    let records = [];

    for (const record of jsonList) {
        const newRecord = {};
        for (const [oldName, newName] of Object.entries(REMAPPED_COLUMNS)) {
            newRecord[newName] = record[oldName] || null;
        }
        if (newRecord.evidenceType !== 'pubmed' || newRecord.reviewStatus.toLowerCase() === 'flagged-incorrect') {
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
    for (const record of records) {
        for (const {sourceId} of record.support) {
            pubmedIdList.add(sourceId);
        }
    }
    logger.info(`loading ${pubmedIdList.size} articles from pubmed`);
    // await _pubmed.uploadArticlesByPmid(conn, Array.from(pubmedIdList));

    for (const record of records) {
        logger.info(`processing ${record.ident}`);
        users[record.createdBy] = (users[record.createdBy] || 0) + 1;
        if (record.history) {
            counts.history++;
        }
        try {
            await processRecord({conn, record, source});
            counts.success++;
        } catch (err) {
            const error = err.error || err;
            logger.error(error);
            if (error.message.includes('is not a function')) {
                console.error(error);
            }
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
    logger.info(JSON.stringify(users));
};

module.exports = {uploadFile, convertDeprecatedSyntax, SOURCE_DEFN};
