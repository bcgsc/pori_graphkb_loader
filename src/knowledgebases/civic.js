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
const _snp = require('../entrez/snp');

const ajv = new Ajv();

const { civic: SOURCE_DEFN, ncit: NCIT_SOURCE_DEFN } = require('./../sources');

const TRUSTED_CURATOR_ID = 968;

const BASE_URL = 'https://civicdb.org/api';

/**
 * https://civicdb.org/glossary
 */
const VOCAB = {
    1: 'Evidence likely does not belong in CIViC. Claim is not supported well by experimental evidence. Results are not reproducible, or have very small sample size. No follow-up is done to validate novel claims.',
    2: 'Evidence is not well supported by experimental data, and little follow-up data is available. Publication is from a journal with low academic impact. Experiments may lack proper controls, have small sample size, or are not statistically convincing.',
    3: 'Evidence is convincing, but not supported by a breadth of experiments. May be smaller scale projects, or novel results without many follow-up experiments. Discrepancies from expected results are explained and not concerning.',
    4: 'Strong, well supported evidence. Experiments are well controlled, and results are convincing. Any discrepancies from expected results are well-explained and not concerning.',
    5: 'Strong, well supported evidence from a lab or journal with respected academic standing. Experiments are well controlled, and results are clean and reproducible across multiple replicates. Evidence confirmed using separate methods.',
    A: 'Trusted association in clinical medicine that routinely informs treatment, including large scale metaanalyses, standard of care associations, and organizational recommendations.',
    B: 'Clinical evidence from clinical trials and other primary tumor data.',
    C: 'Case study evidence from individual case reports in peer reviewed journals.',
    D: 'Preclinical evidence from cell line studies, mouse models, and other in vitro or in vivo models.',
    E: 'Inferential association made from experimental data.',
    url: 'https://civicdb.org/glossary',
};

const EVIDENCE_LEVEL_CACHE = {}; // avoid unecessary requests by caching the evidence levels
const RELEVANCE_CACHE = {};


const validateEvidenceSpec = ajv.compile({
    properties: {
        clinical_significance: {
            enum: [
                'Sensitivity',
                'Adverse Response',
                'Resistance',
                'Sensitivity/Response',
                'Reduced Sensitivity',
                'Positive',
                'Negative',
                'Poor Outcome',
                'Better Outcome',
                'Uncertain Significance',
                'Pathogenic',
                'Likely Pathogenic',
                'N/A',
                'Gain of Function',
                'Loss of Function',
                'Neomorphic',
                'Dominant Negative',
                null,
            ],
        },
        description: { type: 'string' },
        disease: {
            doid: { type: 'string' },
            name: { type: 'string' },
            type: 'object',
        },
        drugs: {
            items: {
                properties: {
                    id: { type: 'number' },
                    name: { type: 'string' },
                    ncit_id: { type: ['string', 'null'] },
                    pubchem_id: { type: ['string', 'null'] },
                },
                required: ['name', 'ncit_id'],
                type: 'object',
            },
            type: 'array',
        },
        evidence_direction: { enum: ['Supports', 'N/A', 'Does Not Support', null] },
        evidence_level: { type: 'string' },
        evidence_type: {
            enum: ['Predictive', 'Diagnostic', 'Prognostic', 'Predisposing', 'Functional'],
        },
        id: { type: 'number' },
        rating: { type: ['number', 'null'] },
        source: {
            properties: {
                citation_id: { type: 'string' },
                name: { type: ['string', 'null'] },
                source_type: { type: 'string' },
            },
        },
        status: { type: 'string' },
        variant_id: { type: 'number' },
    },
    type: 'object',
});


const validateVariantSpec = ajv.compile({
    properties: {
        civic_actionability_score: { type: 'number' },
        coordinates: {
            properties: {
                chromosome: { type: ['string', 'null'] },
                chromosome2: { type: ['string', 'null'] },
                ensembl_version: { type: ['number', 'null'] },
                reference_bases: { type: ['string', 'null'] },
                reference_build: { type: ['string', 'null'] },
                representative_transcript: { type: ['string', 'null'] },
                representative_transcript2: { type: ['string', 'null'] },
                start: { type: ['number', 'null'] },
                start2: { type: ['number', 'null'] },
                stop: { type: ['number', 'null'] },
                stop2: { type: ['number', 'null'] },
                variant_bases: { type: ['string', 'null'] },
            },
            type: 'object',
        },
        description: { type: 'string' },
        entrez_id: { type: 'number' },
        entrez_name: { type: 'string' },
        id: { type: 'number' },
        name: { type: 'string' },
        variant_types: {
            items: {
                name: { type: 'string' },
                so_id: { type: 'string' },
                type: 'object',
            },
            type: 'array',
        },
    },
    type: 'object',
});

/**
 * Convert the CIViC relevance types to GraphKB terms
 */
const getRelevance = async ({ rawRecord, conn }) => {
    const translateRelevance = ({ evidenceType, clinicalSignificance, evidenceDirection }) => {
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

            case 'Functional': {
                return clinicalSignificance.toLowerCase();
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
            `unable to process relevance (${JSON.stringify({ clinicalSignificance, evidenceDirection, evidenceType })})`,
        );
    };

    // translate the type to a GraphKB vocabulary term
    let relevance = translateRelevance({
        clinicalSignificance: rawRecord.clinical_significance,
        evidenceDirection: rawRecord.evidence_direction,
        evidenceType: rawRecord.evidence_type,
    }).toLowerCase();

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
                filters: [
                    { source: { filters: { name: NCIT_SOURCE_DEFN.name }, target: 'Source' } },
                    { sourceId: drugRecord.ncit_id },
                ],
                sort: orderPreferredOntologyTerms,
                target: 'Therapy',
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


const getVariantName = (name, variantTypes = []) => {
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
    } if (result.includes(' fusion ')) {
        return 'fusion';
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
            content: {
                description: `${VOCAB[rawRecord.evidence_level]} ${VOCAB[rawRecord.rating] || ''}`,
                displayName: `${SOURCE_DEFN.displayName} ${level.toUpperCase()}`,
                name: level,
                source: rid(sources.civic),
                sourceId: level,
                url: VOCAB.url,
            },
            existsOk: true,
            fetchConditions: { AND: [{ sourceId: level }, { name: level }, { source: rid(sources.civic) }] },
            target: 'EvidenceLevel',

        });
        EVIDENCE_LEVEL_CACHE[level.sourceId] = level;
    } else {
        level = EVIDENCE_LEVEL_CACHE[level];
    }
    return level;
};


const createHgvsVariant = async (conn, feature, variantName) => {
    let match,
        cds;

    if (match = /^(\S+)\s\((c\.\d+\S+)\)$/.exec(variantName) && !/^[cg]\..*/.exec(variantName)) {
        try {
            cds = await createHgvsVariant(conn, feature, match[2]);
            [, variantName] = match;
        } catch (err) {
            logger.error(`${variantName} ${err}`);
        }
    }
    const parsed = kbParser.variant.parse(
        `${/^[cpe]\..*/.exec(variantName)
            ? ''
            : 'p.'}${variantName}`, false,
    ).toJSON();
    const variantClass = await conn.getVocabularyTerm(parsed.type);
    Object.assign(parsed, {
        reference1: rid(feature),
        type: rid(variantClass),
    });

    const variant = await conn.addVariant({
        content: parsed,
        existsOk: true,
        target: 'PositionalVariant',
    });

    if (cds) {
        await conn.addRecord({
            content: { in: rid(variant), out: rid(cds) },
            target: 'Infers',
        });
    }

    return variant;
};


/**
 * @param {ApiConnection} conn connection to GraphKB
 * @param {*} inputFusionName  the variant name from CIVIc
 * @param {*} feature the graphkb gene record linked to this variant in CIVIc (fetched by entrez ID)
 */
const processFusionVariants = async (conn, inputFusionName, feature) => {
    const compareGeneNames = (gene1, gene2) => {
        if (['abl1', 'abl'].includes(gene1) && ['abl1', 'abl'].includes(gene2)) {
            return true;
        } if (gene1 === gene2) {
            return true;
        }
        return false;
    };

    if ((inputFusionName.match(/-/g) || []).length > 1) {
        throw new Error(`multiple hyphens in fusion name (${inputFusionName}). Unable to parse second gene name`);
    }
    const fusionName = inputFusionName.toLowerCase();
    let missingGene,
        reference1,
        reference2,
        mutations;

    try {
        [, reference1,, reference2,, mutations] = /([^-\s]+)(-([^-\s]+))?(\s+fusion)?(\s+[^-\s]+)*$/.exec(fusionName);

        if (mutations) {
            mutations = mutations.trim();
        }
    } catch (err) {
        throw new Error(`Fusion name (${inputFusionName}) does not match the expected pattern`);
    }

    if (compareGeneNames(feature.name, reference1)) {
        reference1 = feature.name;
        missingGene = reference2;
    } else if (reference2 && compareGeneNames(feature.name, reference2)) {
        reference2 = feature.name;
        missingGene = reference1;
    } else if (reference2) {
        throw new Error(`Fusion gene names (${reference1},${reference2}) do not match the linked gene name (${feature.name})`);
    }

    let otherFeature = null;

    if (missingGene) {
        const search = await _entrezGene.fetchAndLoadBySymbol(conn, missingGene);

        if (search.length !== 1) {
            throw new Error(`unable to find specific (${search.length}) gene for symbol (${missingGene})`);
        }
        [otherFeature] = search;
    }
    const fusionType = await conn.getVocabularyTerm('fusion');
    const result = [];


    if (mutations) {
        const exonsMatch = /^[a-z](\d+);[a-z](\d+)$/.exec(mutations);

        if (exonsMatch && otherFeature) {
            const [, exon1, exon2] = exonsMatch;
            const fusion = await conn.addVariant({
                content: {
                    break1Repr: `e.${exon1}`,
                    break1Start: {
                        '@class': 'ExonicPosition',
                        pos: exon1,
                    },
                    break2Repr: `e.${exon2}`,
                    break2Start: {
                        '@class': 'ExonicPosition',
                        pos: exon2,
                    },
                    reference1: compareGeneNames(feature.name, reference1)
                        ? rid(feature)
                        : rid(otherFeature),
                    reference2: compareGeneNames(feature.name, reference1)
                        ? rid(otherFeature)
                        : rid(feature),
                    type: rid(fusionType),
                },
                existsOk: true,
                target: 'PositionalVariant',
            });
            return [fusion];
        }

        for (const mutation of mutations.split(/\s+/g).filter(m => m.trim())) {
            const variant = await processVariantRecord(conn, { name: mutation }, feature);
            result.push(...variant);
        }
    }
    const fusion = await conn.addVariant({
        content: {
            reference1: compareGeneNames(feature.name, reference1)
                ? rid(feature)
                : rid(otherFeature, true),
            reference2: compareGeneNames(feature.name, reference1)
                ? rid(otherFeature, true)
                : rid(feature),
            type: rid(fusionType),
        },
        existsOk: true,
        target: 'CategoryVariant',
    });
    result.push(fusion);

    return result;
};

/**
 * Given some variant record and a feature, process the variant and return a GraphKB equivalent
 */
const processVariantRecord = async (conn, { name, variant_types: variantTypes }, feature) => {
    // get the feature (entrez name appears to be synonymous with hugo symbol)
    const result = [];
    // based on discussion with cam here: https://www.bcgsc.ca/jira/browse/KBDEV-844
    const SUBS = {
        'E746_T751>I': 'E746_T751delinsI',
        'EML4-ALK C1156Y-L1196M': 'EML4-ALK and C1156Y and L1196M',
        'EML4-ALK C1156Y-L1198F': 'EML4-ALK and C1156Y and L1198F',
        'EML4-ALK G1202R-L1196M': 'EML4-ALK and G1202R and L1196M',
        'EML4-ALK G1202R-L1198F': 'EML4-ALK and G1202R and L1198F',
        'EML4-ALK L1196M-L1198F': 'EML4-ALK and L1196M and L1198F',
        'EML4-ALK T1151INST': 'EML4-ALK and T1151_?1152insT',
        K558NP: 'K558delKinsNP',
        T1151insT: 'T1151_?1152insT',
        'V600E AMPLIFICATION': 'V600E and AMPLIFICATION',
        'V600E+V600M': 'V600E and V600M',
        'V600_K601>E': 'V600_K601delVKinsE',
        'del 755-759': '?755_?759del',
        'di842-843vm': 'D842_I843delDIinsVM',
        'g12/g13': '(G12_G13)mut',
        'p26.3-25.3 11mb del': 'y.p26.3_p25.3del',
    };

    const variants = (SUBS[name] || name).replace(' + ', ' and ').split(' and ').map(v => v.trim()).filter(v => v);

    for (const variant of variants) {
        // parse the variant record
        const variantName = getVariantName(variant, variantTypes || []);

        if (/^\s*rs\d+\s*$/gi.exec(variantName)) {
            const [rsVariant] = await _snp.fetchAndLoadByIds(conn, [variantName]);

            if (rsVariant) {
                result.push(rsVariant);
                continue;
            }
        }

        if (variantName === 'fusion' && (/\s+fusion\s+\S+/gi.exec(variant) || variant.includes('-'))) {
            const fusionVariants = await processFusionVariants(conn, variant, feature);
            result.push(...fusionVariants);
            continue;
        }

        try {
            let variantClass;

            // try to fetch civic specific term first
            try {
                variantClass = await conn.getVocabularyTerm(variantName, SOURCE_DEFN.name);
            } catch (err) {
                variantClass = await conn.getVocabularyTerm(variantName);
            }
            const catVariant = await conn.addVariant({
                content: {
                    reference1: rid(feature),
                    type: rid(variantClass),
                },
                existsOk: true,
                target: 'CategoryVariant',
            });
            result.push(catVariant);
        } catch (err) {
            const hgvsVariant = await createHgvsVariant(conn, feature, variant);
            result.push(hgvsVariant);
        }
    }
    return result;
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
    let variants;

    try {
        variants = await processVariantRecord(conn, rawRecord.variant, feature);
        logger.info(`converted variant name (${rawRecord.variant.name}) to variants (${variants.map(v => v.displayName).join(', and ')})`);
    } catch (err) {
        logger.error(`evidence (${rawRecord.id}) Unable to process the variant (id=${rawRecord.variant.id}, name=${rawRecord.variant.name}): ${err}`);
        throw err;
    }
    // get the disease by doid
    let diseaseQueryFilters = {};

    if (rawRecord.disease.doid) {
        diseaseQueryFilters = {
            AND: [
                { sourceId: `doid:${rawRecord.disease.doid}` },
                { source: { filters: { name: 'disease ontology' }, target: 'Source' } },
            ],
        };
    } else {
        diseaseQueryFilters = { name: rawRecord.disease.name };
    }
    let disease;

    try {
        disease = await conn.getUniqueRecordBy({
            filters: diseaseQueryFilters,
            sort: orderPreferredOntologyTerms,
            target: 'Disease',
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
        conditions: [...variants.map(v => rid(v))],
        description: rawRecord.description,
        evidence: [rid(publication)],
        evidenceLevel: rid(level),
        relevance: rid(relevance),
        reviewStatus: 'not required',
        source: rid(sources.civic),
        sourceId: rawRecord.id,
    };

    // create the statement and connecting edges
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
    } if (rawRecord.evidence_type === 'Functional') {
        content.subject = rid(feature);
    }

    if (content.subject && !content.conditions.includes(content.subject)) {
        content.conditions.push(content.subject);
    }

    if (!content.subject) {
        throw Error(`unable to determine statement subject for evidence (${content.sourceId}) record`);
    }
    await conn.addRecord({
        content,
        existsOk: true,
        fetchExisting: false,
        target: 'Statement',
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
            json: true,
            method: 'GET',
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
    const counts = { error: 0, skip: 0, success: 0 };
    let expectedPages = 1,
        currentPage = 1;

    const allRecords = [];
    const errorList = [];

    // get the aproved entries
    while (currentPage <= expectedPages) {
        const url = `${urlTemplate}&page=${currentPage}`;
        logger.info(`loading: ${url}`);
        const resp = await request({
            json: true,
            method: 'GET',
            uri: url,
        });
        expectedPages = resp._meta.total_pages;
        logger.info(`loaded ${resp.records.length} records`);
        allRecords.push(...resp.records);
        currentPage++;
    }

    // now find entries curated by trusted curators
    const { results: trustedSubmissions } = await request({
        body: {
            entity: 'evidence_items',
            operator: 'AND',
            queries: [{ condition: { name: 'is_equal_to', parameters: [`${TRUSTED_CURATOR_ID}`] }, field: 'submitter_id' }],
            save: true,
        },
        json: true,
        method: 'POST',
        uri: `${baseUrl}/evidence_items/search`,
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
            errorList.push({ error: err, errorMessage: err.toString(), record });
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
    return { counts, errorList, records };
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
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
        target: 'Source',
    });

    let previouslyEntered = await conn.getRecords({
        filters: { source: rid(source) },
        returnProperties: ['sourceId'],
        target: 'Statement',
    });
    previouslyEntered = new Set(previouslyEntered.map(r => r.sourceId));
    logger.info(`Found ${previouslyEntered.size} records previously added from ${SOURCE_DEFN.name}`);
    logger.info('caching publication records');
    _pubmed.preLoadCache(conn);

    const varById = await downloadVariantRecords();
    const { records, errorList, counts } = await downloadEvidenceRecords(opt.url || BASE_URL);


    logger.info(`Processing ${records.length} records`);
    counts.exists = counts.exists || 0;

    for (const record of records) {
        record.variants = [varById[record.variant_id]]; // OR-ing of variants

        if (record.drugs === undefined || record.drugs.length === 0) {
            record.drugs = [null];
        }

        if (previouslyEntered.has(`${record.id}`)) {
            counts.exists += record.drugs.length;
            continue;
        }

        let orCombination;

        if (orCombination = /^([a-z]\d+)([a-z])\/([a-z])$/i.exec(record.variants[0].name)) {
            const [, prefix, tail1, tail2] = orCombination;
            record.variants = [
                { ...record.variants[0], name: `${prefix}${tail1}` },
                { ...record.variants[0], name: `${prefix}${tail2}` },
            ];
        }

        for (const variant of record.variants) {
            for (const drug of record.drugs) {
                try {
                    logger.debug(`processing ${record.id}`);
                    await processEvidenceRecord({
                        conn,
                        rawRecord: { ..._.omit(record, ['drugs', 'variants']), drug, variant },
                        sources: { civic: source },
                    });
                    counts.success += 1;
                } catch (err) {
                    if (err.toString().includes('is not a function')) {
                        console.error(err);
                    }
                    errorList.push({ error: err, errorMessage: err.toString(), record });
                    logger.error(`evidence (${record.id}) ${err}`);
                    counts.error += 1;
                }
            }
        }
    }
    logger.info(JSON.stringify(counts));
    const errorJson = `${errorLogPrefix}-civic.json`;
    logger.info(`writing ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify(errorList, null, 2));
};

module.exports = {
    SOURCE_DEFN,
    getVariantName,
    kb: true,
    specs: { validateEvidenceSpec, validateVariantSpec },
    upload,
};
