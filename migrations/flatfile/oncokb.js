/**
 * Import the publically available OncoKB JSON files into the OncoKB
 *
 * https://github.com/oncokb/oncokb-public/tree/master/data
 *
 * @module oncokb
 */
const request = require('request-promise');
const {addRecord, getRecordBy, orderPreferredOntologyTerms, getPubmedArticle, preferredDiseases, preferredDrugs} = require('./util');
const {ParsingError} = require('./../../app/repo/error');

const SOURCE_NAME = 'oncokb';

const VOCABULARY_MAPPING = {
    'oncogenic mutations': 'oncogenic mutation',
    fusions: 'fusion',
    'truncating mutations': 'truncating',
    'microsatellite instability-high': 'high microsatellite instability'

};

const DISEASE_MAPPING = {
    'all tumors': 'disease of cellular proliferation',
    'cns cancer': 'central nervous system cancer',
    'non-langerhans cell histiocytosis/erdheim-chester disease': 'non-langerhans-cell histiocytosis'
};

const THERAPY_MAPPING = {
    debio1347: 'debio-1347'
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
 * @param opt {object} options
 * @param opt.conn {ApiConnection} the connection object for sending requests to the GraphKB server
 * @param opt.rawRecord {object} the record directly from OncoKB
 * @param opt.source {object} the oncokb source object
 * @param opt.pubmedSource {object} the source object for pubmed entries
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
    const {conn, rawRecord, source, pubmedSource} = opt;
    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    let variant;
    if (rawRecord.gene === 'other biomarkers') {
        try {
            variant = await getRecordBy('vocabulary', {name: rawRecord.variant}, conn);
        } catch (err) {}
    }
    if (! variant) {
        let gene1 = await getRecordBy('features', {
            biotype: 'gene',
            name: rawRecord.gene,
            source: {name: 'hgnc'}
        }, conn, orderPreferredOntologyTerms);
        let gene2 = null;

        // determine the type of variant we are dealing with
        variant = rawRecord.variant.toLowerCase();
        let match = /^([a-z])?(\d+)_([a-z])?(\d+)splice$/.exec(variant);
        if (match) {
            variant = `(${match[1] || '?'}${match[2]}_${match[3] || '?'}${match[4]})spl`;
        } else if (variant.endsWith('_splice')) {
            variant = variant.replace('_splice', 'spl');
        } else if (match = /^([^-\s]+)-([^-\s]+) fusion$/.exec(variant)) {
            if (match[1].toLowerCase() === gene1.name) {
                gene2 = await getRecordBy('features', {
                    name: match[2],
                    biotype: 'gene',
                    source: {name: 'hgnc'}}, conn, orderPreferredOntologyTerms);
            } else if (match[2].toLowerCase() === gene1.name) {
                gene2 = gene1;
                gene1 = await getRecordBy('features', {
                    name: match[1],
                    biotype: 'gene',
                    source: {name: 'hgnc'}}, conn, orderPreferredOntologyTerms);
            } else {
                throw new Error(`the fusion in the variant ${variant} does not match the name of the gene feature ${gene1.name}`);
            }
            variant = 'fusion';
        } else if (match = /^exon (\d+) (mutation|insertion|deletion|deletion\/insertion)s?$/.exec(variant)) {
            if (match[2] === 'deletion/insertion') {
                variant = `e.${match[1]}delins`;
            } else {
                variant = `e.${match[1]}${match[2].slice(0, 3)}`;
            }
        }
        if (VOCABULARY_MAPPING[variant] !== undefined) {
            variant = VOCABULARY_MAPPING[variant];
        }

        // if it fits one of the known term types usethat, otherwise attempt to parse as if protein notation
        let variantUrl;
        let variantType;
        try {
            variantType = await getRecordBy('vocabulary', {name: variant}, conn);
            variantUrl = 'categoryvariants';
            variant = {};
        } catch (err) {
            variant = await request(conn.request({
                method: 'POST',
                uri: 'parser/variant',
                body: {content: `${variant.startsWith('e.') ? '' : 'p.'}${variant}`}
            }));
            variant = variant.result;
            variantUrl = 'positionalvariants';
            variantType = await getRecordBy('vocabulary', {name: variant.type}, conn);
        }
        variant.reference1 = gene1['@rid'];
        if (gene2) {
            variant.reference2 = gene2['@rid'];
        }
        variant.type = variantType['@rid'];
        // create the variant
        variant = await addRecord(variantUrl, variant, conn, true);
    }
    // next attempt to find the cancer type (oncotree?)
    let disease;
    try {
        disease = await getRecordBy('diseases', {
            name: rawRecord.cancerType,
        }, conn, preferredDiseases);
    } catch (err) {
        if (rawRecord.cancerType.includes('/')) {
            disease = await getRecordBy('diseases', {
                name: rawRecord.cancerType.split('/')[0].trim(),
            }, conn, preferredDiseases);
        } else {
            throw err;
        }
    }

    // find the drug
    let drug;
    try {
        drug = await getRecordBy('therapies', {name: rawRecord.drug}, conn, preferredDrugs);
    } catch (err) {
        if (rawRecord.drug.includes('+')) {
            // add the combination therapy as a new therapy defined by oncokb
            drug = await addTherapyCombination(conn, source, rawRecord.drug);
        } else {
            throw err;
        }
    }



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
    let successCount = 0;
    const levels = await addEvidenceLevels(conn, source);
    //console.log(Object.keys(terms));
    for (let rawRecord of records) {
        for (let drug of Array.from(rawRecord.drugs.split(','), x => x.trim().toLowerCase()).filter(x => x.length > 0)) {
            rawRecord.drug = THERAPY_MAPPING[drug] === undefined
                ? drug
                : THERAPY_MAPPING[drug];
            rawRecord.cancerType = rawRecord.cancerType.toLowerCase().trim();
            rawRecord.cancerType = DISEASE_MAPPING[rawRecord.cancerType] === undefined
                ? rawRecord.cancerType
                : DISEASE_MAPPING[rawRecord.cancerType];

            rawRecord.variant = VOCABULARY_MAPPING[rawRecord.variant] === undefined
                ? rawRecord.variant
                : VOCABULARY_MAPPING[rawRecord.variant];

            try {
                await processActionableRecord({
                    conn, rawRecord, source, pubmedSource
                });
                successCount++;
            } catch(err) {
                console.log('\n', err.error ? err.error.message : err.message || err, `variant: ${rawRecord.variant}`);
                errorCount++;
            }
        }
    }
    console.log('\n', {successCount, errorCount, total: errorCount + successCount});
};

module.exports = {upload, preferredDrugs, preferredDiseases};