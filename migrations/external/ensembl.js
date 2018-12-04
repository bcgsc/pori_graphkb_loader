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

    const source = await addRecord('sources', {name: SOURCE_NAME}, conn, {existsOk: true});
    let refseqSource;
    try {
        refseqSource = await getRecordBy('sources', {name: 'refseq'}, conn);
    } catch (err) {
        progress('x');
    }
    let hgncSource;
    try {
        hgncSource = await getRecordBy('sources', {name: 'hgnc'}, conn);
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
            visited[`${geneId}.${geneIdVersion}`] = await addRecord('features', {
                source: rid(source),
                sourceId: geneId,
                sourceIdVersion: geneIdVersion,
                biotype: 'gene'
            }, conn, {existsOk: true});
        }

        if (visited[geneId] === undefined) {
            newGene = true;
            visited[geneId] = await addRecord('features', {
                source: rid(source),
                sourceId: geneId,
                sourceIdVersion: null,
                biotype: 'gene'
            }, conn, {existsOk: true});
        }
        const gene = visited[geneId];
        const versionedGene = visited[`${geneId}.${geneIdVersion}`];

        await addRecord('generalizationof', {
            out: rid(gene), in: rid(versionedGene), source: rid(source)
        }, conn, {existsOk: true, get: false});

        // transcript
        const versionedTranscript = await addRecord('features', {
            source: rid(source),
            sourceId: record[HEADER.transcriptId],
            sourceIdVersion: record[HEADER.transcriptIdVersion],
            biotype: 'transcript'
        }, conn, {existsOk: true});
        const transcript = await addRecord('features', {
            source: rid(source),
            sourceId: record[HEADER.transcriptId],
            sourceIdVersion: null,
            biotype: 'transcript'
        }, conn, {existsOk: true});
        await addRecord('generalizationof', {
            out: rid(transcript), in: rid(versionedTranscript), source: rid(source)
        }, conn, {existsOk: true, get: false});

        // transcript -> elementof -> gene
        await addRecord('elementof', {
            out: rid(transcript), in: rid(gene), source: rid(source)
        }, conn, {existsOk: true, get: false});
        await addRecord('elementof', {
            out: rid(versionedTranscript), in: rid(versionedGene), source: rid(source)
        }, conn, {existsOk: true, get: false});

        // TODO: protein
        // TODO: protein -> elementof -> transcript

        // transcript -> aliasof -> refseq
        if (refseqSource && record[HEADER.refseqId]) {
            try {
                const refseq = await getRecordBy('features', {
                    source: rid(refseqSource),
                    sourceId: record[HEADER.refseqId],
                    sourceIdVersion: null
                }, conn, orderPreferredOntologyTerms);
                await addRecord('crossreferenceof', {
                    out: rid(transcript), in: rid(refseq), source: rid(source)
                }, conn, {existsOk: true, get: false});
            } catch (err) {
                progress(`[missing: ${record[HEADER.refseqId]}]`);
                progress('x');
            }
        }
        // gene -> aliasof -> hgnc
        if (hgncSource && record[HEADER.hgncId] && record.hgncName && newGene) {
            try {
                const hgnc = await getRecordBy('features', {
                    source: rid(hgncSource),
                    sourceId: record[HEADER.hgncId],
                    name: record.hgncName
                }, conn, orderPreferredOntologyTerms);
                await addRecord('crossreferenceof', {
                    out: rid(gene), in: rid(hgnc), source: rid(source)
                }, conn, {existsOk: true, get: false});
            } catch (err) {
                progress(`[missing: ${record[HEADER.hgncId]}/${record.hgncName}]`);
                progress('x');
            }
        }
    }
};

module.exports = {uploadFile, dependencies: ['refseq', 'hgnc']};
