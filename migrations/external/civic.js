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


const kbParser = require('@bcgsc/knowledgebase-parser');


const {
    addRecord,
    getRecordBy,
    getPubmedArticle,
    orderPreferredOntologyTerms,
    preferredDrugs,
    preferredDiseases
} = require('./util');

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

/**
 * Convert the CIViC relevance types to GraphKB terms
 */
const getRelevance = (evidenceType, clinicalSignificance) => {
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


const getDrug = async (conn, name) => {
    if (THERAPY_MAPPING[name] !== undefined) {
        name = THERAPY_MAPPING[name];
    }
    try {
        const drug = await getRecordBy('therapies', {name}, conn, preferredDrugs);
        return drug;
    } catch (err) {
        const match = /^\s*(\S+)\s*\([^)]+\)$/.exec(name);
        if (match) {
            return getRecordBy('therapies', {name: match[1]}, conn, preferredDrugs);
        }
        throw err;
    }
};


const parseVariant = (string) => {
    string = string.toLowerCase().trim();
    if ([
        'loss-of-function',
        'overexpression',
        'expression',
        'amplification',
        'mutation'].includes(string)
    ) {
        return string.replace(/-/g, ' ');
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
    if (SUBS[string] !== undefined) {
        return SUBS[string];
    }

    let match;
    if (match = /^(intron|exon) (\d+)(-(\d+))? (mutation|deletion|frameshift|insertion)$/i.exec(string)) {
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
    } if (match = /^([A-Z][^-\s]*)-([A-Z][^-\s]*)/i.exec(string)) {
        return 'fusion';
    } if (match = /^[A-Z][^-\s]* fusions?$/i.exec(string)) {
        return 'fusion';
    } if (match = /^\s*c\.\d+\s*[a-z]\s*>[a-z]\s*$/i.exec(string)) {
        return string.replace(/\s+/g, '');
    } if (string !== 'mutation' && string.endsWith('mutation')) {
        string = string.replace(/\s*mutation$/i, '');
    }
    return string;
};


const getFeature = async (conn, name) => {
    name = name.toString().toLowerCase().trim();
    if (FEATURE_CACHE[name] !== undefined) {
        return FEATURE_CACHE[name];
    }
    const feature = await getRecordBy(
        'features',
        {name, source: {name: 'hgnc'}},
        conn,
        orderPreferredOntologyTerms
    );
    FEATURE_CACHE[feature.name] = feature;
    return feature;
};


/**
 * Transform a CIViC evidence record into a GraphKB statement
 */
const processEvidenceRecord = async (opt) => {
    const {
        conn, rawRecord, source, pubmedSource
    } = opt;
    // get the evidenceLevel
    let level = `${rawRecord.evidence_level}${rawRecord.rating}`.toLowerCase();
    if (EVIDENCE_LEVEL_CACHE[level] === undefined) {
        level = await addRecord(
            'evidencelevels', {
                name: level,
                sourceId: level,
                source: source['@rid'],
                description: `${VOCAB[rawRecord.evidence_level]} ${VOCAB[rawRecord.rating]}`,
                url: VOCAB.url
            }, conn, {
                existsOk: true,
                getWhere: {sourceId: level, name: level, source: source['@rid']}
            }
        );
        EVIDENCE_LEVEL_CACHE[level.sourceId] = level;
    } else {
        level = EVIDENCE_LEVEL_CACHE[level];
    }
    // translate the type to a GraphKB vocabulary term
    let relevance = getRelevance(rawRecord.evidence_type, rawRecord.clinical_significance).toLowerCase();
    if (RELEVANCE_CACHE[relevance] === undefined) {
        relevance = await getRecordBy('vocabulary', {name: relevance}, conn);
        RELEVANCE_CACHE[relevance.name] = relevance;
    } else {
        relevance = RELEVANCE_CACHE[relevance];
    }

    const variantRec = rawRecord.variant;
    // get the feature (entrez name appears to be synonymous with hugo symbol)
    const feature = await getFeature(conn, variantRec.entrez_name);
    // parse the variant record
    let variant = parseVariant(variantRec.name),
        reference2 = null,
        reference1;
    if (variant === 'fusion' && variantRec.name.includes('-')) {
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
        const variantClass = await getRecordBy('vocabulary', {name: variant}, conn);
        const body = {
            type: variantClass['@rid'],
            reference1: reference1['@rid']
        };
        if (reference2) {
            body.reference2 = reference2['@rid'];
        }
        variant = await addRecord(
            'categoryvariants',
            body,
            conn,
            {
                existsOk: true,
                getWhere: Object.assign({
                    zygosity: null,
                    reference2: null,
                    germline: null
                }, body)
            }
        );
    } catch (err) {
        variant = kbParser.variant.parse(
            `${variant.startsWith('e.')
                ? ''
                : 'p.'}${variant}`, false
        ).toJSON();
        const variantClass = await getRecordBy('vocabulary', {name: variant.type}, conn);
        Object.assign(variant, {
            reference1: feature['@rid'],
            type: variantClass['@rid']
        });
        if (reference2) {
            variant.reference2 = reference2['@rid'];
        }
        variant = await addRecord(
            'positionalvariants',
            variant,
            conn,
            {
                existsOk: true,
                getWhere: Object.assign({
                    germline: null,
                    zygosity: null,
                    reference2: null,
                    break2Repr: null,
                    untemplatedSeq: null
                }, variant)
            }
        );
    }

    // get the disease by doid
    let disease = {};
    if (rawRecord.disease.doid) {
        disease.sourceId = `doid:${rawRecord.disease.doid}`;
        disease.source = {name: 'disease ontology'};
    } else {
        disease.name = rawRecord.disease.name;
    }
    disease = await getRecordBy('diseases', disease, conn, preferredDiseases);
    // get the drug(s) by name
    let drug;
    if (rawRecord.drug) {
        drug = await getDrug(conn, rawRecord.drug.name.toLowerCase().trim());
    }
    // get the publication by pubmed ID
    let publication;
    try {
        publication = await getRecordBy('publications', {
            sourceId: rawRecord.source.pubmed_id, source: {name: 'pubmed'}
        }, conn);
    } catch (err) {
        publication = await getPubmedArticle(rawRecord.source.pubmed_id);
        publication = await addRecord('publications', Object.assign(publication, {source: pubmedSource['@rid']}), conn, {existsOk: true});
    }
    // common content
    const content = {
        relevance: relevance['@rid'],
        source: source['@rid'],
        reviewStatus: 'not required',
        sourceId: rawRecord.id
    };
    const getWhere = Object.assign({
        ImpliedBy: {v: [variant['@rid']]},
        supportedBy: {v: [publication['@rid']], source: source['@rid'], level: level['@rid']}

    }, content);
    content.supportedBy = [{target: publication['@rid'], source: source['@rid'], level: level['@rid']}];
    content.impliedBy = [{target: variant['@rid']}];
    content.description = rawRecord.description;
    // create the statement and connecting edges
    if (!['Diagnostic', 'Predictive', 'Prognostic'].includes(rawRecord.evidence_type)) {
        throw new Error('unable to make statement', rawRecord.evidence_type, relevance.name);
    }
    if (rawRecord.evidence_type === 'Diagnostic') {
        content.appliesTo = getWhere.appliesTo = disease['@rid'];
    } else {
        content.impliedBy.push({target: disease['@rid']});
        getWhere.ImpliedBy = {v: [variant['@rid'], disease['@rid']]};
    }

    if (rawRecord.evidence_type === 'Predictive' && drug) {
        content.appliesTo = getWhere.appliesTo = drug['@rid'];
    } if (rawRecord.evidence_type === 'Prognostic') {
        content.appliesTo = getWhere.appliesTo = null;
    }
    return addRecord('statements', content, conn, {
        existsOk: true,
        getWhere
    });
};


const downloadVariantRecords = async () => {
    const varById = {};
    let expectedPages = 1,
        currentPage = 1;
    const urlTemplate = `${BASE_URL}/variants?count=500`;
    while (currentPage <= expectedPages) {
        const url = `${urlTemplate}&page=${currentPage}`;
        console.log(`\nloading: ${url}`);
        const resp = await request({
            method: 'GET',
            json: true,
            uri: url
        });
        expectedPages = resp._meta.total_pages;
        console.log(`loaded ${resp.records.length} records`);
        for (const record of resp.records) {
            if (varById[record.id] !== undefined) {
                throw new Error('variant record ID is not unique', record);
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
    const source = await addRecord('sources', {
        name: SOURCE_NAME,
        usage: 'https://creativecommons.org/publicdomain/zero/1.0',
        url: 'https://civicdb.org'
    }, conn, {existsOk: true});

    const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, {existsOk: true});
    const varById = await downloadVariantRecords();

    while (currentPage <= expectedPages) {
        const url = `${urlTemplate}&page=${currentPage}`;
        console.log(`\nloading: ${url}`);
        const resp = await request({
            method: 'GET',
            json: true,
            uri: url
        });
        expectedPages = resp._meta.total_pages;
        console.log(`loaded ${resp.records.length} records`);

        for (const record of resp.records) {
            if (record.evidence_direction === 'Does Not Support' || (record.clinical_significance === null && record.evidence_type === 'Predictive')) {
                counts.skip++;
                continue;
            }
            record.variant = varById[record.variant_id];
            if (record.drugs === undefined || record.drugs.length === 0) {
                record.drugs = [null];
            }
            for (const drug of record.drugs) {
                try {
                    await processEvidenceRecord({
                        conn,
                        source,
                        pubmedSource,
                        rawRecord: Object.assign({drug}, _.omit(record, ['drugs']))
                    });
                    counts.success++;
                } catch (err) {
                    console.error((err.error || err).message);
                    counts.error++;
                }
            }
        }
        console.log(counts);
        currentPage++;
    }
    console.log();
    console.log(counts);
};

module.exports = {upload};
