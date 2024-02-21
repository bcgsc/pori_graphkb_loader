/**
 * Requires a BioMart Export file with the columns given by the values in the HEADER constant
 *
 * @module importer/ensembl
 */

const { loadDelimToJson, requestWithRetry, convertRowFields } = require('../util');
const {
    rid, orderPreferredOntologyTerms, generateCacheKey,
} = require('../graphkb');
const { logger } = require('../logging');
const _hgnc = require('../hgnc');
const _entrez = require('../entrez/gene');
const _refseq = require('../entrez/refseq');
const { ensembl: SOURCE_DEFN, refseq: refseqSourceDefn } = require('../sources');

const BASE_URL = 'http://rest.ensembl.org';


const CACHE = {};

/**
 * Create and link a non-versioned record of the current versioned record
 */
const generalize = async (conn, record) => {
    const general = await conn.addRecord({
        content: {
            biotype: record.biotype,
            name: record.name,
            source: record.source,
            sourceId: record.sourceId,
            sourceIdVersion: null,
        },
        existsOk: true,
        target: 'Feature',
    });

    await conn.addRecord({
        content: { in: rid(record), out: rid(general), source: rid(record.source) },
        existsOk: true,
        target: 'Generalizationof',
    });
    return general;
};


/**
 * Fetch the parent feature: gene for transcript, or transcript for protein
 * and then link via element of, return the parent feature
 */
const linkFeatureToParent = async (conn, transcript, parentBiotype = 'gene') => {
    const { Parent: geneId } = await requestWithRetry({
        json: true,
        method: 'GET',
        uri: `${BASE_URL}/lookup/id/${transcript.sourceId}`,
    });

    if (!geneId) {
        return null;
    }
    const gene = await conn.addRecord({
        content: {
            biotype: parentBiotype,
            source: rid(transcript.source),
            sourceId: geneId,
            sourceIdVersion: null,
        },
        existsOk: true,
        target: 'Feature',
    });
    await conn.addRecord({
        content: { in: rid(gene), out: rid(transcript), source: rid(transcript.source) },
        existsOk: true,
        fetchExisting: false,
        target: 'ElementOf',
    });
    return gene;
};


/**
 * Fetch and link the ensembl gene to the entrez gene
 */
const linkGeneToEntrez = async (conn, record) => {
    const xrefs = await requestWithRetry({
        method: 'GET',
        uri: `${BASE_URL}/xrefs/id/${record.sourceId}`,
    });

    for (const xref of xrefs) {
        if (xref.dbname === 'EntrezGene') {
            const [gene] = await _entrez.fetchAndLoadByIds(conn, [xref.primary_id]);

            // link to the current record
            await conn.addRecord({
                content: { in: rid(gene), out: rid(record), source: rid(record.source) },
                existsOk: true,
                target: 'CrossReferenceOf',
            });
            return gene;
        }
    }
    return null;
};


const fetchAndLoadById = async (conn, { sourceId, sourceIdVersion, biotype }) => {
    if (sourceId.includes('.') && !sourceIdVersion) {
        [sourceId, sourceIdVersion] = sourceId.split('.');
    }
    const cacheKey = generateCacheKey({ sourceId, sourceIdVersion });

    if (CACHE[cacheKey]) {
        return CACHE[cacheKey];
    }
    // get the source record from the cache
    if (!CACHE._source) {
        CACHE._source = rid(await conn.addSource(SOURCE_DEFN));
    }

    // try to fetch from graphkb first
    try {
        const result = await conn.getUniqueRecordBy({
            filters: [
                { sourceId },
                { sourceIdVersion },
                { biotype },
                { source: CACHE._source },
            ],
            target: 'Feature',
        });
        CACHE[cacheKey] = result;
        return CACHE[cacheKey];
    } catch (err) {}

    const current = await conn.addRecord({
        content: {
            biotype,
            source: CACHE._source,
            sourceId,
            sourceIdVersion,
        },
        target: 'Feature',
    });

    let generalCurrent;

    if (sourceIdVersion != null) {
        generalCurrent = await generalize(conn, current);
    } else {
        generalCurrent = current;
    }

    if (biotype === 'gene') {
        await linkGeneToEntrez(conn, current);
        return current;
    } if (biotype === 'transcript') {
        // link to the gene
        await linkFeatureToParent(conn, generalCurrent, 'gene');
    } else if (biotype === 'protein') {
        // link to the transcript
        const transcript = await linkFeatureToParent(conn, generalCurrent, 'transcript');
        // link to the gene
        await linkFeatureToParent(conn, transcript, 'gene');
    } else {
        throw Error(`unsupported biotype: ${biotype}`);
    }
    CACHE[cacheKey] = current;
    return current;
};


/**
 * Given a TAB delmited biomart export of Ensembl data, upload the features to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the tab delimited export file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const HEADER = {
        geneIdVersion: 'Gene stable ID version',
        hgncId: 'HGNC ID',
        proteinIdVersion: 'Protein stable ID version',
        refseqId: 'RefSeq mRNA ID',
        transcriptIdVersion: 'Transcript stable ID version',
    };
    const { filename, conn } = opt;
    const contentList = await loadDelimToJson(filename);
    const rows = contentList.map(row => convertRowFields(HEADER, row));

    // process versions
    for (const row of rows) {
        [row.geneId, row.geneIdVersion] = row.geneIdVersion.toLowerCase().split('.');
        [row.transcriptId, row.transcriptIdVersion] = row.transcriptIdVersion.toLowerCase().split('.');

        if (row.proteinIdVersion !== '') {
            [row.proteinId, row.proteinIdVersion] = row.proteinIdVersion.toLowerCase().split('.');
        }
    }

    const source = await conn.addSource(SOURCE_DEFN);

    const refseqSource = await conn.addSource(refseqSourceDefn);


    const visited = {}; // cache genes to speed up adding records
    const hgncMissingRecords = new Set();
    const refseqMissingRecords = new Set();

    logger.info('pre-load the entrez cache to avoid unecessary requests');
    await _entrez.preLoadCache(conn);
    // skip any genes that have already been loaded before we start
    logger.info('retreiving the list of previously loaded genes');
    const preLoadedGene = new Set();
    const genesList = await conn.getRecords({
        filters: {
            AND: [
                { source: rid(source) }, { biotype: 'gene' }, { dependency: null },
            ],
        },
        neighbors: 0,
        target: 'Feature',
    });

    const preLoadedTranscript = new Set();
    const transcriptList = await conn.getRecords({
        filters: {
            AND: [
                { source: rid(source) }, { biotype: 'transcript' }, { dependency: null },
            ],
        },
        neighbors: 0,
        target: 'Feature',
    });

    const preLoadedProtein = new Set();
    const proteinList = await conn.getRecords({
        filters: {
            AND: [
                { source: rid(source) }, { biotype: 'protein' }, { dependency: null },
            ],
        },
        neighbors: 0,
        target: 'Feature',
    });

    const counts = { error: 0, skip: 0, success: 0 };

    for (const record of genesList) {
        const gene = generateCacheKey(record);
        preLoadedGene.add(gene);
        logger.info(`Gene ${gene} has already been loaded`);
    }

    for (const record of transcriptList) {
        const transcript = generateCacheKey(record);
        preLoadedTranscript.add(transcript);
        logger.info(`Transcript ${transcript} has already been loaded`);
    }

    for (const record of proteinList) {
        const protein = generateCacheKey(record);
        preLoadedProtein.add(protein);
        logger.info(`Protein ${protein} has already been loaded`);
    }


    logger.info('pre-fetching refseq entries');
    await _refseq.preLoadCache(conn);
    const missingRefSeqIds = new Set();
    rows.map(r => r.refseqId || '').forEach((id) => {
        if (!_refseq.cacheHas(id) && id) {
            missingRefSeqIds.add(id);
        }
    });

    logger.info(`fetching ${missingRefSeqIds.size} missing refseq entries`);
    await _refseq.fetchAndLoadByIds(conn, Array.from(missingRefSeqIds));

    logger.info(`processing ${rows.length} records`);

    for (let index = 0; index < rows.length; index++) {
        const record = rows[index];

        const { geneId, geneIdVersion } = record;
        const { transcriptId, transcriptIdVersion } = record;
        const { proteinId, proteinIdVersion } = record;

        const geneVersion = generateCacheKey({
            sourceId: geneId,
            sourceIdVersion: geneIdVersion,
        });
        const transcriptVersion = generateCacheKey({
            sourceId: transcriptId,
            sourceIdVersion: transcriptIdVersion,
        });

        let proteinVersion;

        if (proteinIdVersion !== '') {
            proteinVersion = generateCacheKey({
                sourceId: proteinId,
                sourceIdVersion: proteinIdVersion,
            });
        }

        logger.info(`processing ${geneId}.${geneIdVersion || ''} (${index} / ${rows.length})`);

        let newGene = false,
            skip = 0;

        if (preLoadedGene.has(geneVersion)) {
            visited[geneVersion] = genesList.find((gene) => `${gene.sourceId}-${gene.sourceIdVersion}` === geneVersion);
            visited[geneId] = genesList.find((gene) => `${gene.sourceId}` === geneId && gene.sourceIdVersion === null);
            skip++;
        } else {
            if (visited[geneVersion] === undefined) {
                visited[geneVersion] = await conn.addRecord({
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

            await conn.addRecord({
                content: {
                    in: rid(visited[geneVersion]), out: rid(visited[geneId]), source: rid(source),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'generalizationof',
            });
        }

        const gene = visited[geneId];
        const versionedGene = visited[geneVersion];

        // transcript
        if (preLoadedTranscript.has(transcriptVersion)) {
            visited[transcriptVersion] = transcriptList.find((transcript) => `${transcript.sourceId}-${transcript.sourceIdVersion}` === transcriptVersion);
            visited[transcriptId] = transcriptList.find((transcript) => `${transcript.sourceId}` === transcriptId && transcript.sourceIdVersion === null);
            skip++;
        } else {
            if (visited[transcriptVersion] === undefined) {
                visited[transcriptVersion] = await conn.addRecord({
                    content: {
                        biotype: 'transcript',
                        source: rid(source),
                        sourceId: record.transcriptId,
                        sourceIdVersion: record.transcriptIdVersion,
                    },
                    existsOk: true,
                    target: 'Feature',
                });
            }
            if (visited[transcriptId] === undefined) {
                visited[transcriptId] = await conn.addRecord({
                    content: {
                        biotype: 'transcript',
                        source: rid(source),
                        sourceId: record.transcriptId,
                        sourceIdVersion: null,
                    },
                    existsOk: true,
                    target: 'Feature',
                });
                // transcript -> elementof -> gene
                await conn.addRecord({
                    content: {
                        in: rid(gene), out: rid(visited[transcriptId]), source: rid(source),
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'elementof',
                });
            }

            await conn.addRecord({
                content: {
                    in: rid(visited[transcriptVersion]),
                    out: rid(visited[transcriptId]),
                    source: rid(source),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'generalizationof',
            });
        }

        const versionedTranscript = visited[transcriptVersion];
        const transcript = visited[transcriptId];

        // versioned: transcript -> elementof -> gene
        await conn.addRecord({
            content: {
                in: rid(versionedGene),
                out: rid(versionedTranscript),
                source: rid(source),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'elementof',
        });


        // protein
        if (proteinVersion) {
            if (preLoadedProtein.has(proteinVersion)) {
                visited[proteinVersion] = proteinList.find((protein) => `${protein.sourceId}-${protein.sourceIdVersion}` === proteinVersion);
                visited[proteinId] = proteinList.find((protein) => `${protein.sourceId}` === proteinId && protein.sourceIdVersion === null);
                skip++;
            } else {
                if (visited[proteinVersion] === undefined) {
                    visited[proteinVersion] = await conn.addRecord({
                        content: {
                            biotype: 'protein',
                            source: rid(source),
                            sourceId: record.proteinId,
                            sourceIdVersion: record.proteinIdVersion,
                        },
                        existsOk: true,
                        target: 'Feature',
                    });
                }
                if (visited[proteinId] === undefined) {
                    visited[proteinId] = await conn.addRecord({
                        content: {
                            biotype: 'protein',
                            source: rid(source),
                            sourceId: record.proteinId,
                            sourceIdVersion: null,
                        },
                        existsOk: true,
                        target: 'Feature',
                    });
                    // protein -> elementof -> transcript
                    await conn.addRecord({
                        content: {
                            in: rid(transcript), out: rid(visited[proteinId]), source: rid(source),
                        },
                        existsOk: true,
                        fetchExisting: false,
                        target: 'elementof',
                    });
                }

                await conn.addRecord({
                    content: {
                        in: rid(visited[proteinVersion]),
                        out: rid(visited[proteinId]),
                        source: rid(source),
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'generalizationof',
                });
            }

            // versioned: protein -> elementof -> transcript
            await conn.addRecord({
                content: {
                    in: rid(versionedTranscript),
                    out: rid(visited[proteinVersion]),
                    source: rid(source),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'elementof',
            });
        }


        // transcript -> crossreferenceof -> refseq
        if (record.refseqId) {
            skip--;

            try {
                const refseq = await conn.getUniqueRecordBy({
                    filters: {
                        AND: [
                            { source: rid(refseqSource) },
                            { sourceId: record.refseqId },
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
                logger.log('error', `failed cross-linking from ${record.transcriptId} to ${record.refseqId}`);
                refseqMissingRecords.add(record.refseqId);
            }
        }
        // gene -> crossreferenceof -> hgnc
        if (record.hgncId && newGene) {
            skip--;

            try {
                const hgnc = await _hgnc.fetchAndLoadBySymbol({ conn, paramType: 'hgnc_id', symbol: record.hgncId });
                await conn.addRecord({
                    content: {
                        in: rid(hgnc), out: rid(gene), source: rid(source),
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'crossreferenceof',
                });
            } catch (err) {
                hgncMissingRecords.add(record.hgncId);
                logger.log('error', `failed cross-linking from ${gene.sourceid} to ${record.hgncId}`);
            }
        }
        if (proteinVersion && skip === 3) {
            counts.skip++;
            continue;
        } else if (proteinVersion === undefined && skip === 2) {
            counts.skip++;
            continue;
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

module.exports = {
    SOURCE_DEFN,
    fetchAndLoadById,
    uploadFile,
};
