/**
 * Import the Clinical Evidence summaries from the public Civic database
 * http://griffithlab.org/civic-api-docs/#endpoint-types
 * https://civicdb.org/api/evidence_items
 */
const {addRecord, getRecordBy, getPubmedArticle, orderPreferredOntologyTerms} = require('./util');
const {preferredDrugs, preferredDiseases} = require('./oncokb');
const request = require('request-promise');
const _ = require('lodash');
const SOURCE_NAME = 'civic';

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

const VARIANT_CACHE = {};  // cache variants from CIViC by CIVic ID
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
    'pd184352': 'pd-184352'
};

/**
 * Convert the CIViC relevance types to GraphKB terms
 */
const getRelevance = (evidenceType, clinicalSignificance) => {
    switch (evidenceType) {
        case 'Predictive': {
            switch (clinicalSignificance) {
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
            switch (clinicalSignificance) {
                case 'Positive': { return 'favours diagnosis'; }
                case 'Negative': { return 'opposes diagnosis'; }
            }
            break;
        }
        case 'Prognostic': {
            switch (clinicalSignificance) {
                case 'Poor Outcome': { return 'unfavourable prognosis'; }
                case 'Better Outcome': { return 'favourable prognosis'; }
            }
            break;
        }
    }
    throw new Error(`unrecognized evidence type (${evidenceType}) or clinical significance (${clinicalSignificance})`);
};


const getDrug = async (conn, name) => {
    if (THERAPY_MAPPING[name] !== undefined) {
        name = THERAPY_MAPPING[name];
    }
    try {
        const drug = await getRecordBy('therapies', {name}, conn, preferredDrugs);
        return drug;
    } catch (err) {
        let match = /^\s*(\S+)\s*\([^\)]+\)$/.exec(name);
        if (match) {
            return getRecordBy('therapies', {name: match[1]}, conn, preferredDrugs);
        }
        throw err;
    }
};


const parseVariant = (string) => {
    string = string.toLowerCase().trim();
    switch (string) {
        case 'loss-of-function':
        case 'overexpression':
        case 'expression':
        case 'amplification':
        case 'mutation': {
            return string.replace('-', ' ');
        }
        case 'frameshift truncation': { return 'frameshift'; }
        case 'itd': { return 'internal tandem duplication (itd)'; }
    }
    return string;
}


/**
 * Transform a CIViC evidence record into a GraphKB statement
 */
const processEvidenceRecord = async (opt) => {
    const {conn, rawRecord, source, pubmedSource} = opt;
    const result = {};
    // get the evidenceLevel
    let level = `${rawRecord.evidence_level}${rawRecord.rating}`;
    level = await addRecord('evidencelevels', {
        name: level,
        sourceId: level,
        source: source['@rid'],
        description: `${VOCAB[rawRecord.evidence_level]} ${VOCAB[rawRecord.rating]}`,
        url: VOCAB.url
    }, conn, true, ['url', 'description']);
    // translate the type to a GraphKB vocabulary term
    let relevance = getRelevance(rawRecord.evidence_type, rawRecord.clinical_significance);
    relevance = await getRecordBy('vocabulary', {name: relevance}, conn);

    // get the variant record by ID
    if (VARIANT_CACHE[rawRecord.variant_id] === undefined) {
        VARIANT_CACHE[rawRecord.variant_id] = await request({
            method: 'GET',
            json: true,
            uri: `https://civicdb.org/api/variants/${rawRecord.variant_id}`
        });
    }
    const variantRec = VARIANT_CACHE[rawRecord.variant_id];
    // get the feature (entrez name appears to be synonymous with hugo symbol)
    const feature = await getRecordBy('features', {name: variantRec.entrez_name, source: {name: 'hgnc'}}, conn, orderPreferredOntologyTerms);
    // parse the variant record
    let variant = parseVariant(variantRec.name);
    try {
        const variantClass = await getRecordBy('vocabulary', {name: variant}, conn);
        variant = await addRecord('categoryvariants', {type: variantClass['@rid'], reference1: feature['@rid']}, conn, true);
    } catch (err) {
        variant = await request(conn.request({
            method: 'POST',
            uri: 'parser/variant',
            body: {content: `p.${variant}`}
        }));
        if (variant.result.untemplatedSeq === undefined) {
            variant.result.untemplatedSeq = null;
        }
        const variantClass = await getRecordBy('vocabulary', {name: variant.result.type}, conn);
        variant = await addRecord('positionalvariants', Object.assign(variant.result, {
            reference1: feature['@rid'],
            type: variantClass['@rid']
        }), conn, true);
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
        publication = await addRecord('publications', Object.assign(publication, {source: pubmedSource['@rid']}), conn, true);
    }
    // create the statement and connecting edges
    if (rawRecord.evidence_type === 'Diagnostic') {
        return await addRecord('statements', {
            impliedBy: [{target: variant['@rid']}],
            supportedBy: [{target: publication['@rid'], source: source['@rid'], level: level['@rid']}],
            relevance: relevance['@rid'],
            appliesTo: disease['@rid'],
            description: rawRecord.description
        }, conn);
    } else if (rawRecord.evidence_type === 'Predictive' && drug) {
        return await addRecord('statements', {
            impliedBy: [{target: variant['@rid']}, {target: disease['@rid']}],
            supportedBy: [{target: publication['@rid'], source: source['@rid'], level: level['@rid']}],
            relevance: relevance['@rid'],
            appliesTo: drug['@rid'],
            description: rawRecord.description
        }, conn);
    } else if (rawRecord.evidence_type === 'Prognostic') {
        return await addRecord('statements', {
            impliedBy: [{target: variant['@rid']}, {target: disease['@rid']}],
            supportedBy: [{target: publication['@rid'], source: source['@rid'], level: level['@rid']}],
            relevance: relevance['@rid'],
            appliesTo: null,
            description: rawRecord.description
        }, conn);
    }
    throw new Error('unable to make statement', relevance.name);
};

const upload = async (conn) => {
    let urlTemplate = 'https://civicdb.org/api/evidence_items?count=500&status=accepted';
    // load directly from their api
    let errorCount = 0;
    let totalCount = 0;
    let successCount = 0;
    let skipCount = 0;
    let expectedPages = 1;
    let currentPage = 1;

    // add the source node
    const source = await addRecord('sources', {
        name: SOURCE_NAME,
        usage: 'https://creativecommons.org/publicdomain/zero/1.0',
        url: 'https://civicdb.org'
    }, conn, true);

    const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, true);

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


        for (let record of resp.records) {
            if (record.evidence_direction === 'Does Not Support' || record.evidence_type === 'Predisposing') {
                skipCount++;
                continue;
            }
            if (record.drugs === undefined || record.drugs.length === 0) {
                record.drugs = [null];
            }
            for (let drug of record.drugs) {
                totalCount++;
                try {
                    const parsed = await processEvidenceRecord({
                        conn, source, pubmedSource,
                        rawRecord: Object.assign({drug}, _.omit(record, ['drugs']))
                    });
                    successCount++;
                } catch (err) {
                    if (! err.error || err.error.name != 'ParsingError') {
                        console.log();
                        console.error(err.error || err);
                    }
                    errorCount++;
                }
            }
        }
        console.log({errorCount, successCount, skipCount, totalCount});
        currentPage++;
    }
    console.log();
    console.log({errorCount, totalCount, skipCount, successCount});
};

module.exports = {upload};