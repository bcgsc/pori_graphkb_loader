/**
 * | | |
 * | --- | --- |
 * | Source | OncoKB |
 * | About |  http://oncokb.org/#/about |
 * | Source Type | Knowledgebase |
 * | Data Example| Direct API Access |
 * | Data Format| JSON |
 *
 * @module importer/oncokb
 */
const request = require('request-promise');
const Ajv = require('ajv');
const jsonpath = require('jsonpath');

const kbParser = require('@bcgsc/knowledgebase-parser');

const {
    preferredDiseases, preferredDrugs, rid
} = require('./util');
const {ParsingError} = require('./../app/repo/error');
const _pubmed = require('./pubmed');
const _hgnc = require('./hgnc');
const {logger} = require('./logging');

const ajv = new Ajv();

const validateActionableRecordSpec = ajv.compile({
    type: 'object',
    properties: {
        cancerType: {type: 'string'},
        drugs: {type: 'string'},
        gene: {type: 'string'},
        level: {type: 'string'},
        pmids: {type: 'string'},
        proteinChange: {type: 'string'}, // TODO: Link variant to protein change with 'infers' where different
        variant: {type: 'string'}
    }
});
const validateAnnotatedRecordSpec = ajv.compile({
    type: 'object',
    properties: {
        gene: {type: 'string'},
        mutationEffect: {type: 'string'},
        mutationEffectPmids: {type: 'string'},
        oncogenicity: {type: 'string'},
        proteinChange: {type: 'string'}, // TODO: Link variant to protein change with 'infers' where different
        variant: {type: 'string'}
    }
});

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
            sort: preferredDrugs
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


/**
 * Parse the variant string preresentation from oncokb to its graphkB equivalent
 */
const parseVariantName = (variantIn, {reference1} = {}) => {
    const variant = variantIn.toLowerCase();
    try {
        kbParser.variant.parse(`p.${variant}`, false);
        return {type: `p.${variant}`};
    } catch (err) {}
    let match = /^([a-z])?(\d+)_([a-z])?(\d+)splice$/.exec(variant);
    if (match) {
        return {
            type: `p.(${
                match[1] || '?'
            }${
                match[2]}_${match[3] || '?'
            }${
                match[4]
            })spl`
        };
    } if (variant.endsWith('_splice')) {
        return {type: `p.${variant.replace('_splice', 'spl')}`};
    } if (match = /^([^-\s]+)-([^-\s]+) fusion$/.exec(variant)) {
        if (!reference1 || match[1].toLowerCase() === reference1.toLowerCase()) {
            return {
                type: 'fusion',
                reference2: match[2].trim().toLowerCase()
            };
        } if (match[2].toLowerCase() === reference1.toLowerCase()) {
            return {
                type: 'fusion',
                reference2: reference1.toLowerCase(),
                reference1: match[1].trim().toLowerCase()
            };
        }
        throw new Error(`the fusion in the variant ${
            variant
        } does not match the name of the gene feature ${
            reference1
        }`);
    } if (match = /^exon (\d+) (mutation|insertion|deletion|deletion\/insertion|splice mutation)s?$/.exec(variant)) {
        const [, pos, type] = match;
        if (type === 'deletion/insertion') {
            return {type: `e.${pos}delins`};
        } if (type === 'splice mutation') {
            return {type: `e.${pos}spl`};
        }
        return {type: `e.${pos}${type.slice(0, 3)}`};
    } if (VOCABULARY_MAPPING[variant.toLowerCase().trim()] !== undefined) {
        return {type: VOCABULARY_MAPPING[variant.toLowerCase().trim()]};
    }
    throw new Error(`Unable to parse variant notation (variantIn=${variantIn}, reference1=${reference1})`);
};


/**
 * Parse the variant string and return the new variant record with all appropriate calculated linked records
 */
const processVariant = async (opt) => {
    // first try to retrieve the gene rawRecord
    const {
        conn, rawRecord
    } = opt;
    if (rawRecord.gene === 'other biomarkers') {
        try {
            let vocab = rawRecord.variant.trim().toLowerCase();
            if (VOCABULARY_MAPPING[vocab]) {
                vocab = VOCABULARY_MAPPING[vocab];
            }
            const variant = await conn.getUniqueRecordBy({
                endpoint: 'vocabulary',
                where: {name: vocab, source: {name: 'bcgsc'}}
            });
            return variant;
        } catch (err) {
            logger.warn(`failed to retrieve the associated vocabulary (variant=${rawRecord.variant})`);
            throw err;
        }
    }

    let gene1;
    try {
        gene1 = await _hgnc.fetchAndLoadBySymbol({conn, symbol: rawRecord.gene});
    } catch (err) {
        logger.warn(`Failed to find the gene symbol (${rawRecord.gene})`);
        throw err;
    }

    // determine the type of variant we are dealing with
    let type,
        reference2;
    try {
        const parsed = parseVariantName(
            rawRecord.variant,
            {reference1: gene1.name}
        );
        type = parsed.type;
        reference2 = parsed.reference2;
    } catch (err) {
        type = rawRecord.variant;
    }
    let gene2;
    try {
        if (reference2) {
            gene2 = await _hgnc.fetchAndLoadBySymbol({conn, symbol: reference2});
        }
    } catch (err) {
        logger.warn(`Failed to retrieve hugo gene ${reference2}`);
        throw err;
    }
    // swap them for fusions listed in opposite order
    if (reference2
        && gene2
        && reference2.name === gene1.name
        && reference2.name !== gene2.name
    ) {
        [gene1, gene2] = [gene2, gene1];
    }

    // if it fits one of the known term types usethat, otherwise attempt to parse as if protein notation
    let variantUrl;
    const defaults = {
        zygosity: null,
        germline: null,
        reference2: null
    };
    let variant,
        variantType = type;
    try {
        variantType = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: variantType, source: {name: 'bcgsc'}}
        });
        variantUrl = 'categoryvariants';
        variant = {};
    } catch (err) {}

    if (!variant) {
        try {
            variant = kbParser.variant.parse(type, false).toJSON();
        } catch (err) {
            logger.warn(`failed to parse the variant (${type}) for record (gene=${rawRecord.gene}, variant=${rawRecord.variant})`);
            throw err;
        }

        variantUrl = 'positionalvariants';
        try {
            variantType = await conn.getUniqueRecordBy({
                endpoint: 'vocabulary',
                where: {name: variant.type, source: {name: 'bcgsc'}}
            });
        } catch (err) {
            logger.warn(`failed to retrieve the variant type (${variant.type})`);
        }
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
            sort: preferredDiseases
        });
    } catch (err) {
        if (diseaseName.includes('/')) {
            disease = await conn.getUniqueRecordBy({
                endpoint: 'diseases',
                where: {name: diseaseName.split('/')[0].trim()},
                sort: preferredDiseases
            });
        } else {
            throw err;
        }
    }
    return disease;
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
        conn, rawRecord, sources: {oncokb}
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
            sort: preferredDrugs
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
        where: {name: relevance, source: {name: 'bcgsc'}}
    });

    // find/add the publications
    const publications = await Promise.all(
        rawRecord.pmids
            .split(',')
            .filter(pmid => pmid && pmid.trim())
            .map(async pmid => _pubmed.fetchArticle(conn, pmid.trim()))
    );

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
        conn, rawRecord, sources: {oncokb}
    } = opt;

    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    const variant = await processVariant(opt);
    // next attempt to find the cancer type (oncotree?)
    let disease;
    if (rawRecord.cancerType) {
        disease = await processDisease({conn, diseaseName: rawRecord.cancerType});
    }
    rawRecord.mutationEffect = rawRecord.mutationEffect.replace(/-/g, ' ');
    let relevance1;
    try {
        relevance1 = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: rawRecord.mutationEffect, source: {name: 'bcgsc'}}
        });
    } catch (err) {}
    let relevance2;
    try {
        relevance2 = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: rawRecord.oncogenicity, source: {name: 'bcgsc'}}
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
    // find/add the publications
    const publications = await Promise.all(
        rawRecord.mutationEffectPmids
            .split(',')
            .filter(pmid => pmid && pmid.trim())
            .map(async pmid => _pubmed.fetchArticle(conn, pmid.trim()))
    );

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
 * Download all actionable records and process them
 * Creates the equivalent GraphKB records
 *
 * @param {object} opt
 * @param {string} opt.URL base url to use for accessing oncokb
 * @param {object} opt.counts record success/error tracking for reporting to the parent function
 * @param {object|string} opt.oncokb the oncokb 'source' record
 * @param {ApiConnection} opt.conn the GraphKB api connection
 */
const processActionableRecords = async ({
    URL, conn, counts, oncokb
}) => {
    // load directly from their api:
    logger.info(`loading: ${URL}/allActionableVariants.json`);
    const recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${URL}/allActionableVariants.json`
    });
    logger.info(`loaded ${recordsList.length} records`);
    const records = [];
    const pmidList = new Set();
    for (const rawRecord of recordsList) {
        if (!validateActionableRecordSpec(rawRecord)) {
            logger.error(
                `Spec Validation failed for actionable record #${
                    validateActionableRecordSpec.errors[0].dataPath
                } ${
                    validateActionableRecordSpec.errors[0].message
                } found ${
                    jsonpath.query(rawRecord, `$${validateActionableRecordSpec.errors[0].dataPath}`)
                }`
            );
            counts.error++;
            continue;
        }
        records.push(rawRecord);
        for (const pmid of rawRecord.pmids.split(',')) {
            pmidList.add(pmid.trim());
        }
    }
    logger.info(`loading ${pmidList.size} pubmed articles`);
    await _pubmed.uploadArticlesByPmid(conn, Array.from(pmidList));

    logger.info(`processing ${records.length} remaining oncokb records`);

    for (const rawRecord of records) {
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
                    conn, rawRecord, sources: {oncokb}
                });
                counts.success++;
            } catch (err) {
                counts.errors++;
                logger.error((err.error || err).message);
            }
        }
    }
};


/**
 * Download all annotated records and process them
 * Creates the equivalent GraphKB records
 *
 * @param {object} opt
 * @param {string} opt.URL base url to use for accessing oncokb
 * @param {object} opt.counts record success/error tracking for reporting to the parent function
 * @param {object|string} opt.oncokb the oncokb 'source' record
 * @param {ApiConnection} opt.conn the GraphKB api connection
 */
const processAnnotatedRecords = async ({
    URL, conn, counts, oncokb
}) => {
    // load directly from their api:
    logger.info(`loading: ${URL}/allAnnotatedVariants.json`);
    const recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${URL}/allAnnotatedVariants.json`
    });
    logger.info(`loaded ${recordsList.length} records`);
    const records = [];
    const pmidList = new Set();
    for (const rawRecord of recordsList) {
        if (!validateAnnotatedRecordSpec(rawRecord)) {
            logger.error(
                `Spec Validation failed for annotated record #${
                    validateAnnotatedRecordSpec.errors[0].dataPath
                } ${
                    validateAnnotatedRecordSpec.errors[0].message
                } found ${
                    jsonpath.query(rawRecord, `$${validateAnnotatedRecordSpec.errors[0].dataPath}`)
                }`
            );
            counts.error++;
            continue;
        }
        if (rawRecord.mutationEffect === 'Inconclusive' && rawRecord.oncogenicity === 'Inconclusive') {
            counts.skip += 2;
            continue;
        }
        records.push(rawRecord);
        for (const pmid of rawRecord.mutationEffectPmids.split(',') || []) {
            pmidList.add(pmid.trim());
        }
    }

    logger.info(`loading ${pmidList.size} pubmed articles`);
    await _pubmed.uploadArticlesByPmid(conn, Array.from(pmidList));

    logger.info(`processing ${records.length} remaining oncokb records`);
    for (const rawRecord of records) {
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
                conn, rawRecord, sources: {oncokb}
            });
            counts.success += statementCount;
            counts.errors += expect - statementCount;
            counts.skip += 2 - expect;
        } catch (err) {
            logger.error((err.error || err).message);
            counts.errors++;
        }
    }
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

    const counts = {errors: 0, success: 0, skip: 0};
    await addEvidenceLevels(conn, oncokb);
    await processActionableRecords({
        conn, oncokb, URL, counts
    });
    await processAnnotatedRecords({
        conn, oncokb, URL, counts
    });

    logger.info(JSON.stringify(counts));
};

module.exports = {
    upload, parseVariantName
};
