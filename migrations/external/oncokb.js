/**
 * | | |
 * | --- | --- |
 * | Source | OncoKB |
 * | About |  http://oncokb.org/#/about |
 * | Source Type | Knowledgebase |
 * | Data Example| Direct API Access |
 * | Data Format| JSON |
 *
 * @module migrations/external/oncokb
 */
const request = require('request-promise');
const {
    addRecord, getRecordBy, orderPreferredOntologyTerms, getPubmedArticle, preferredDiseases, preferredDrugs
} = require('./util');
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
    debio1347: 'debio 1347'
};


const addTherapyCombination = async (conn, source, name) => {
    const drugs = Array.from(name.split(/\s*\+\s*/), x => x.trim().toLowerCase()).filter(x => x.length > 0);
    drugs.sort();
    if (drugs.length < 2) {
        throw new Error(`${name} is not a combination therapy`);
    }
    const drugRec = [];
    for (const drug of drugs) {
        drugRec.push(await getRecordBy('therapies', {name: drug}, conn, preferredDrugs));
    }
    const combinationName = Array.from(drugRec, x => x.name || x.sourceId).join(' + ');
    const combination = await addRecord('therapies', {
        name: combinationName,
        sourceId: combinationName,
        source: source['@rid']
    }, conn, {existsOk: true});
    for (const drug of drugRec) {
        await addRecord('elementOf', {source: source['@rid'], out: drug['@rid'], in: combination['@rid']}, conn, {existsOk: true});
    }
    return combination;
};


const processVariant = async (opt) => {
    // first try to retrieve the gene rawRecord
    const {
        conn, rawRecord
    } = opt;
    let variant;
    if (rawRecord.gene === 'other biomarkers') {
        try {
            variant = await getRecordBy('vocabulary', {name: rawRecord.variant}, conn);
        } catch (err) {}
    }
    if (!variant) {
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
                    source: {name: 'hgnc'}
                }, conn, orderPreferredOntologyTerms);
            } else if (match[2].toLowerCase() === gene1.name) {
                gene2 = gene1;
                gene1 = await getRecordBy('features', {
                    name: match[1],
                    biotype: 'gene',
                    source: {name: 'hgnc'}
                }, conn, orderPreferredOntologyTerms);
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
        let variantUrl,
            variantType;
        const defaults = {
            zygosity: null,
            germline: null,
            reference2: null
        };
        try {
            variantType = await getRecordBy('vocabulary', {name: variant}, conn);
            variantUrl = 'categoryvariants';
            variant = {};
        } catch (err) {
            variant = await request(conn.request({
                method: 'POST',
                uri: 'parser/variant',
                body: {
                    content: `${variant.startsWith('e.')
                        ? ''
                        : 'p.'}${variant}`
                }
            }));
            variant = variant.result;
            variantUrl = 'positionalvariants';
            variantType = await getRecordBy('vocabulary', {name: variant.type}, conn);
            Object.assign(defaults, {
                untemplatedSeq: null,
                break1Start: null,
                break1End: null,
                break2Start: null,
                break2End: null,
                refSeq: null,
                truncation: null
            });
        }
        variant.reference1 = gene1['@rid'];
        if (gene2) {
            variant.reference2 = gene2['@rid'];
        }
        variant.type = variantType['@rid'];
        // create the variant
        variant = await addRecord(variantUrl, variant, conn, {existsOk: true, getWhere: Object.assign(defaults, variant)});
    }
    return variant;
};


const processDisease = async (opt) => {
    const {conn, diseaseName} = opt;
    // next attempt to find the cancer type (oncotree?)
    let disease;
    try {
        disease = await getRecordBy('diseases', {
            name: diseaseName
        }, conn, preferredDiseases);
    } catch (err) {
        if (diseaseName.includes('/')) {
            disease = await getRecordBy('diseases', {
                name: diseaseName.split('/')[0].trim()
            }, conn, preferredDiseases);
        } else {
            throw err;
        }
    }
    return disease;
};


/**
 * Given the list of pubmed IDs, add or retrieve the publication records
 */
const processPublicationsList = async (opt) => {
    // find/add the publications
    const {conn, pmidList, pubmedSource} = opt;
    const publications = [];
    const pubmedIds = Array.from(pmidList.split(/[,\s]+/)).filter(x => x.trim().length > 0);
    for (const pmid of pubmedIds) {
        let publication;
        try {
            publication = await getRecordBy('publications', {sourceId: pmid, source: {name: 'pubmed'}}, conn);
        } catch (err) {
            publication = await getPubmedArticle(pmid);
            publication = await addRecord('publications', Object.assign(publication, {
                source: pubmedSource['@rid']
            }), conn, {existsOk: true});
        }
        publications.push(publication);
    }
    return publications;
};


/**
 * Parses an actionable record from OncoKB and querys the GraphKB for existing terms
 * Converts this record into a GraphKB statement (where possible) and uploads the statement to the GraphKB
 * http://oncokb.org/api/v1/utils/allActionableVariants.json
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
    const {
        conn, rawRecord, source, pubmedSource
    } = opt;
    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    const variant = await processVariant(opt);
    // next attempt to find the cancer type (oncotree?)
    const disease = await processDisease({conn, diseaseName: rawRecord.cancerType});

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
    const publications = await processPublicationsList({conn, pubmedSource, pmidList: rawRecord.pmids});

    // make the actual statement
    const statement = await addRecord('statements', {
        impliedBy: [{target: variant['@rid']}, {target: disease['@rid']}],
        supportedBy: Array.from(publications, x => ({target: x['@rid'], source: source['@rid'], level: level['@rid']})),
        relevance: relevance['@rid'],
        appliesTo: drug['@rid'],
        source: source['@rid'],
        reviewStatus: 'not required'
    }, conn, {
        existsOk: true,
        getWhere: {
            implies: {direction: 'in', v: [variant['@rid'], disease['@rid']]},
            supportedBy: {direction: 'out', v: Array.from(publications, x => x['@rid'])},
            relevance: relevance['@rid'],
            appliesTo: drug['@rid'],
            source: source['@rid'],
            reviewStatus: 'not required'
        }
    });
    return statement;
};

/**
 * parsing from http://oncokb.org/api/v1/utils/allAnnotatedVariants.json
 */
const processAnnotatedRecord = async (opt) => {
    const {
        conn, rawRecord, source, pubmedSource
    } = opt;
    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    const variant = await processVariant(opt);
    // next attempt to find the cancer type (oncotree?)
    let disease;
    if (rawRecord.cancerType) {
        disease = await processDisease({conn, diseaseName: rawRecord.cancerType});
    }
    // find/add the publications
    const publications = await processPublicationsList({conn, pubmedSource, pmidList: rawRecord.mutationEffectPmids});
    rawRecord.mutationEffect = rawRecord.mutationEffect.replace(/-/g, ' ');
    let relevance1;
    try {
        relevance1 = await getRecordBy('vocabulary', {name: rawRecord.mutationEffect}, conn);
    } catch (err) {}
    let relevance2;
    try {
        relevance2 = await getRecordBy('vocabulary', {name: rawRecord.oncogenicity}, conn);
    } catch (err) {}

    if (!relevance1 && !relevance2) {
        throw new Error(`unable to find vocabulary terms: ${rawRecord.mutationEffect} or ${rawRecord.oncogenicity}`);
    }
    // make the actual functional statement
    const impliedBy = [{target: variant['@rid']}];
    if (disease) {
        impliedBy.push({target: disease['@rid']});
    }
    let count = 0;
    if (relevance1) {
        await addRecord('statements', {
            impliedBy,
            supportedBy: Array.from(publications, x => ({target: x['@rid'], source: source['@rid']})),
            relevance: relevance1['@rid'],
            appliesTo: variant.reference1,
            source: source['@rid'],
            reviewStatus: 'not required'
        }, conn, {
            verbose: true,
            existsOk: true,
            getWhere: {
                implies: {v: Array.from(impliedBy, x => x.target)},
                supportedBy: {v: Array.from(publications, x => x['@rid'])},
                relevance: relevance1['@rid'],
                appliesTo: variant.reference1,
                source: source['@rid'],
                reviewStatus: 'not required'
            }
        });
        count++;
    }
    // make the oncogenicity statement
    if (relevance2) {
        await addRecord('statements', {
            impliedBy,
            supportedBy: Array.from(publications, x => ({target: x['@rid'], source: source['@rid']})),
            relevance: relevance2['@rid'],
            appliesTo: null,
            source: source['@rid'],
            reviewStatus: 'not required'
        }, conn, {
            verbose: true,
            existsOk: true,
            getWhere: {
                implies: {v: Array.from(impliedBy, x => x.target)},
                supportedBy: {v: Array.from(publications, x => x['@rid'])},
                relevance: relevance2['@rid'],
                appliesTo: null,
                reviewStatus: 'not required',
                source: source['@rid']
            }
        });
        count++;
    }
    return count;
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
        if (!/^LEVEL_[A-Z0-9]+$/.exec(level)) {
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
        }, conn, {existsOk: true});
        result[level] = record;
    }
    return result;
};


const upload = async (conn) => {
    const URL = 'http://oncokb.org/api/v1/utils';

    // load directly from their api:
    console.log(`loading: ${URL}`);
    let recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${URL}/allActionableVariants.json`
    });
    console.log(`loaded ${recordsList.length} records`);
    // add the source node
    const source = await addRecord('sources', {
        name: SOURCE_NAME,
        usage: 'http://oncokb.org/#/terms',
        url: 'http://oncokb.org'
    }, conn, {existsOk: true});

    const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, {existsOk: true});
    const counts = {errors: 0, success: 0, skip: 0};
    await addEvidenceLevels(conn, source);
    // console.log(Object.keys(terms));
    for (const rawRecord of recordsList) {
        for (const drug of Array.from(rawRecord.drugs.split(','), x => x.trim().toLowerCase()).filter(x => x.length > 0)) {
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
                counts.success++;
            } catch (err) {
                console.log('\n', err.error
                    ? err.error.message
                    : err.message || err, `variant: ${rawRecord.variant}`);
                counts.errors++;
            }
        }
    }
    // load directly from their api:
    console.log(`\nloading: ${URL}`);
    recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${URL}/allAnnotatedVariants.json`
    });
    console.log(`loaded ${recordsList.length} records`);
    for (const rawRecord of recordsList) {
        if (rawRecord.mutationEffect === 'Inconclusive' && rawRecord.oncogenicity === 'Inconclusive') {
            counts.skip += 2;
            continue;
        }
        let expect = 0;
        if (rawRecord.mutationEffect !== 'Inconclusive') {
            expect++;
        }
        if (rawRecord.oncogenicity !== 'Inconclusive') {
            expect++;
        }
        if (rawRecord.cancerType) {
            rawRecord.cancerType = rawRecord.cancerType.toLowerCase().trim();
            rawRecord.cancerType = DISEASE_MAPPING[rawRecord.cancerType] === undefined
                ? rawRecord.cancerType
                : DISEASE_MAPPING[rawRecord.cancerType];
        }

        rawRecord.variant = VOCABULARY_MAPPING[rawRecord.variant] === undefined
            ? rawRecord.variant
            : VOCABULARY_MAPPING[rawRecord.variant];

        try {
            const statementCount = await processAnnotatedRecord({
                conn, rawRecord, source, pubmedSource
            });
            counts.success += statementCount;
            counts.errors += expect - statementCount;
            counts.skip += 2 - expect;
        } catch (err) {
            console.log('\n', err.error
                ? err.error.message
                : err.message || err, `variant: ${rawRecord.variant}`);
            counts.errors++;
        }
    }
    console.log('\n', counts);
};

module.exports = {upload, preferredDrugs, preferredDiseases};
