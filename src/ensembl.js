/**
 * Requires a BioMart Export file with the columns given by the values in the HEADER constant
 *
 * @module importer/ensembl
 */

const {
    loadDelimToJson, rid, orderPreferredOntologyTerms
} = require('./util');
const {logger} = require('./logging');
const _hgnc = require('./hgnc');
const {SOURCE_DEFN: {name: refseqName}} = require('./refseq');

const HEADER = {
    geneId: 'Gene stable ID',
    geneIdVersion: 'Version (gene)',
    transcriptId: 'Transcript stable ID',
    transcriptIdVersion: 'Version (transcript)',
    chromosome: 'Chromosome/scaffold name',
    hgncId: 'HGNC ID',
    hgncName: 'HGNC symbol',
    refseqId: 'RefSeq mRNA ID',
    lrgGene: 'LRG display in Ensembl gene ID',
    proteinId: 'Protein stable ID',
    proteinIdVersion: 'Protein stable ID version',
    geneName: 'Gene name',
    geneNameSource: 'Source of gene name'
};

const SOURCE_DEFN = {
    displayName: 'Ensembl',
    name: _hgnc.ensemblSourceName, // avoid circular dependencies
    usage: 'https://uswest.ensembl.org/info/about/legal/disclaimer.html',
    url: 'https://uswest.ensembl.org',
    description: 'Ensembl is a genome browser for vertebrate genomes that supports research in comparative genomics, evolution, sequence variation and transcriptional regulation. Ensembl annotate genes, computes multiple alignments, predicts regulatory function and collects disease data. Ensembl tools include BLAST, BLAT, BioMart and the Variant Effect Predictor (VEP) for all supported species.'
};


const getCurrentGenesList = async (conn) => {
    const preLoaded = new Set();
    const limit = 1000;
    let lastReturn = limit;
    while (lastReturn >= limit) {
        const {result: genes} = await conn.request({
            uri: 'features',
            qs: {
                source: {name: SOURCE_DEFN.name},
                biotype: 'gene',
                returnProperties: 'sourceId,sourceIdVersion',
                limit,
                skip: preLoaded.size
            }
        });
        lastReturn = genes.length;
        for (const {sourceId, sourceIdVersion} of genes) {
            preLoaded.add(`${sourceId}.${sourceIdVersion}`.toLowerCase());
        }
    }
    return preLoaded;
};


/**
 * Given a TAB delmited biomart export of Ensembl data, upload the features to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the tab delimited export file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const contentList = await loadDelimToJson(filename);

    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });
    let refseqSource;
    try {
        refseqSource = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: refseqName}
        });
    } catch (err) {
        logger.warn('Unable to find refseq source. Will not attempt to create cross-reference links');
    }

    const visited = {}; // cache genes to speed up adding records
    const hgncMissingRecords = new Set();
    const refseqMissingRecords = new Set();

    // skip any genes that have already been loaded before we start
    logger.info('retriving the list of previously loaded genes');
    const preLoaded = await getCurrentGenesList(conn);

    for (const gene of preLoaded) {
        logger.info(`${gene} has already been loaded`);
    }

    logger.info(`processing ${contentList.length} records`);

    for (let index = 0; index < contentList.length; index++) {
        const record = contentList[index];
        record.hgncName = record[HEADER.geneNameSource] === 'HGNC Symbol'
            ? record[HEADER.geneName]
            : null;
        // gene

        const geneId = record[HEADER.geneId];
        const geneIdVersion = record[HEADER.geneIdVersion];
        const key = `${geneId}.${geneIdVersion}`.toLowerCase();

        if (preLoaded.has(key)) {
            continue;
        }
        logger.info(`processing ${geneId}.${geneIdVersion || ''} (${index} / ${contentList.length})`);
        let newGene = false;

        if (visited[key] === undefined) {
            visited[key] = await conn.addRecord({
                endpoint: 'features',
                content: {
                    source: rid(source),
                    sourceId: geneId,
                    sourceIdVersion: geneIdVersion,
                    biotype: 'gene'
                },
                existsOk: true
            });
        }

        if (visited[geneId] === undefined) {
            newGene = true;
            visited[geneId] = await conn.addRecord({
                endpoint: 'features',
                content: {
                    source: rid(source),
                    sourceId: geneId,
                    sourceIdVersion: null,
                    biotype: 'gene'
                },
                existsOk: true
            });
        }
        const gene = visited[geneId];
        const versionedGene = visited[key];

        await conn.addRecord({
            endpoint: 'generalizationof',
            content: {
                out: rid(gene), in: rid(versionedGene), source: rid(source)
            },
            existsOk: true,
            fetchExisting: false
        });

        // transcript
        const versionedTranscript = await conn.addRecord({
            endpoint: 'features',
            content: {
                source: rid(source),
                sourceId: record[HEADER.transcriptId],
                sourceIdVersion: record[HEADER.transcriptIdVersion],
                biotype: 'transcript'
            },
            existsOk: true
        });
        const transcript = await conn.addRecord({
            endpoint: 'features',
            content: {
                source: rid(source),
                sourceId: record[HEADER.transcriptId],
                sourceIdVersion: null,
                biotype: 'transcript'
            },
            existsOk: true
        });
        await conn.addRecord({
            endpoint: 'generalizationof',
            content: {
                out: rid(transcript), in: rid(versionedTranscript), source: rid(source)
            },
            existsOk: true,
            fetchExisting: false
        });

        // transcript -> elementof -> gene
        await conn.addRecord({
            endpoint: 'elementof',
            content: {
                out: rid(transcript), in: rid(gene), source: rid(source)
            },
            existsOk: true,
            fetchExisting: false
        });
        await conn.addRecord({
            endpoint: 'elementof',
            content: {
                out: rid(versionedTranscript), in: rid(versionedGene), source: rid(source)
            },
            existsOk: true,
            fetchExisting: false
        });

        // TODO: protein
        // TODO: protein -> elementof -> transcript

        // transcript -> aliasof -> refseq
        if (refseqSource && record[HEADER.refseqId]) {
            try {
                const refseq = await conn.getUniqueRecordBy({
                    endpoint: 'features',
                    where: {
                        source: rid(refseqSource),
                        sourceId: record[HEADER.refseqId],
                        sourceIdVersion: null
                    },
                    sort: orderPreferredOntologyTerms
                });
                await conn.addRecord({
                    endpoint: 'crossreferenceof',
                    content: {
                        out: rid(transcript), in: rid(refseq), source: rid(source)
                    },
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err) {
                refseqMissingRecords.add(record[HEADER.refseqId]);
            }
        }
        // gene -> aliasof -> hgnc
        if (record[HEADER.hgncId] && newGene) {
            try {
                const hgnc = await _hgnc.fetchAndLoadBySymbol({conn, paramType: 'hgnc_id', symbol: record[HEADER.hgncId]});
                await conn.addRecord({
                    endpoint: 'crossreferenceof',
                    content: {
                        out: rid(gene), in: rid(hgnc), source: rid(source)
                    },
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err) {
                hgncMissingRecords.add(record[HEADER.hgncId]);
                logger.log('error', `failed cross-linking from ${gene.sourceid} to ${record[HEADER.hgncId]}`);
            }
        }
    }
    if (hgncMissingRecords.size) {
        logger.warn(`Unable to retrieve ${hgncMissingRecords.size} hgnc records for linking`);
    }
    if (refseqMissingRecords.size) {
        logger.warn(`Unable to retrieve ${refseqMissingRecords.size} refseq records for linking`);
    }
};

module.exports = {uploadFile, dependencies: [refseqName], SOURCE_DEFN};
