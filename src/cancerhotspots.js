/**
 * @module src/cancerhotspots
 */
const fs = require('fs');

const csv = require('fast-csv');

const {variant: {parse: variantParser}} = require('@bcgsc/knowledgebase-parser');

const {
    preferredDiseases,
    rid,
    convertRowFields,
    orderPreferredOntologyTerms,
    hashStringtoId
} = require('./util');
const _entrezGene = require('./entrez/gene');
const {SOURCE_DEFN: {name: ensemblName}} = require('./ensembl');
const {logger} = require('./logging');
const {SOURCE_DEFN: {name: oncotreeName}} = require('./oncotree');

const SOURCE_DEFN = {
    url: 'https://www.cancerhotspots.org',
    displayName: 'cancerhotspots.org',
    name: 'cancerhotspots.org',
    description: 'a resource for statistically significant mutations in cancer',
    license: 'https://opendatacommons.org/licenses/odbl/1.0'
};

const HEADER = {
    geneId: 'Entrez_Gene_Id',
    cds: 'HGVSc',
    protein: 'HGVSp_Short',
    transcriptId: 'Transcript_ID',
    dbsnp: 'dbSNP_RS',
    diseaseId: 'oncotree_detailed'
};


const diseasesCache = {};
const featureCache = {};

/**
 * Create and link the variant defuinitions for a single row/record
 */
const processVariants = async ({conn, record, source}) => {
    const {
        protein, cds, transcriptId, geneId
    } = record;

    let proteinVariant,
        cdsVariant;

    try {
        // get the gene
        let reference1;
        if (featureCache[reference1] !== undefined) {
            reference1 = featureCache[reference1];
        } else {
            [reference1] = await _entrezGene.fetchAndLoadByIds(conn, [geneId]);
            featureCache[geneId] = reference1;
        }
        const {
            noFeatures, multiFeature, prefix, ...variant
        } = variantParser(
            protein.replace(/fs\*\?$/, 'fs'), // ignore uncertain truncations
            false
        );
        variant.reference1 = rid(reference1);
        variant.type = rid(await conn.getVocabularyTerm(variant.type));
        proteinVariant = rid(await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {...variant},
            existsOk: true
        }));
    } catch (err) {
        logger.error(`Failed the protein variant (${geneId}:${protein}) ${err}`);
        throw err;
    }
    // create the cds variant
    try {
        // get the ensembl transcript
        let reference1;
        if (featureCache[transcriptId] !== undefined) {
            reference1 = featureCache[transcriptId];
        } else {
            reference1 = rid(await conn.getUniqueRecordBy({
                endpoint: 'features',
                where: {sourceId: transcriptId, biotype: 'transcript', source: {name: ensemblName}},
                sort: orderPreferredOntologyTerms
            }));
            featureCache[transcriptId] = reference1;
        }
        // parse the cds variant
        const {
            noFeatures, multiFeature, prefix, ...variant
        } = variantParser(cds, false);

        variant.reference1 = reference1;
        variant.type = rid(await conn.getVocabularyTerm(variant.type));

        cdsVariant = rid(await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {...variant},
            existsOk: true
        }));
        await conn.addRecord({
            endpoint: 'infers',
            content: {out: cdsVariant, in: proteinVariant, source: rid(source)},
            existsOk: true,
            fetchExisting: false
        });
    } catch (err) {
        logger.error(`Failed the cds variant (${transcriptId}:${cds}) ${err}`);
    }
    return proteinVariant;
};

const processRecord = async (conn, record, source, relevance) => {
    const {diseaseId, sourceId} = record;
    // get the protein variant
    const variantId = await processVariants({conn, record, source});
    // get the disease by id from oncotree (try cache first)
    let disease;
    if (diseasesCache[diseaseId]) {
        disease = diseasesCache[diseaseId];
    } else {
        disease = rid(await conn.getUniqueRecordBy({
            endpoint: 'diseases',
            where: {sourceId: diseaseId, source: {name: oncotreeName}},
            sort: preferredDiseases
        }));
        diseasesCache[diseaseId] = disease;
    }

    await conn.addRecord({
        endpoint: 'statements',
        content: {
            relevance,
            appliesTo: disease,
            impliedBy: [variantId, disease],
            supportedBy: [source],
            source,
            sourceId,
            reviewStatus: 'not required'
        },
        existsOk: true,
        fetchExisting: false
    });
};

const createRowId = row => hashStringtoId(Object.keys(HEADER).sort().map(col => row[col].toLowerCase()).join('_'));


/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({filename, conn, errorLogPrefix}) => {
    logger.info(`loading: ${filename}`);

    // get the dbID for the source
    const source = rid(await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    }));
    const relevance = rid(await conn.getVocabularyTerm('mutation hotspot'));
    const counts = {success: 0, error: 0, skip: 0};
    const errorList = [];

    let index = 0;

    logger.info('load entrez genes cache');
    await _entrezGene.preLoadCache(conn);

    const previousLoad = new Set();
    logger.info('load previous statements');
    const statements = await conn.getRecords({
        where: {source: rid(source), neighbors: 0, returnProperties: 'sourceId'}, endpoint: 'statements'
    });
    for (const {sourceId} of statements) {
        previousLoad.add(sourceId);
    }
    logger.info(`${previousLoad.size} loaded statements`);

    const parserPromise = new Promise((resolve, reject) => {
        csv
            .parseFile(filename, {
                headers: true, comment: '#', trim: true, delimiter: '\t'
            })
            .transform((data, callback) => {
                const record = convertRowFields(HEADER, data);
                const sourceId = createRowId(record);
                record.sourceId = sourceId;
                index++;
                if (previousLoad.has(sourceId)) {
                    logger.info(`Already loaded ${sourceId}`);
                    callback(null, record);
                } else if (record.protein.endsWith('=')) {
                    counts.skip++;
                    logger.info('skipping synonymous protein variant');
                    callback(null, record);
                } else if (record.protein.endsWith('_splice')) {
                    counts.skip++;
                    logger.info('skipping non-standard splice notation');
                    callback(null, record);
                } else {
                    logger.info(`processing row #${index} ${sourceId}`);
                    processRecord(conn, record, source, relevance)
                        .then(() => {
                            logger.info('created record');
                            counts.success++;
                            callback(null, record);
                        }).catch((err) => {
                            logger.error(err);
                            errorList.push({record, error: err, errorMessage: err.toString()});
                            counts.error++;
                            callback(null, record);
                        });
                }
            })
            .on('data', () => {}) // will not run w/o this
            .on('error', (err) => {
                console.error(err);
                logger.error(err);
                reject(err);
            })
            .on('end', () => {
                logger.info('completed stream');
                resolve();
            });
    });
    await parserPromise;
    const errorJson = `${errorLogPrefix}-cancerhotspots.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({records: errorList}, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = {
    uploadFile, SOURCE_DEFN, kb: true, dependencies: [ensemblName, oncotreeName]
};
