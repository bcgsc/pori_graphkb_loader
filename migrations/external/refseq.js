/**
 * | | |
 * | --- | --- |
 * | Source | RefSeq |
 * | About | https://www.ncbi.nlm.nih.gov/refseq/about/ |
 * | Source Type | Ontology |
 * | Data Example|  ftp://ftp.ncbi.nih.gov/refseq/H_sapiens/RefSeqGene/LRG_RefSeqGene |
 * | Data Format| Tab-delimited |
 *
 * Import the RefSeq transcripts, ignoring version numbers for now
 * @module migrations/external/refseq
 */
const {
    getRecordBy, addRecord, orderPreferredOntologyTerms, loadDelimToJson, rid
} = require('./util');


const SOURCE_NAME = 'refseq';

/**
 * Parse the tab delimited file to upload features and their relationships
 * For each versioned feature, a generalization (non-versioned) feature is created
 * to facilitate linking from other sources where the version may not be given
 *
 * @param {object} opt options
 * @param {string} opt.filename path to the tab delimited file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const json = await loadDelimToJson(filename);

    const source = await addRecord('sources', {name: SOURCE_NAME}, conn, {existsOk: true});
    for (const record of json) {
        // Load the RNA
        const [rnaName, rnaVersion] = record.RNA.split('.');
        const general = await addRecord('features', {
            biotype: 'transcript', source: rid(source), sourceId: rnaName, sourceIdVersion: null
        }, conn, {existsOk: true});
        const versioned = await addRecord('features', {
            biotype: 'transcript', source: rid(source), sourceId: rnaName, sourceIdVersion: rnaVersion
        }, conn, {existsOk: true});
        // make the general an alias of the versioned
        await addRecord('generalizationof', {out: rid(general), in: rid(versioned), source: rid(source)}, conn, {existsOk: true});

        let hgnc;
        try {
            hgnc = await getRecordBy('features', {source: {name: 'hgnc'}, name: record.Symbol}, conn, orderPreferredOntologyTerms);
            await addRecord('elementof', {out: rid(general), in: rid(hgnc), source: rid(source)}, conn, {existsOk: true});
        } catch (err) {
            process.stdout.write('?');
        }
        // load the protein
        if (record.Protein) {
            const [proteinName, proteinVersion] = record.Protein.split('.');
            const generalProtein = await addRecord('features', {
                biotype: 'protein', source: rid(source), sourceId: proteinName, sourceIdVersion: null
            }, conn, {existsOk: true});
            const versionedProtein = await addRecord('features', {
                biotype: 'protein', source: rid(source), sourceId: proteinName, sourceIdVersion: proteinVersion
            }, conn, {existsOk: true});
            // make the general an alias of the versioned
            await addRecord('generalizationof', {
                out: rid(generalProtein),
                in: rid(versionedProtein),
                source: rid(source)
            }, conn, {existsOk: true});

            await addRecord('elementof', {
                out: rid(generalProtein),
                in: rid(general),
                source: rid(source)
            }, conn, {existsOk: true});

            await addRecord('elementof', {
                out: rid(versionedProtein),
                in: rid(versioned),
                source: rid(source)
            }, conn, {existsOk: true});
        }
    }
    console.log();
};

module.exports = {uploadFile};
