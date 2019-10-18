/**
 * @module src/cancerhotspots
 */
const fs = require('fs');

const csv = require('fast-csv');

const {variant: {parse: variantParser}} = require('@bcgsc/knowledgebase-parser');

const {
    convertRowFields,
    hashRecordToId
} = require('./util');
const {
    preferredDiseases,
    rid,
    orderPreferredOntologyTerms,
    preferredFeatures
} = require('./graphkb');
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
    diseaseId: 'oncotree_detailed',
    impact: 'IMPACT',
    assembly: 'NCBI_Build',
    chromosome: 'Chromosome',
    start: 'Start_Position',
    stop: 'End_Position',
    clinSig: 'CLIN_SIG',
    refSeq: 'Reference_Allele',
    untemplatedSeq: 'Allele'
};


const diseasesCache = {};
const featureCache = {};
const chromosomeCache = {};

/**
 * Create and link the variant defuinitions for a single row/record
 */
const processVariants = async ({conn, record, source}) => {
    const {
        protein, cds, transcriptId, geneId, chromosome, start, stop
    } = record;

    let proteinVariant,
        cdsVariant,
        genomicVariant;

    try {
        // get the chromosome
        let reference1;
        if (chromosomeCache[chromosome] !== undefined) {
            reference1 = chromosomeCache[chromosome];
        } else {
            reference1 = await conn.getUniqueRecordBy({
                target: 'Feature',
                filters: {
                    AND: [{OR: [{sourceId: chromosome}, {name: chromosome}]}, {biotype: 'chromosome'}]
                },
                sort: preferredFeatures
            });
            chromosomeCache[chromosome] = reference1;
        }
        // try to create the genomic variant
        const refSeq = record.refSeq === '-'
            ? ''
            : record.refSeq;
        const untemplatedSeq = record.untemplatedSeq === '-'
            ? ''
            : record.untemplatedSeq;
        let notation = `${chromosome}:g.`;
        if (refSeq.length && untemplatedSeq.length) {
            if (refSeq.length === 1 && untemplatedSeq.length === 1) {
                // substitution
                notation = `${notation}${start}${refSeq}>${untemplatedSeq}`;
            } else {
                // indel
                notation = `${notation}${start}_${stop}del${refSeq}ins${untemplatedSeq}`;
            }
        } else if (refSeq.length === 0) {
            // insertion
            notation = `${notation}${start}_${stop}ins${untemplatedSeq}`;
        } else {
            // deletion
            notation = `${notation}${start}_${stop}del${refSeq}`;
        }
        const {
            noFeatures, multiFeature, prefix, ...variant
        } = variantParser(notation);

        variant.reference1 = rid(reference1);
        variant.type = rid(await conn.getVocabularyTerm(variant.type));
        genomicVariant = rid(await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {...variant},
            existsOk: true
        }));
    } catch (err) {
        logger.warn(`failed to create the genomic variant (${chromosome}:${start}-${stop})`);
        logger.warn(err);
    }

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
                target: 'Feature',
                filters: {
                    AND: [
                        {sourceId: transcriptId},
                        {biotype: 'transcript'},
                        {source: {target: 'Source', filters: {name: ensemblName}}}
                    ]
                },
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

    // link the genomic variant
    if (genomicVariant && cdsVariant) {
        await conn.addRecord({
            endpoint: 'infers',
            content: {out: rid(genomicVariant), in: rid(cdsVariant), source: rid(source)},
            existsOk: true,
            fetchExisting: false
        });
    } else if (genomicVariant) {
        await conn.addRecord({
            endpoint: 'infers',
            content: {out: rid(genomicVariant), in: rid(proteinVariant), source: rid(source)},
            existsOk: true,
            fetchExisting: false
        });
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
            target: 'Disease',
            filters: {
                AND: [
                    {sourceId: diseaseId},
                    {source: {target: 'Source', filters: {name: oncotreeName}}}
                ]
            },
            sort: preferredDiseases
        }));
        diseasesCache[diseaseId] = disease;
    }

    await conn.addRecord({
        endpoint: 'statements',
        content: {
            relevance,
            subject: disease,
            conditions: [variantId, disease],
            evidence: [source],
            source,
            sourceId,
            reviewStatus: 'not required'
        },
        existsOk: true,
        fetchExisting: false
    });
};

const createRowId = row => hashRecordToId(row);


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
        const parser = csv
            .parseFile(filename, {
                headers: true, comment: '#', trim: true, delimiter: '\t'
            })
            .on('data', (data) => {
                const record = convertRowFields(HEADER, data);
                const sourceId = createRowId(record);
                record.sourceId = sourceId;
                index++;
                if (
                    record.impact.toLowerCase() !== 'high'
                    || record.clinSig === ''
                    || record.clinSig.includes('benign')
                ) {
                    counts.skip++;
                } else if (previousLoad.has(sourceId)) {
                    logger.info(`Already loaded ${sourceId}`);
                } else if (record.protein.endsWith('=')) {
                    counts.skip++;
                    logger.info('skipping synonymous protein variant');
                } else if (record.protein.endsWith('_splice')) {
                    counts.skip++;
                    logger.info('skipping non-standard splice notation');
                } else {
                    parser.pause();

                    logger.info(`processing row #${index} ${sourceId}`);
                    processRecord(conn, record, source, relevance)
                        .then(() => {
                            logger.info('created record');
                            counts.success++;
                            parser.resume();
                        }).catch((err) => {
                            logger.error(err);
                            errorList.push({record, error: err, errorMessage: err.toString()});
                            counts.error++;
                            parser.resume();
                        });
                }
            })
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
