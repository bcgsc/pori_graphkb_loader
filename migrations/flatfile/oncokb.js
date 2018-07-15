/**
 * Import the publically available OncoKB JSON files into the OncoKB
 *
 * https://github.com/oncokb/oncokb-public/tree/master/data
 *
 * @module oncokb
 */
const request = require('request-promise');
const {addRecord, getRecordBy, orderPreferredOntologyTerms, getPubmedArticle} = require('./util');
const {ParsingError} = require('./../../app/repo/error');

const SOURCE_NAME = 'oncokb';

const preferredDiseases = (disease1, disease2) => {
    if (orderPreferredOntologyTerms(disease1, disease2) === 0) {
        if (disease1.source.name !== disease2.source.name) {
            if (disease1.source.name === 'oncotree') {
                return -1;
            } else if (disease2.source.name === 'oncotree') {
                return 1;
            }
        }
        return 0;
    } else {
        return orderPreferredOntologyTerms(disease1, disease2);
    }
};

const preferredDrugs = (term1, term2) => {
    if (orderPreferredOntologyTerms(term1, term2) === 0) {
        if (term1.source.name !== term2.source.name) {
            if (term1.source.name === 'drugbank') {
                return -1;
            } else if (term2.source.name === 'drugbank') {
                return 1;
            }
        }
        return 0;
    } else {
        return orderPreferredOntologyTerms(term1, term2);
    }
};

const preferredVocabulary = (term1, term2) => {
    if (term1.source.name !== term2.source.name) {
        if (term1.source.name === SOURCE_NAME) {
            return -1;
        } else if (term2.source.name === SOURCE_NAME) {
            return 1;
        }
    }
    return 0;
}

const addTherapyCombination = async (conn, source, name) => {
    const drugs = Array.from(name.split(/\s*\+\s*/), x => x.trim().toLowerCase()).filter(x => x.length > 0);
    drugs.sort();
    if (drugs.length < 2) {
        throw new Error(`${name} is not a combination therapy`);
    }
    const drugRec = [];
    for (let drug of drugs) {
        drugRec.push(await getRecordBy('therapies', {name: drug}, conn, preferredDrugs));
    }
    const combinationName = Array.from(drugRec, x => x.name || x.sourceId).join(' + ');
    const combination = await addRecord('therapies', {
        name: combinationName,
        sourceId: combinationName,
        source: source['@rid']
    }, conn, true);
    for (let drug of drugRec) {
        await addRecord('elementOf', {source: source['@rid'], out: drug['@rid'], in: combination['@rid']}, conn, true);
    }
    return combination;
}


/**
 * Parses an actionable record from OncoKB and querys the GraphKB for existing terms
 * Converts this record into a GraphKB statement (where possible) and uploads the statement to the GraphKB
 *
 * @param rawRecord {object} the actionable variant JSON record from oncoKB
 *
 * Expected types:
 * - Oncogenic Mutations
 * - Amplification
 * - Fusions
 * - X1008_splice
 * - BCR-ABL1 Fusion
 * - 981_1028splice
 * - T574insTQLPYD
 * - Wildtype
 * - 560_561insER
 * - Exon 9 mutations
 */
const processActionableRecord = async (opt) => {
    // first try to retrieve the gene rawRecord
    const {conn, rawRecord, source, terms, pubmedSource} = opt;
    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    const gene = await getRecordBy('features', {
        biotype: 'gene',
        name: rawRecord.gene,
        source: {name: 'hgnc'}
    }, conn, orderPreferredOntologyTerms);
    // next attempt to find the cancer type (oncotree?)
    const disease = await getRecordBy('diseases', {
        name: rawRecord.cancerType,
    }, conn, preferredDiseases);

    // find the drug
    let drug;
    try {
        drug = await getRecordBy('therapies', {name: rawRecord.drug}, conn, preferredDrugs);
    } catch (err) {
        if (rawRecord.drug.includes('+')) {
            drug = await addTherapyCombination(conn, source, rawRecord.drug);
        } else {
            throw err;
        }
    }

    // determine the type of variant we are dealing with
    let variant = rawRecord.variant;
    let match = /^([A-Z])?(\d+)_([A-Z])?(\d+)splice$/.exec(variant);
    if (match) {
        variant = `(${match[1] || '?'}${match[2]}_${match[3] || '?'}${match[4]})spl`;
    } else if (variant.endsWith('_splice')) {
        variant = variant.replace('_splice', 'spl');
    } else if (match = /^([a-z0-9]+)-([a-z0-9]+) fusion$/.exec(variant)) {
    }

    // if it fits one of the known term types usethat, otherwise attempt to parse as if protein notation
    let variantUrl;
    if (terms[variant.toLowerCase()] !== undefined) {
        variant = {
            type: variant.toLowerCase()
        };
        variantUrl = 'categoryvariants'
    } else {
        variant = await request(conn.request({
            method: 'POST',
            uri: 'parser/variant',
            body: {content: `p.${variant}`}
        }));
        variant = variant.result;
        variantUrl = 'positionalvariants';
    }
    variant.reference1 = gene['@rid'];
    variant.type = await getRecordBy('vocabulary', {sourceId: variant.type}, conn, preferredVocabulary);
    variant.type = variant.type['@rid'];
    // create the variant
    variant = await addRecord(variantUrl, variant, conn, true);

    // get the evidence level and determine the relevance
    const level = await getRecordBy('evidencelevels', {sourceId: rawRecord.level, source: source['@rid']}, conn);

    let relevance = level.name.startsWith('r')
        ? 'resistance'
        : 'sensitivity';
    relevance = await getRecordBy('vocabulary', {name: relevance}, conn);

    // find/add the publications
    const publications = [];
    const pubmedIds = Array.from(rawRecord.pmids.split(/[,\s]+/)).filter(x => x.trim().length > 0);
    for (let pmid of pubmedIds) {
        let publication;
        try {
            publication = await getRecordBy('publications', {sourceId: pmid, source: {name: 'pubmed'}}, conn);
        } catch (err) {
            publication = await getPubmedArticle(pmid);
            publication = await addRecord('publications', Object.assign(publication, {
                source: pubmedSource['@rid']
            }), conn, true);
        }
        publications.push(publication);
    }

    // make the actual statement
    const statement = await addRecord('statements', {
        impliedBy: [{target: variant['@rid']}, {target: disease['@rid']}],
        supportedBy: Array.from(publications, (x) => {
            return {target: x['@rid'], source: source['@rid'], level: level['@rid']};
        }),
        relevance: relevance['@rid'],
        appliesTo: drug['@rid']
    }, conn);
    return statement;
};



/**
 * Add the oncokb evidence level terms. Pulls data from: http://oncokb.org/api/v1/levels
 */
const addEvidenceLevels = async (conn, source) => {
    const URL = 'http://oncokb.org/api/v1/levels';
    const levels = await request({
        method: 'GET',
        uri: URL,
        json: true
    });
    const result = {};
    for (let [level, desc] of Object.entries(levels)) {
        if (! /^LEVEL_[A-Z0-9]+$/.exec(level)) {
            throw new ParsingError({
                message: `Error in parsing the level name: ${level}`,
                expected: '/^LEVEL_[A-Z0-9]+$/',
                observed: level
            });
        }
        level = level.slice('LEVEL_'.length);
        const record = await addRecord('evidencelevels', {
            source: source['@rid'],
            sourceId: level,
            name: level,
            description: desc,
            url: URL
        }, conn, true);
        result[level] = record;
    }
    return result;
}

/**
 * Pull the variant classifications from oncokb to add as potential terms
 */
const addClassificationTerms = async (conn, source) => {
    const URL = 'http://oncokb.org/api/v1/classification/variants';
    const records = await request({
        method: 'GET',
        uri: URL,
        json: true
    });
    const result = {};
    for (let classification of records) {
        const record = await addRecord('vocabulary', {
            source: source['@rid'],
            sourceId: classification,
            name: classification,
            url: URL
        }, conn, true);
        result[record.name] = record;
    }
    return result;
};


const upload = async (conn) => {
    const URL = 'http://oncokb.org/api/v1/utils/allActionableVariants';
    // load directly from their api:
    console.log(`loading: ${URL}`);
    const records = await request({
        method: 'GET',
        json: true,
        uri: URL
    });
    console.log(`loaded ${records.length} records`);
    // add the source node
    const source = await addRecord('sources', {
        name: SOURCE_NAME,
        usage: 'http://oncokb.org/#/terms',
        url: 'http://oncokb.org'
    }, conn, true);

    const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, true);
    let errorCount = 0;
    const levels = await addEvidenceLevels(conn, source);
    const terms = await addClassificationTerms(conn, source);
    //console.log(Object.keys(terms));
    for (let rawRecord of records) {
        for (let drug of Array.from(rawRecord.drugs.split(','), x => x.trim()).filter(x => x.length > 0)) {
            rawRecord.drug = drug;

            try {
                await processActionableRecord({
                    conn, rawRecord, source, terms, pubmedSource
                });
            } catch(err) {
                console.log(err.error ? err.error.message : err.message || err);
                errorCount++;
            }
        }
    }
    console.log('\nerrors:', errorCount);
};

module.exports = {upload, preferredDrugs};