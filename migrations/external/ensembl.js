/**
 * Requires a BioMart Export file with the following columns
     1	Gene stable ID
     2	Transcript stable ID
     3	Protein stable ID
     4	Protein stable ID version
     5	Gene stable ID version
     6	Transcript stable ID version
     7	Karyotype band
     8	Chromosome/scaffold name
     9	HGNC ID
    10	RefSeq mRNA ID
    11	LRG display in Ensembl gene ID

 * An example of the resulting json record
  { 'Gene stable ID': 'ENSG00000201329',
    'Transcript stable ID': 'ENST00000364459',
    'Protein stable ID': '',
    'Protein stable ID version': '',
    'Gene stable ID version': 'ENSG00000201329.2',
    'Transcript stable ID version': 'ENST00000364459.2',
    'Karyotype band': 'p11.1',
    'Chromosome/scaffold name': 8,
    'HGNC ID': '',
    'RefSeq mRNA ID': '',
    'LRG display in Ensembl gene ID': '' }
 */

const {loadDelimToJson, addRecord, rid} = require('./util');

const HEADER = {
    geneId: 'Gene stable ID',
    geneIdVersion: 'Gene stable ID version',
    transcriptId: 'Transcript stable ID',
    transcriptIdVersion: 'Transcript stable ID version',
    chromosome: 'Chromosome/scaffold name',
    hgncId: 'HGNC ID',
    refseqId: 'RefSeq mRNA ID',
    lrgGene: 'LRG display in Ensembl gene ID',
    proteinId: 'Protein stable ID',
    proteinIdVersion: 'Protein stable ID version'
};


const ACCEPTED_CHROMOSOMES = new Set([
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11',
    '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22',
    'X', 'Y', 'MT'
]);


const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const contentList = await loadDelimToJson(filename);

    const source = await addRecord('sources', {name: 'ensembl'}, conn, {existsOk: true});

    for (const record of contentList) {
        const chromosome = record[HEADER.chromosome];
        if (!ACCEPTED_CHROMOSOMES.has(chromosome)) {
            continue;
        }
        // gene
        const versionedGene = await addRecord('features', {
            source: rid(source),
            sourceId: record[HEADER.geneId],
            sourceIdVersion: record[HEADER.geneIdVersion],
            biotype: 'gene'
        }, conn, {existsOk: true});
        const gene = await addRecord('features', {
            source: rid(source),
            sourceId: record[HEADER.geneId],
            sourceIdVersion: null,
            biotype: 'gene'
        }, conn, {existsOk: true});
        await addRecord('generalizationof', {
            out: rid(gene), in: rid(versionedGene), source: rid(source)
        }, conn, {existsOk: true});

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
        }, conn, {existsOk: true});

        // transcript -> elementof -> gene
        await addRecord('elementof', {
            out: rid(transcript), in: rid(gene), source: rid(source)
        }, conn, {existsOk: true});
        await addRecord('elementof', {
            out: rid(versionedTranscript), in: rid(versionedGene), source: rid(source)
        }, conn, {existsOk: true});

        // protein
        // protein -> elementof -> transcript
        // transcript -> aliasof -> refseq
        // gene -> aliasof -> hgnc
    }
};

module.exports = {uploadFile};
