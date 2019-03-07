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
const kbParser = require('@bcgsc/knowledgebase-parser');

const {
    preferredDiseases, preferredDrugs, rid
} = require('./util');
const {ParsingError} = require('./../../app/repo/error');
const _pubmed = require('./pubmed');
const _hgnc = require('./hgnc');

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
        drugRec.push(await conn.getUniqueRecordBy({
            endpoint: 'therapies',
            where: {name: drug},
            sortFunc: preferredDrugs
        }));
    }
    const combinationName = Array.from(drugRec, x => x.name || x.sourceId).join(' + ');
    const combination = await conn.addRecord({
        endpoint: 'therapies',
        content: {
            name: combinationName,
            sourceId: combinationName,
            source: rid(source)
        },
        existsOk: true
    });
    for (const drug of drugRec) {
        await conn.addRecord({
            endpoint: 'elementOf',
            content: {source: rid(source), out: rid(drug), in: rid(combination)},
            existsOk: true
        });
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
            variant = await conn.getUniqueRecordBy({
                endpoint: 'vocabulary',
                where: {name: rawRecord.variant}
            });
        } catch (err) {}
    }
    if (!variant) {
        let gene1 = await _hgnc.fetchAndLoadBySymbol({conn, symbol: rawRecord.gene});
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
                gene2 = await _hgnc.fetchAndLoadBySymbol({conn, symbol: match[2]});
            } else if (match[2].toLowerCase() === gene1.name) {
                gene2 = gene1;
                gene1 = await _hgnc.fetchAndLoadBySymbol({conn, symbol: match[1]});
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
            variantType = await conn.getUniqueRecordBy({
                endpoint: 'vocabulary',
                where: {name: variant}
            });
            variantUrl = 'categoryvariants';
            variant = {};
        } catch (err) {
            variant = kbParser.variant.parse(
                `${variant.startsWith('e.')
                    ? ''
                    : 'p.'}${variant}`,
                false
            ).toJSON();

            variantUrl = 'positionalvariants';
            variantType = await conn.getUniqueRecordBy({
                endpoint: 'vocabulary',
                where: {name: variant.type}
            });
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
        variant.reference1 = rid(gene1);
        if (gene2) {
            variant.reference2 = rid(gene2);
        }
        variant.type = rid(variantType);
        // create the variant
        variant = await conn.addRecord({
            endpoint: variantUrl,
            content: variant,
            existsOk: true,
            fetchConditions: Object.assign(defaults, variant),
            fetchExisting: true
        });
    }
    return variant;
};


const processDisease = async (opt) => {
    const {conn, diseaseName} = opt;
    // next attempt to find the cancer type (oncotree?)
    let disease;
    try {
        disease = await conn.getUniqueRecordBy({
            endpoint: 'diseases',
            where: {name: diseaseName},
            sortFunc: preferredDiseases
        });
    } catch (err) {
        if (diseaseName.includes('/')) {
            disease = await conn.getUniqueRecordBy({
                endpoint: 'diseases',
                where: {name: diseaseName.split('/')[0].trim()},
                sortFunc: preferredDiseases
            });
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
    const {conn, pmidList} = opt;

    const pubmedIds = Array.from(pmidList.split(/[,\s]+/)).filter(x => x.trim().length > 0);
    const articles = await _pubmed.fetchArticlesByPmids(pubmedIds);
    const publications = [];
    // throttle
    for (const article of articles) {
        publications.push(await _pubmed.uploadArticle(conn, article));
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
        conn, rawRecord, sources: {oncokb, pubmed}
    } = opt;
    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    const variant = await processVariant(opt);
    // next attempt to find the cancer type (oncotree?)
    const disease = await processDisease({conn, diseaseName: rawRecord.cancerType});

    // find the drug
    let drug;
    try {
        drug = await conn.getUniqueRecordBy({
            endpoint: 'therapies',
            where: {name: rawRecord.drug},
            sortFunc: preferredDrugs
        });
    } catch (err) {
        if (rawRecord.drug.includes('+')) {
            // add the combination therapy as a new therapy defined by oncokb
            drug = await addTherapyCombination(conn, oncokb, rawRecord.drug);
        } else {
            throw err;
        }
    }

    // get the evidence level and determine the relevance
    const level = await conn.getUniqueRecordBy({
        endpoint: 'evidencelevels',
        where: {sourceId: rawRecord.level, source: rid(oncokb)}
    });

    let relevance = level.name.startsWith('r')
        ? 'resistance'
        : 'sensitivity';
    relevance = await conn.getUniqueRecordBy({
        endpoint: 'vocabulary',
        where: {name: relevance}
    });

    // find/add the publications
    const publications = await processPublicationsList({conn, pubmed, pmidList: rawRecord.pmids});

    // make the actual statement
    await conn.addRecord({
        endpoint: 'statements',
        content: {
            impliedBy: [{target: rid(variant)}, {target: rid(disease)}],
            supportedBy: Array.from(publications, x => ({target: rid(x), source: rid(oncokb), level: rid(level)})),
            relevance: rid(relevance),
            appliesTo: rid(drug),
            source: rid(oncokb),
            reviewStatus: 'not required'
        },
        existsOk: true,
        fetchExisting: false
    });
};

/**
 * parsing from http://oncokb.org/api/v1/utils/allAnnotatedVariants.json
 */
const processAnnotatedRecord = async (opt) => {
    const {
        conn, rawRecord, sources: {oncokb, pubmed}
    } = opt;
    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    const variant = await processVariant(opt);
    // next attempt to find the cancer type (oncotree?)
    let disease;
    if (rawRecord.cancerType) {
        disease = await processDisease({conn, diseaseName: rawRecord.cancerType});
    }
    // find/add the publications
    const publications = await processPublicationsList({conn, pubmed, pmidList: rawRecord.mutationEffectPmids});
    rawRecord.mutationEffect = rawRecord.mutationEffect.replace(/-/g, ' ');
    let relevance1;
    try {
        relevance1 = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: rawRecord.mutationEffect}
        });
    } catch (err) {}
    let relevance2;
    try {
        relevance2 = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: rawRecord.oncogenicity}
        });
    } catch (err) {}

    if (!relevance1 && !relevance2) {
        throw new Error(`unable to find vocabulary terms: ${rawRecord.mutationEffect} or ${rawRecord.oncogenicity}`);
    }
    // make the actual functional statement
    const impliedBy = [{target: rid(variant)}];
    if (disease) {
        impliedBy.push({target: rid(disease)});
    }
    let count = 0;
    if (relevance1) {
        await conn.addRecord({
            endpoint: 'statements',
            content: {
                impliedBy,
                supportedBy: Array.from(publications, x => ({target: rid(x), source: rid(oncokb)})),
                relevance: rid(relevance1),
                appliesTo: rid(variant.reference1),
                source: rid(oncokb),
                reviewStatus: 'not required'
            },
            existsOk: true,
            fetchExisting: false
        });
        count++;
    }
    // make the oncogenicity statement
    if (relevance2) {
        await conn.addRecord({
            endpoint: 'statements',
            content: {
                impliedBy,
                supportedBy: Array.from(publications, x => ({target: rid(x), source: rid(oncokb)})),
                relevance: rid(relevance2),
                appliesTo: null,
                source: rid(oncokb),
                reviewStatus: 'not required'
            },
            existsOk: true,
            fetchExisting: false
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
        const record = await conn.addRecord({
            endpoint: 'evidencelevels',
            content: {
                source: rid(source),
                sourceId: level,
                name: level,
                description: desc,
                url: URL
            },
            existsOk: true
        });
        result[level] = record;
    }
    return result;
};

/**
 * Upload the OncoKB statements from the OncoKB API into GraphKB
 *
 * @param {object} opt options
 * @param {string} [opt.url] the base url for fetching from the OncoKB Api
 * @param {ApiConnection} opt.conn the GraphKB api connection object
 */
const upload = async (opt) => {
    const {conn} = opt;
    const URL = opt.url || 'http://oncokb.org/api/v1/utils';

    // load directly from their api:
    console.log(`loading: ${URL}`);
    let recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${URL}/allActionableVariants.json`
    });
    console.log(`loaded ${recordsList.length} records`);
    // add the source node
    const oncokb = await conn.addRecord({
        endpoint: 'sources',
        content: {
            name: SOURCE_NAME,
            usage: 'http://oncokb.org/#/terms',
            url: 'http://oncokb.org'
        },
        existsOk: true
    });

    const pubmed = await conn.addRecord({
        endpoint: 'sources',
        content: {name: 'pubmed'},
        existsOk: true
    });
    const counts = {errors: 0, success: 0, skip: 0};
    await addEvidenceLevels(conn, oncokb);
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
                    conn, rawRecord, sources: {oncokb, pubmed}
                });
                counts.success++;
            } catch (err) {
                throw err;
                console.log('\n', err.error
                    ? err.error.message
                    : err.message || err, `variant: ${rawRecord.variant}`);
                counts.errors++;
                console.log(err.error || err);
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
                conn, rawRecord, sources: {oncokb, pubmed}
            });
            counts.success += statementCount;
            counts.errors += expect - statementCount;
            counts.skip += 2 - expect;
        } catch (err) {
            console.log('\n', err.error
                ? err.error.message
                : err.message || err, `variant: ${rawRecord.variant}`);
            counts.errors++;
            console.log(err.error || err);
        }
    }
    console.log('\n', counts);
};

module.exports = {upload, preferredDrugs, preferredDiseases};
