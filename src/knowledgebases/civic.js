/**
 * @module importer/civic
 */
const request = require('request-promise');
const _ = require('lodash');
const Ajv = require('ajv');
const fs = require('fs');

const kbParser = require('@bcgsc/knowledgebase-parser');

const { checkSpec } = require('./../util');
const {
    orderPreferredOntologyTerms,
    rid,
} = require('./../graphkb');
const { logger } = require('./../logging');
const _pubmed = require('./../entrez/pubmed');
const _entrezGene = require('./../entrez/gene');

const ajv = new Ajv();

const { civic: SOURCE_DEFN, ncit: NCIT_SOURCE_DEFN } = require('./../sources');

const TRUSTED_CURATOR_ID = 968;

const BASE_URL = 'https://civicdb.org/api';

/**
 * https://civicdb.org/glossary
 */
const VOCAB = {
    url: 'https://civicdb.org/glossary',
    A: 'Trusted association in clinical medicine that routinely informs treatment, including large scale metaanalyses, standard of care associations, and organizational recommendations.',
    B: 'Clinical evidence from clinical trials and other primary tumor data.',
    C: 'Case study evidence from individual case reports in peer reviewed journals.',
    D: 'Preclinical evidence from cell line studies, mouse models, and other in vitro or in vivo models.',
    E: 'Inferential association made from experimental data.',
    1: 'Evidence likely does not belong in CIViC. Claim is not supported well by experimental evidence. Results are not reproducible, or have very small sample size. No follow-up is done to validate novel claims.',
    2: 'Evidence is not well supported by experimental data, and little follow-up data is available. Publication is from a journal with low academic impact. Experiments may lack proper controls, have small sample size, or are not statistically convincing.',
    3: 'Evidence is convincing, but not supported by a breadth of experiments. May be smaller scale projects, or novel results without many follow-up experiments. Discrepancies from expected results are explained and not concerning.',
    4: 'Strong, well supported evidence. Experiments are well controlled, and results are convincing. Any discrepancies from expected results are well-explained and not concerning.',
    5: 'Strong, well supported evidence from a lab or journal with respected academic standing. Experiments are well controlled, and results are clean and reproducible across multiple replicates. Evidence confirmed using separate methods.',
};

const EVIDENCE_LEVEL_CACHE = {}; // avoid unecessary requests by caching the evidence levels
const RELEVANCE_CACHE = {};


const validateEvidenceSpec = ajv.compile({
    type: 'object',
    properties: {
        id: { type: 'number' },
        description: { type: 'string' },
        disease: {
            type: 'object',
            name: { type: 'string' },
            doid: { type: 'string' },
        },
        drugs: {
            type: 'array',
            items: {
                type: 'object',
                required: ['name', 'ncit_id'],
                properties: {
                    id: { type: 'number' },
                    name: { type: 'string' },
                    pubchem_id: { type: ['string', 'null'] },
                    ncit_id: { type: ['string', 'null'] },
                },
            },
        },
        rating: { type: ['number', 'null'] },
        evidence_level: { type: 'string' },
        evidence_type: {
            type: 'string',
            pattern: '(Predictive|Diagnostic|Prognostic|Predisposing)',
        },
        clinical_significance: {
            oneOf: [
                {
                    type: 'string',
                    pattern: `(${[
                        'Sensitivity',
                        'Adverse Response',
                        'Resistance',
                        'Sensitivity/Response',
                        'Positive',
                        'Negative',
                        'Poor Outcome',
                        'Better Outcome',
                        'Uncertain Significance',
                        'Pathogenic',
                        'N/A',
                    ].join('|')})`,
                },
                { type: 'null' },
            ],
        },
        evidence_direction: { type: ['string', 'null'] },
        status: { type: 'string' },
        source: {
            properties: {
                citation_id: { type: 'string' },
                source_type: { type: 'string' },
                name: { type: ['string', 'null'] },
            },
        },
        variant_id: { type: 'number' },
    },
});


const validateVariantSpec = ajv.compile({
    type: 'object',
    properties: {
        id: { type: 'number' },
        entrez_name: { type: 'string' },
        entrez_id: { type: 'number' },
        name: { type: 'string' },
        description: { type: 'string' },
        civic_actionability_score: { type: 'number' },
        coordinates: {
            type: 'object',
            properties: {
                chromosome: { type: ['string', 'null'] },
                start: { type: ['number', 'null'] },
                stop: { type: ['number', 'null'] },
                reference_bases: { type: ['string', 'null'] },
                variant_bases: { type: ['string', 'null'] },
                representative_transcript: { type: ['string', 'null'] },
                chromosome2: { type: ['string', 'null'] },
                start2: { type: ['number', 'null'] },
                stop2: { type: ['number', 'null'] },
                representative_transcript2: { type: ['string', 'null'] },
                ensembl_version: { type: ['number', 'null'] },
                reference_build: { type: ['string', 'null'] },
            },
        },
        variant_types: {
            type: 'array',
            items: {
                type: 'object',
                name: { type: 'string' },
                so_id: { type: 'string' },
            },
        },
    },
});

/**
 * Convert the CIViC relevance types to GraphKB terms
 */
const getRelevance = async ({ rawRecord, conn }) => {
    const translateRelevance = (evidenceType, clinicalSignificance) => {
        switch (evidenceType) { // eslint-disable-line default-case
            case 'Predictive': {
                switch (clinicalSignificance) { // eslint-disable-line default-case
                    case 'Sensitivity':
                    case 'Adverse Response':
                    case 'Reduced Sensitivity':

                    case 'Resistance': {
                        return clinicalSignificance.toLowerCase();
                    }

                    case 'Sensitivity/Response': { return 'sensitivity'; }
                }
                break;
            }

            case 'Diagnostic': {
                switch (clinicalSignificance) { // eslint-disable-line default-case
                    case 'Positive': { return 'favours diagnosis'; }

                    case 'Negative': { return 'opposes diagnosis'; }
                }
                break;
            }

            case 'Prognostic': {
                switch (clinicalSignificance) { // eslint-disable-line default-case
                    case 'Negative':

                    case 'Poor Outcome': {
                        return 'unfavourable prognosis';
                    }
                    case 'Positive':

                    case 'Better Outcome': {
                        return 'favourable prognosis';
                    }
                }
                break;
            }

            case 'Predisposing': {
                if (['Positive', null, 'null'].includes(clinicalSignificance)) {
                    return 'Predisposing';
                } if (clinicalSignificance.includes('Pathogenic')) {
                    return clinicalSignificance;
                } if (clinicalSignificance === 'Uncertain Significance') {
                    return 'likely predisposing';
                }
                break;
            }
        }
        throw new Error(
            `unrecognized evidence type (${evidenceType}) or clinical significance (${clinicalSignificance})`,
        );
    };

    // translate the type to a GraphKB vocabulary term
    let relevance = translateRelevance(rawRecord.evidence_type, rawRecord.clinical_significance).toLowerCase();

    if (RELEVANCE_CACHE[relevance] === undefined) {
        relevance = await conn.getVocabularyTerm(relevance);
        RELEVANCE_CACHE[relevance.name] = relevance;
    } else {
        relevance = RELEVANCE_CACHE[relevance];
    }
    return relevance;
};

/**
 * Given some drug name, find the drug that is equivalent by name in GraphKB
 */
const getDrug = async (conn, drugRecord) => {
    let originalError;

    // fetch from NCIt first if possible, or pubchem
    // then use the name as a fallback
    const name = drugRecord.name.toLowerCase().trim();

    if (drugRecord.ncit_id) {
        try {
            const drug = await conn.getUniqueRecordBy({
                target: 'Therapy',
                filters: [
                    { source: { target: 'Source', filters: { name: NCIT_SOURCE_DEFN.name } } },
                    { sourceId: drugRecord.ncit_id },
                ],
                sort: orderPreferredOntologyTerms,
            });
            return drug;
        } catch (err) {
            logger.error(`had NCIt drug mapping (${drugRecord.ncit_id}) but failed to fetch from graphkb: ${err}`);
            throw err;
        }
    }

    try {
        const drug = await conn.getTherapy(name);
        return drug;
    } catch (err) {
        originalError = err;
    }

    try {
        const match = /^\s*(\S+)\s*\([^)]+\)$/.exec(name);

        if (match) {
            return await conn.getTherapy(match[1]);
        }
    } catch (err) { }
    logger.error(originalError);
    throw originalError;
};


const getVariantName = ({ name, variant_types: variantTypes = [] }) => {
    const result = name.toLowerCase().trim();

    if ([
        'loss-of-function',
        'gain-of-function',
        'overexpression',
        'expression',
        'amplification',
        'mutation',
    ].includes(result)) {
        return result.replace(/-/g, ' ');
    }
    const SUBS = {
        'g12/g13': '(G12_G13)mut',
        'di842-843vm': 'D842_I843delDIinsVM',
        'del 755-759': '?755_?759del',
    };

    if (SUBS[result] !== undefined) {
        return SUBS[result];
    }

    let match;

    if (match = /^(intron|exon) (\d+)(-(\d+))? (mutation|deletion|frameshift|insertion)$/i.exec(result)) {
        const break2 = match[4]
            ? `_${match[4]}`
            : '';
        const type = match[5] === 'frameshift'
            ? 'fs'
            : match[5].slice(0, 3);
        const prefix = match[1] === 'exon'
            ? 'e'
            : 'i';
        return `${prefix}.${match[2]}${break2}${type}`;
    } if (match = /^([A-Z][^-\s]*)-([A-Z][^-\s]*)/i.exec(result)) {
        return 'fusion';
    } if (match = /^[A-Z][^-\s]* fusions?$/i.exec(result)) {
        return 'fusion';
    } if (match = /^\s*c\.\d+\s*[a-z]\s*>[a-z]\s*$/i.exec(result)) {
        return result.replace(/\s+/g, '');
    } if (match = /^((delete?rious)|promoter)\s+mutation$/.exec(result) || result.includes('domain')) {
        return result;
    } if (result === 'mutation' && variantTypes.length === 1) {
        return variantTypes[0].name.replace(/_/g, ' ');
    } if (match = /^(.*) mutations?$/.exec(result)) {
        return 'mutation';
    } if (match = /^([A-Z]\d+\S+)\s+\((c\..*)\)$/i.exec(result)) {
        if (match[1].includes('?')) {
            return match[2];
        }
        return `p.${match[1]}`;
    } if (match = /^Splicing alteration \((c\..*)\)$/i.exec(result)) {
        return match[1];
    } if (match = /^exon (\d+)–(\d+) deletion$/.exec(result)) {
        const [, start, end] = match;
        return `e.${start}_${end}del`;
    } if (match = /^([a-z]\d+) phosphorylation$/.exec(result)) {
        return `p.${match[1]}phos`;
    }
    return result;
};


const getEvidenceLevel = async ({
    conn, rawRecord, sources,
}) => {
    // get the evidenceLevel
    let level = `${rawRecord.evidence_level}${rawRecord.rating || ''}`.toLowerCase();

    if (EVIDENCE_LEVEL_CACHE[level] === undefined) {
        level = await conn.addRecord({
            target: 'EvidenceLevel',
            content: {
                name: level,
                sourceId: level,
                source: rid(sources.civic),
                displayName: `${SOURCE_DEFN.displayName} ${level.toUpperCase()}`,
                description: `${VOCAB[rawRecord.evidence_level]} ${VOCAB[rawRecord.rating] || ''}`,
                url: VOCAB.url,
            },
            existsOk: true,
            fetchConditions: { AND: [{ sourceId: level }, { name: level }, { source: rid(sources.civic) }] },

        });
        EVIDENCE_LEVEL_CACHE[level.sourceId] = level;
    } else {
        level = EVIDENCE_LEVEL_CACHE[level];
    }
    return level;
};

/**
 * Given some variant record and a feature, process the variant and return a GraphKB equivalent
 */
const processVariantRecord = async ({ conn, variantRec, feature }) => {
    // get the feature (entrez name appears to be synonymous with hugo symbol)

    // parse the variant record
    const variantName = getVariantName(variantRec);

    let reference1,
        reference2 = null;

    if (variantName === 'fusion' && variantRec.name.includes('-')) {
        [reference1, reference2] = variantRec.name.toLowerCase().split('-');

        if (feature.name !== reference1) {
            [reference1, reference2] = [reference2, reference1];
        }
        reference1 = feature;
        const search = await _entrezGene.fetchAndLoadBySymbol(conn, reference2);

        if (search.length !== 1) {
            throw new Error(`unable to find specific (${search.length}) gene for symbol (${reference2})`);
        }
        [reference2] = search;
    } else {
        reference1 = feature;
    }

    try {
        let variantClass;

        // try to fetch civic specific term first
        try {
            variantClass = await conn.getVocabularyTerm(variantName, SOURCE_DEFN.name);
        } catch (err) {
            variantClass = await conn.getVocabularyTerm(variantName);
        }
        const body = {
            type: rid(variantClass),
            reference1: rid(reference1),
        };

        if (reference2) {
            body.reference2 = rid(reference2);
        }
        const variant = await conn.addVariant({
            target: 'CategoryVariant',
            content: body,
            existsOk: true,
        });
        return variant;
    } catch (err) {
        let parsed;

        try {
            parsed = kbParser.variant.parse(
                `${/^[cpe]\..*/.exec(variantName)
                    ? ''
                    : 'p.'}${variantName}`, false,
            ).toJSON();
        } catch (parsingError) {
            throw new Error(`could not match ${variantName} (${err}) or parse (${parsingError}) variant`);
        }
        const variantClass = await conn.getVocabularyTerm(parsed.type);
        Object.assign(parsed, {
            reference1: rid(feature),
            type: rid(variantClass),
        });

        if (reference2) {
            parsed.reference2 = rid(reference2);
        }
        const variant = await conn.addVariant({
            target: 'PositionalVariant',
            content: parsed,
            existsOk: true,
        });
        return variant;
    }
};


/**
 * Transform a CIViC evidence record into a GraphKB statement
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object for GraphKB
 * @param {object} opt.rawRecord the unparsed record from CIViC
 * @param {object} opt.sources the sources by name
 * @param
 */
const processEvidenceRecord = async (opt) => {
    const {
        conn, rawRecord, sources,
    } = opt;

    const [level, relevance, [feature]] = await Promise.all([
        getEvidenceLevel(opt),
        getRelevance(opt),
        _entrezGene.fetchAndLoadByIds(conn, [rawRecord.variant.entrez_id]),
    ]);
    let variant;

    try {
        variant = await processVariantRecord({ variantRec: rawRecord.variant, feature, conn });
    } catch (err) {
        logger.error(`Unable to process the variant (id=${rawRecord.variant.id}, name=${rawRecord.variant.name})`);
        throw err;
    }
    // get the disease by doid
    let diseaseQueryFilters = {};

    if (rawRecord.disease.doid) {
        diseaseQueryFilters = {
            AND: [
                { sourceId: `doid:${rawRecord.disease.doid}` },
                { source: { target: 'Source', filters: { name: 'disease ontology' } } },
            ],
        };
    } else {
        diseaseQueryFilters = { name: rawRecord.disease.name };
    }
    let disease;

    try {
        disease = await conn.getUniqueRecordBy({
            target: 'Disease',
            filters: diseaseQueryFilters,
            sort: orderPreferredOntologyTerms,
        });
    } catch (err) {
        throw err;
    }
    // get the drug(s) by name
    let drug;

    if (rawRecord.drug) {
        drug = await getDrug(conn, rawRecord.drug);
    }
    // get the publication by pubmed ID
    let publication;

    try {
        [publication] = await _pubmed.fetchAndLoadByIds(conn, [rawRecord.source.citation_id]);
    } catch (err) {
        throw err;
    }

    // common content
    const content = {
        relevance: rid(relevance),
        source: rid(sources.civic),
        reviewStatus: 'not required',
        sourceId: rawRecord.id,
        evidenceLevel: rid(level),
        evidence: [rid(publication)],
        conditions: [rid(variant)],
        description: rawRecord.description,
    };

    // create the statement and connecting edges
    if (!['Diagnostic', 'Predictive', 'Prognostic', 'Predisposing'].includes(rawRecord.evidence_type)) {
        throw new Error(`Unable to make statement (evidence_type=${rawRecord.evidence_type})`);
    }
    if (rawRecord.evidence_type === 'Diagnostic' || rawRecord.evidence_type === 'Predisposing') {
        content.subject = rid(disease);
    } else {
        content.conditions.push(rid(disease));
    }

    if (rawRecord.evidence_type === 'Predictive' && drug) {
        content.subject = rid(drug);
    } if (rawRecord.evidence_type === 'Prognostic') {
        // get the patient vocabulary object
        content.subject = rid(await conn.getVocabularyTerm('patient'));
    }

    if (content.subject && !content.conditions.includes(content.subject)) {
        content.conditions.push(content.subject);
    }
    await conn.addRecord({
        target: 'Statement',
        content,
        existsOk: true,
        fetchExisting: false,
    });
};

/**
 * Dowmloads the variant records that are referenced by the evidence records
 */
const downloadVariantRecords = async () => {
    const varById = {};
    let expectedPages = 1,
        currentPage = 1;
    const urlTemplate = `${BASE_URL}/variants?count=500`;

    while (currentPage <= expectedPages) {
        const url = `${urlTemplate}&page=${currentPage}`;
        logger.info(`loading: ${url}`);
        const resp = await request({
            method: 'GET',
            json: true,
            uri: url,
        });
        expectedPages = resp._meta.total_pages;
        logger.info(`loaded ${resp.records.length} records`);

        for (const record of resp.records) {
            if (varById[record.id] !== undefined) {
                throw new Error('variant record ID is not unique', record);
            }

            try {
                checkSpec(validateVariantSpec, record);
                varById[record.id] = record;
            } catch (err) {
                logger.error(err);
            }
        }
        currentPage++;
    }
    return varById;
};

/**
 * Fetch civic approved evidence entries as well as those submitted by trusted curators
 *
 * @param {string} baseUrl the base url for the request
 */
const downloadEvidenceRecords = async (baseUrl) => {
    const urlTemplate = `${baseUrl}/evidence_items?count=500&status=accepted`;
    // load directly from their api
    const counts = { error: 0, success: 0, skip: 0 };
    let expectedPages = 1,
        currentPage = 1;

    const allRecords = [];
    const errorList = [];

    // get the aproved entries
    while (currentPage <= expectedPages) {
        const url = `${urlTemplate}&page=${currentPage}`;
        logger.info(`loading: ${url}`);
        const resp = await request({
            method: 'GET',
            json: true,
            uri: url,
        });
        expectedPages = resp._meta.total_pages;
        logger.info(`loaded ${resp.records.length} records`);
        allRecords.push(...resp.records);
        currentPage++;
    }

    // now find entries curated by trusted curators
    const { results: trustedSubmissions } = await request({
        uri: `${baseUrl}/evidence_items/search`,
        method: 'POST',
        body: {
            operator: 'AND',
            queries: [{ field: 'submitter_id', condition: { name: 'is_equal_to', parameters: [`${TRUSTED_CURATOR_ID}`] } }],
            entity: 'evidence_items',
            save: true,
        },
        json: true,
    });

    let submitted = 0;

    for (const record of trustedSubmissions) {
        if (record.status === 'submitted') {
            submitted += 1;
            allRecords.push(record);
        }
    }
    logger.info(`loaded ${submitted} unaccepted entries from trusted submitters`);

    // validate the records using the spec
    const records = [];

    for (const record of allRecords) {
        try {
            checkSpec(validateEvidenceSpec, record);
        } catch (err) {
            errorList.push({ record, error: err, errorMessage: err.toString() });
            logger.error(err);
            counts.error++;
            continue;
        }

        if (
            record.clinical_significance === 'N/A'
            || record.evidence_direction === 'Does Not Support'
            || (record.clinical_significance === null && record.evidence_type === 'Predictive')
        ) {
            counts.skip++;
            logger.debug(`skipping uninformative record (${record.id})`);
        } else if (record.source.source_type.toLowerCase() !== 'pubmed') {
            logger.info(`Currently only loading pubmed sources. Found ${record.source.source_type} (${record.id})`);
            counts.skip++;
        } else {
            records.push(record);
        }
    }
    return { records, counts, errorList };
};


/**
 * Access the CIVic API, parse content, transform and load into GraphKB
 *
 * @param {object} opt options
 * @param {ApiConnection} opt.conn the api connection object for GraphKB
 * @param {string} [opt.url] url to use as the base for accessing the civic api
 */
const upload = async (opt) => {
    const { conn, errorLogPrefix } = opt;
    // add the source node
    const source = await conn.addRecord({
        target: 'Source',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
    });

    let { result: previouslyEntered } = await conn.request({
        method: 'POST',
        uri: 'query',
        body: {
            target: 'Statement',
            filters: { source: rid(source) },
            returnProperties: ['sourceId'],
        },
    });
    previouslyEntered = new Set(previouslyEntered.map(r => r.sourceId));
    logger.info(`Found ${previouslyEntered.size} records previously added from ${SOURCE_DEFN.name}`);

    const varById = await downloadVariantRecords();
    const { records, errorList, counts } = await downloadEvidenceRecords(opt.url || BASE_URL);


    logger.info(`Processing ${records.length} records`);
    counts.exists = counts.exists || 0;

    for (const record of records) {
        record.variant = varById[record.variant_id];

        if (record.drugs === undefined || record.drugs.length === 0) {
            record.drugs = [null];
        }

        if (previouslyEntered.has(`${record.id}`)) {
            counts.exists += record.drugs.length;
            continue;
        }

        for (const drug of record.drugs) {
            try {
                logger.debug(`processing ${record.id}`);
                await processEvidenceRecord({
                    conn,
                    sources: { civic: source },
                    rawRecord: Object.assign({ drug }, _.omit(record, ['drugs'])),
                });
                counts.success += 1;
            } catch (err) {
                if (err.toString().includes('is not a function')) {
                    console.error(err);
                }
                errorList.push({ record, error: err, errorMessage: err.toString() });
                logger.error(err);
                counts.error += 1;
            }
        }
    }
    logger.info(JSON.stringify(counts));
    const errorJson = `${errorLogPrefix}-civic.json`;
    logger.info(`writing ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify(errorList, null, 2));
};

module.exports = {
    upload,
    getVariantName,
    SOURCE_DEFN,
    kb: true,
    specs: { validateEvidenceSpec, validateVariantSpec },
};
