/**
 * | | |
 * | --- | --- |
 * | Source| CIVIC |
 * | About | https://civicdb.org/about |
 * | Source Type | Knowledgebase |
 * | Data Example | Direct API Access |
 * | Data Format | JSON |
 *
 * Import the Clinical Evidence summaries from the public Civic database. CIVIC pro
 *
 * http://griffithlab.org/civic-api-docs/#endpoint-types
 * https://civicdb.org/api/evidence_items
 * @module migrations/external/civic
 */
const request = require('request-promise');
const _ = require('lodash');
const Ajv = require('ajv');
const jsonpath = require('jsonpath');

const ajv = new Ajv();


const kbParser = require('@bcgsc/knowledgebase-parser');


const {
    orderPreferredOntologyTerms,
    preferredDrugs,
    preferredDiseases,
    rid
} = require('./util');
const {logger} = require('./logging');
const _pubmed = require('./pubmed');

const SOURCE_NAME = 'civic';
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
    5: 'Strong, well supported evidence from a lab or journal with respected academic standing. Experiments are well controlled, and results are clean and reproducible across multiple replicates. Evidence confirmed using separate methods.'
};

const THERAPY_MAPPING = {
    ch5132799: 'ch-5132799',
    ag1296: 'ag 1296',
    'hormone therapy': 'hormone therapy agent',
    taxane: 'taxanes',
    chemotherapy: 'chemotherapeutic agent',
    cp724714: 'cp-724714',
    'mk-2206': 'mk2206',
    'trametinib dmso': 'trametinib dimethyl sulfoxide',
    'pd-1 inhibitor': 'pd1 inhibitor',
    'pf 00299804': 'pf-00299804',
    pd184352: 'pd-184352',
    'trichostatin a (tsa)': 'trichostatin a'
};

const EVIDENCE_LEVEL_CACHE = {}; // avoid unecessary requests by caching the evidence levels
const RELEVANCE_CACHE = {};
const FEATURE_CACHE = {}; // store features by name


const validateEvidenceSpec = ajv.compile({
    type: 'object',
    properties: {
        id: {type: 'number'},
        description: {type: 'string'},
        disease: {
            type: 'object',
            name: {type: 'string'},
            doid: {type: 'string'}
        },
        drugs: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: {type: 'number'},
                    name: {type: 'string'},
                    pubchem_id: {oneOf: [{type: 'string'}, {type: 'null'}]}
                }
            }
        },
        rating: {oneOf: [{type: 'number'}, {type: 'null'}]},
        evidence_level: {type: 'string'},
        evidence_type: {
            type: 'string',
            pattern: '(Predictive|Diagnostic|Prognostic|Predisposing)'
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
                        'N/A'
                    ].join('|')})`
                },
                {type: 'null'}
            ]
        },
        evidence_direction: {oneOf: [{type: 'string'}, {type: 'null'}]},
        status: {type: 'string'},
        source: {
            properties: {
                citation_id: {type: 'string'},
                source_type: {type: 'string'},
                name: {oneOf: [{type: 'string'}, {type: 'null'}]}
            }
        },
        variant_id: {type: 'number'}
    }
});


const validateVariantSpec = ajv.compile({
    type: 'object',
    properties: {
        id: {type: 'number'},
        entrez_name: {type: 'string'},
        entrez_id: {type: 'number'},
        name: {type: 'string'},
        description: {type: 'string'},
        civic_actionability_score: {type: 'number'},
        coordinates: {
            type: 'object',
            properties: {
                chromosome: {oneOf: [{type: 'string'}, {type: 'null'}]},
                start: {oneOf: [{type: 'number'}, {type: 'null'}]},
                stop: {oneOf: [{type: 'number'}, {type: 'null'}]},
                reference_bases: {oneOf: [{type: 'string'}, {type: 'null'}]},
                variant_bases: {oneOf: [{type: 'string'}, {type: 'null'}]},
                representative_transcript: {oneOf: [{type: 'string'}, {type: 'null'}]},
                chromosome2: {oneOf: [{type: 'string'}, {type: 'null'}]},
                start2: {oneOf: [{type: 'number'}, {type: 'null'}]},
                stop2: {oneOf: [{type: 'number'}, {type: 'null'}]},
                representative_transcript2: {oneOf: [{type: 'string'}, {type: 'null'}]},
                ensembl_version: {oneOf: [{type: 'number'}, {type: 'null'}]},
                reference_build: {oneOf: [{type: 'string'}, {type: 'null'}]}
            }
        },
        variant_types: {
            type: 'array',
            items: {
                type: 'object',
                name: {type: 'string'},
                so_id: {type: 'string'}
            }
        }
    }
});

/**
 * Convert the CIViC relevance types to GraphKB terms
 */
const getRelevance = async ({rawRecord, conn}) => {
    const translateRelevance = (evidenceType, clinicalSignificance) => {
        switch (evidenceType) { // eslint-disable-line default-case
            case 'Predictive': {
                switch (clinicalSignificance) { // eslint-disable-line default-case
                    case 'Sensitivity':
                    case 'Adverse Response':
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
            `unrecognized evidence type (${evidenceType}) or clinical significance (${clinicalSignificance})`
        );
    };

    // translate the type to a GraphKB vocabulary term
    let relevance = translateRelevance(rawRecord.evidence_type, rawRecord.clinical_significance).toLowerCase();
    if (RELEVANCE_CACHE[relevance] === undefined) {
        relevance = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: relevance, source: {name: 'bcgsc'}}
        });
        RELEVANCE_CACHE[relevance.name] = relevance;
    } else {
        relevance = RELEVANCE_CACHE[relevance];
    }
    return relevance;
};

/**
 * Given some drug name, find the drug that is equivalent by name in GraphKB
 */
const getDrug = async (conn, name) => {
    if (THERAPY_MAPPING[name] !== undefined) {
        name = THERAPY_MAPPING[name];
    }
    let originalError;
    try {
        const drug = await conn.getUniqueRecordBy({
            endpoint: 'therapies', where: {name}, sort: preferredDrugs
        });
        return drug;
    } catch (err) {
        originalError = err;
    }
    try {
        const match = /^\s*(\S+)\s*\([^)]+\)$/.exec(name);
        if (match) {
            return conn.getUniqueRecordBy({
                endpoint: 'therapies',
                where: {name: match[1]},
                sort: preferredDrugs
            });
        }
    } catch (err) {}
    logger.warn(`Failed to find therapy record (name=${name})`);
    throw originalError;
};


const getVariantName = ({name, variant_types: variantTypes = []}) => {
    const result = name.toLowerCase().trim();
    if ([
        'loss-of-function',
        'overexpression',
        'expression',
        'amplification',
        'mutation'].includes(result)
    ) {
        return result.replace(/-/g, ' ');
    }
    const SUBS = {
        'frameshift truncation': 'frameshift',
        itd: 'internal tandem duplication (itd)',
        loss: 'copy loss',
        'copy number variation': 'copy variant',
        gain: 'copy gain',
        'g12/g13': '(G12_G13)mut',
        'di842-843vm': 'D842_I843delDIinsVM',
        'del 755-759': '?755_?759del'
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
    } if (result !== 'mutation' && result.endsWith('mutation')) {
        return result.replace(/\s*mutation$/i, '');
    } if (result === 'mutation' && variantTypes.length === 1) {
        return variantTypes[0].name.replace(/_/g, ' ');
    }
    return result;
};


/**
 * Given some HUGO symbol, find the records in GraphkB and cache it for re-use
 */
const getFeature = async (conn, name) => {
    name = name.toString().toLowerCase().trim();
    if (FEATURE_CACHE[name] !== undefined) {
        return FEATURE_CACHE[name];
    }
    try {
        const feature = await conn.getUniqueRecordBy({
            endpoint: 'features',
            where: {name, source: {name: 'hgnc'}},
            sort: orderPreferredOntologyTerms
        });
        FEATURE_CACHE[feature.name] = feature;
        return feature;
    } catch (err) {
        logger.warn(`Failed to retrieve the hgnc feature: ${name}`);
        throw err;
    }
};


const getEvidenceLevel = async ({
    conn, rawRecord, sources
}) => {
    // get the evidenceLevel
    let level = `${rawRecord.evidence_level}${rawRecord.rating}`.toLowerCase();
    if (EVIDENCE_LEVEL_CACHE[level] === undefined) {
        level = await conn.addRecord({
            endpoint: 'evidencelevels',
            content: {
                name: level,
                sourceId: level,
                source: rid(sources.civic),
                description: `${VOCAB[rawRecord.evidence_level]} ${VOCAB[rawRecord.rating] || ''}`,
                url: VOCAB.url
            },
            existsOk: true,
            fetchConditions: {sourceId: level, name: level, source: rid(sources.civic)}

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
const processVariantRecord = async ({conn, variantRec, feature}) => {
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
        reference2 = await getFeature(conn, reference2);
    } else {
        reference1 = feature;
    }
    try {
        const variantClass = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: variantName, source: {name: 'bcgsc'}}
        });
        const body = {
            type: rid(variantClass),
            reference1: rid(reference1)
        };
        if (reference2) {
            body.reference2 = rid(reference2);
        }
        const variant = await conn.addRecord({
            endpoint: 'categoryvariants',
            content: body,
            existsOk: true,
            fetchConditions: Object.assign({
                zygosity: null,
                reference2: null,
                germline: null
            }, body)
        });
        return variant;
    } catch (err) {
        const parsed = kbParser.variant.parse(
            `${variantName.startsWith('e.')
                ? ''
                : 'p.'}${variantName}`, false
        ).toJSON();
        const variantClass = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: parsed.type, source: {name: 'bcgsc'}}
        });
        Object.assign(parsed, {
            reference1: rid(feature),
            type: rid(variantClass)
        });
        if (reference2) {
            parsed.reference2 = rid(reference2);
        }
        const variant = await conn.addRecord({
            endpoint: 'positionalvariants',
            content: parsed,
            existsOk: true,
            fetchConditions: Object.assign({
                germline: null,
                zygosity: null,
                reference2: null,
                break2Repr: null,
                untemplatedSeq: null
            }, parsed)
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
        conn, rawRecord, sources
    } = opt;

    const [level, relevance, feature] = await Promise.all([
        getEvidenceLevel(opt),
        getRelevance(opt),
        getFeature(conn, rawRecord.variant.entrez_name)
    ]);
    let variant;
    try {
        variant = await processVariantRecord({variantRec: rawRecord.variant, feature, conn});
    } catch (err) {
        logger.warn(`Unable to process the variant (id=${rawRecord.variant.id}, name=${rawRecord.variant.name})`);
        throw err;
    }
    // get the disease by doid
    let disease = {};
    if (rawRecord.disease.doid) {
        disease.sourceId = `doid:${rawRecord.disease.doid}`;
        disease.source = {name: 'disease ontology'};
    } else {
        disease.name = rawRecord.disease.name;
    }
    try {
        disease = await conn.getUniqueRecordBy({
            endpoint: 'diseases',
            where: disease,
            sort: preferredDiseases
        });
    } catch (err) {
        logger.warn(`Unable to retrieve disease record (doid=${rawRecord.disease.doid}, name=${rawRecord.disease.name})`);
        throw err;
    }
    // get the drug(s) by name
    let drug;
    if (rawRecord.drug) {
        drug = await getDrug(conn, rawRecord.drug.name.toLowerCase().trim());
    }
    // get the publication by pubmed ID
    let publication;
    try {
        publication = await _pubmed.fetchArticle(conn, rawRecord.source.citation_id);
    } catch (err) {
        logger.warn(`Failed to retrieve the pubmed article ${rawRecord.source.citation_id}`);
        throw err;
    }

    // common content
    const content = {
        relevance: rid(relevance),
        source: rid(sources.civic),
        reviewStatus: 'not required',
        sourceId: rawRecord.id
    };

    content.supportedBy = [{target: rid(publication), source: rid(sources.civic), level: rid(level)}];
    content.impliedBy = [{target: rid(variant)}];
    content.description = rawRecord.description;
    // create the statement and connecting edges
    if (!['Diagnostic', 'Predictive', 'Prognostic'].includes(rawRecord.evidence_type)) {
        logger.warn(`Unable to make statement (evidence_type=${rawRecord.evidence_type})`);
        throw new Error('unable to make statement', rawRecord.evidence_type, relevance.name);
    }
    if (rawRecord.evidence_type === 'Diagnostic') {
        content.appliesTo = rid(disease);
    } else {
        content.impliedBy.push({target: rid(disease)});
    }

    if (rawRecord.evidence_type === 'Predictive' && drug) {
        content.appliesTo = rid(drug);
    } if (rawRecord.evidence_type === 'Prognostic') {
        content.appliesTo = null;
    }
    await conn.addRecord({
        endpoint: 'statements',
        content,
        existsOk: true,
        fetchExisting: false
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
            uri: url
        });
        expectedPages = resp._meta.total_pages;
        logger.info(`loaded ${resp.records.length} records`);
        for (const record of resp.records) {
            if (varById[record.id] !== undefined) {
                throw new Error('variant record ID is not unique', record);
            }
            if (!validateVariantSpec(record)) {
                logger.error(
                    `Spec Validation failed for variant ${
                        record.id
                    } #${
                        validateVariantSpec.errors[0].dataPath
                    } ${
                        validateVariantSpec.errors[0].message
                    } found ${
                        jsonpath.query(record, `$${validateVariantSpec.errors[0].dataPath}`)
                    }`
                );
            }

            varById[record.id] = record;
        }
        currentPage++;
    }
    return varById;
};


/**
 * Access the CIVic API, parse content, transform and load into GraphKB
 *
 * @param {object} opt options
 * @param {ApiConnection} opt.conn the api connection object for GraphKB
 * @param {string} [opt.url] url to use as the base for accessing the civic api
 */
const upload = async (opt) => {
    const {conn} = opt;
    const urlTemplate = `${opt.url || BASE_URL}/evidence_items?count=500&status=accepted`;
    // load directly from their api
    const counts = {error: 0, success: 0, skip: 0};
    let expectedPages = 1,
        currentPage = 1;

    // add the source node
    const source = await conn.addRecord({
        endpoint: 'sources',
        content: {
            name: SOURCE_NAME,
            usage: 'https://creativecommons.org/publicdomain/zero/1.0',
            url: 'https://civicdb.org'
        },
        existsOk: true
    });

    const pubmedSource = await conn.addRecord({
        endpoint: 'sources',
        content: {name: 'pubmed'},
        existsOk: true
    });
    const varById = await downloadVariantRecords();

    while (currentPage <= expectedPages) {
        const url = `${urlTemplate}&page=${currentPage}`;
        logger.info(`loading: ${url}`);
        const resp = await request({
            method: 'GET',
            json: true,
            uri: url
        });
        expectedPages = resp._meta.total_pages;
        logger.info(`loaded ${resp.records.length} records`);

        const records = [];
        // validate the records using the spec
        for (const record of resp.records) {
            if (!validateEvidenceSpec(record)) {
                logger.error(
                    `Spec Validation failed for evidence record ${
                        record.id
                    } #${
                        validateEvidenceSpec.errors[0].dataPath
                    } ${
                        validateEvidenceSpec.errors[0].message
                    } found ${
                        jsonpath.query(record, `$${validateEvidenceSpec.errors[0].dataPath}`)
                    }`
                );
                counts.error++;
            } else if (
                record.clinical_significance === 'N/A'
                || record.evidence_direction === 'Does Not Support'
                || (record.clinical_significance === null && record.evidence_type === 'Predictive')
            ) {
                counts.skip++;
            } else if (record.source.source_type.toLowerCase() !== 'pubmed') {
                logger.warn(`Currently only loading pubmed sources. Found ${record.source.source_type}`);
                counts.skip++;
            } else {
                records.push(record);
            }
        }

        // fetch and cache the current pubmed records first
        const pmidList = Array.from((new Set(records.map(rec => rec.source.citation_id).filter(pmid => pmid))).values());
        logger.info(`Fetching article metadata for ${pmidList.length} articles from ${records.length} records`);
        const pubmedList = await _pubmed.fetchArticlesByPmids(pmidList);
        logger.info(`Uploading ${pubmedList.length} publications`);
        // throttle
        for (const article of pubmedList) {
            await _pubmed.uploadArticle(conn, article, {cache: true, fetchFirst: true});
        }

        logger.info(`Processing ${records.length} records`);
        for (const record of records) {
            record.variant = varById[record.variant_id];
            if (record.drugs === undefined || record.drugs.length === 0) {
                record.drugs = [null];
            }
            for (const drug of record.drugs) {
                try {
                    await processEvidenceRecord({
                        conn,
                        sources: {civic: source, pubmed: pubmedSource},
                        rawRecord: Object.assign({drug}, _.omit(record, ['drugs']))
                    });
                    counts.success++;
                } catch (err) {
                    counts.error++;
                    logger.warn(`Failed to create statement from evidence record (id=${record.id})`);
                }
            }
        }
        logger.info(JSON.stringify(counts));
        currentPage++;
    }
    logger.info(JSON.stringify(counts));
};

module.exports = {upload, getVariantName};
