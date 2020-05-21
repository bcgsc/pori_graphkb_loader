/**
 * Requires a BioMart Export file with the columns given by the values in the HEADER constant
 *
 * @module importer/ensembl
 */

const { loadDelimToJson } = require('./util');
const {
    rid, orderPreferredOntologyTerms, generateCacheKey,
} = require('./graphkb');
const { logger } = require('./logging');
const _hgnc = require('./hgnc');
const _entrez = require('./entrez/gene');
const { ensembl: SOURCE_DEFN, refseq: { name: refseqName } } = require('./sources');

const HEADER = {
    chromosome: 'Chromosome/scaffold name',
    geneId: 'Gene stable ID',
    geneIdVersion: 'Version (gene)',
    geneName: 'Gene name',
    geneNameSource: 'Source of gene name',
    hgncId: 'HGNC ID',
    hgncName: 'HGNC symbol',
    lrgGene: 'LRG display in Ensembl gene ID',
    proteinId: 'Protein stable ID',
    proteinIdVersion: 'Protein stable ID version',
    refseqId: 'RefSeq mRNA ID',
    transcriptId: 'Transcript stable ID',
    transcriptIdVersion: 'Version (transcript)',
};


/**
 * Given a TAB delmited biomart export of Ensembl data, upload the features to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the tab delimited export file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const { filename, conn } = opt;
    const contentList = await loadDelimToJson(filename);

    const source = await conn.addRecord({
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
        target: 'Source',
    });
    let refseqSource;

    try {
        refseqSource = await conn.getUniqueRecordBy({
            filters: { name: refseqName },
            target: 'Source',
        });
    } catch (err) {
        logger.warn('Unable to find refseq source. Will not attempt to create cross-reference links');
    }

    const visited = {}; // cache genes to speed up adding records
    const hgncMissingRecords = new Set();
    const refseqMissingRecords = new Set();

    logger.info('pre-load the entrez cache to avoid unecessary requests');
    await _entrez.preLoadCache(conn);
    // skip any genes that have already been loaded before we start
    logger.info('retreiving the list of previously loaded genes');
    const preLoaded = new Set();
    const genesList = await conn.getRecords({
        filters: {
            AND: [
                { source: rid(source) }, { biotype: 'gene' }, { dependency: null },
            ],
        },
        neighbors: 0,
        target: 'Feature',
    });

    const counts = { error: 0, skip: 0, success: 0 };

    for (const record of genesList) {
        const gene = generateCacheKey(record);
        preLoaded.add(gene);
        logger.info(`${gene} has already been loaded`);
    }

    logger.info(`processing ${contentList.length} records`);

    for (let index = 0; index < contentList.length; index++) {
        const record = contentList[index];
        record.hgncName = record[HEADER.geneNameSource] === 'HGNC Symbol'
            ? record[HEADER.geneName]
            : null;

        const geneId = record[HEADER.geneId];
        const geneIdVersion = record[HEADER.geneIdVersion];
        const key = generateCacheKey({ sourceId: geneId, sourceIdVersion: geneIdVersion });

        if (preLoaded.has(key)) {
            counts.skip++;
            continue;
        }
        logger.info(`processing ${geneId}.${geneIdVersion || ''} (${index} / ${contentList.length})`);
        let newGene = false;

        if (visited[key] === undefined) {
            visited[key] = await conn.addRecord({
                content: {
                    biotype: 'gene',
                    source: rid(source),
                    sourceId: geneId,
                    sourceIdVersion: geneIdVersion,
                },
                existsOk: true,
                target: 'Feature',
            });
        }

        if (visited[geneId] === undefined) {
            newGene = true;
            visited[geneId] = await conn.addRecord({
                content: {
                    biotype: 'gene',
                    source: rid(source),
                    sourceId: geneId,
                    sourceIdVersion: null,
                },
                existsOk: true,
                target: 'Feature',
            });
        }
        const gene = visited[geneId];
        const versionedGene = visited[key];

        await conn.addRecord({
            content: {
                in: rid(versionedGene), out: rid(gene), source: rid(source),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'generalizationof',
        });

        // transcript
        const versionedTranscript = await conn.addRecord({
            content: {
                biotype: 'transcript',
                source: rid(source),
                sourceId: record[HEADER.transcriptId],
                sourceIdVersion: record[HEADER.transcriptIdVersion],
            },
            existsOk: true,
            target: 'Feature',
        });
        const transcript = await conn.addRecord({
            content: {
                biotype: 'transcript',
                source: rid(source),
                sourceId: record[HEADER.transcriptId],
                sourceIdVersion: null,
            },
            existsOk: true,
            target: 'Feature',
        });
        await conn.addRecord({
            content: {
                in: rid(versionedTranscript), out: rid(transcript), source: rid(source),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'generalizationof',
        });

        // transcript -> elementof -> gene
        await conn.addRecord({
            content: {
                in: rid(gene), out: rid(transcript), source: rid(source),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'elementof',
        });
        await conn.addRecord({
            content: {
                in: rid(versionedGene), out: rid(versionedTranscript), source: rid(source),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'elementof',
        });

        // TODO: protein
        // TODO: protein -> elementof -> transcript

        // transcript -> aliasof -> refseq
        if (refseqSource && record[HEADER.refseqId]) {
            try {
                const refseq = await conn.getUniqueRecordBy({
                    filters: {
                        AND: [
                            { source: rid(refseqSource) },
                            { sourceId: record[HEADER.refseqId] },
                            { sourceIdVersion: null },
                        ],
                    },
                    sort: orderPreferredOntologyTerms,
                    target: 'Feature',
                });
                await conn.addRecord({
                    content: {
                        in: rid(refseq), out: rid(transcript), source: rid(source),
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'crossreferenceof',
                });
            } catch (err) {
                refseqMissingRecords.add(record[HEADER.refseqId]);
            }
        }
        // gene -> aliasof -> hgnc
        if (record[HEADER.hgncId] && newGene) {
            try {
                const hgnc = await _hgnc.fetchAndLoadBySymbol({ conn, paramType: 'hgnc_id', symbol: record[HEADER.hgncId] });
                await conn.addRecord({
                    content: {
                        in: rid(hgnc), out: rid(gene), source: rid(source),
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'crossreferenceof',
                });
            } catch (err) {
                hgncMissingRecords.add(record[HEADER.hgncId]);
                logger.log('error', `failed cross-linking from ${gene.sourceid} to ${record[HEADER.hgncId]}`);
            }
        }
        counts.success++;
    }

    if (hgncMissingRecords.size) {
        logger.warn(`Unable to retrieve ${hgncMissingRecords.size} hgnc records for linking`);
    }
    if (refseqMissingRecords.size) {
        logger.warn(`Unable to retrieve ${refseqMissingRecords.size} refseq records for linking`);
    }
    logger.info(JSON.stringify(counts));
};

module.exports = { SOURCE_DEFN, dependencies: [refseqName], uploadFile };
