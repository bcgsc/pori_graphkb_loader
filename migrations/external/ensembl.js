/**
 * Requires a BioMart Export file with the columns given by the values in the HEADER constant
 */

const {
    loadDelimToJson, addRecord, getRecordBy, rid, orderPreferredOntologyTerms
} = require('./util');
const {progress} = require('./logging');

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

const SOURCE_NAME = 'ensembl';

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
        content: {name: SOURCE_NAME},
        existsOk: true
    });
    let refseqSource;
    try {
        refseqSource = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'refseq'}
        });
    } catch (err) {
        progress('x');
    }
    let hgncSource;
    try {
        hgncSource = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'hgnc'}
        });
    } catch (err) {
        progress('x');
    }

    const visited = {}; // cache genes to speed up adding records

    for (const record of contentList) {
        record.hgncName = record[HEADER.geneNameSource] === 'HGNC Symbol'
            ? record[HEADER.geneName]
            : null;
        // gene

        const geneId = record[HEADER.geneId];
        const geneIdVersion = record[HEADER.geneIdVersion];
        let newGene = false;

        if (visited[`${geneId}.${geneIdVersion}`] === undefined) {
            visited[`${geneId}.${geneIdVersion}`] = await conn.addRecord({
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
        const versionedGene = visited[`${geneId}.${geneIdVersion}`];

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
                progress(`[missing: ${record[HEADER.refseqId]}]`);
                progress('x');
            }
        }
        // gene -> aliasof -> hgnc
        if (hgncSource && record[HEADER.hgncId] && record.hgncName && newGene) {
            try {
                const hgnc = await conn.getUniqueRecordBy({
                    endpoint: 'features',
                    where: {
                        source: rid(hgncSource),
                        sourceId: record[HEADER.hgncId],
                        name: record.hgncName
                    },
                    sort: orderPreferredOntologyTerms
                });
                await conn.addRecord({
                    endpoint: 'crossreferenceof',
                    content: {
                        out: rid(gene), in: rid(hgnc), source: rid(source)
                    },
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err) {
                progress(`[missing: ${record[HEADER.hgncId]}/${record.hgncName}]`);
                progress('x');
            }
        }
    }
};

module.exports = {uploadFile, dependencies: ['refseq', 'hgnc']};
