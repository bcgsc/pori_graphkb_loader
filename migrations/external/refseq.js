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
    getRecordBy, addRecord, orderPreferredOntologyTerms, loadDelimToJson
} = require('./util');


const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const json = await loadDelimToJson(filename);

    const source = await addRecord('sources', {name: 'refseq'}, conn, {existsOk: true});
    for (const record of json) {
        // Load the RNA
        const [rnaName, rnaVersion] = record.RNA.split('.');
        const general = await addRecord('features', {
            biotype: 'transcript', source: source['@rid'].toString(), sourceId: rnaName, sourceIdVersion: null
        }, conn, {existsOk: true});
        const versioned = await addRecord('features', {
            biotype: 'transcript', source: source['@rid'].toString(), sourceId: rnaName, sourceIdVersion: rnaVersion
        }, conn, {existsOk: true});
        // make the general an alias of the versioned
        await addRecord('generalizationof', {out: general['@rid'].toString(), in: versioned['@rid'].toString(), source: source['@rid'].toString()}, conn, {existsOk: true});

        let hgnc;
        try {
            hgnc = await getRecordBy('features', {source: {name: 'hgnc'}, name: record.Symbol}, conn, orderPreferredOntologyTerms);
        } catch (err) {
            process.stdout.write('?');
            continue;
        }
        await addRecord('elementof', {out: general['@rid'].toString(), in: hgnc['@rid'].toString(), source: source['@rid'].toString()}, conn, {existsOk: true});
        // load the DNA
        // load the protein
        if (record.Protein) {
            const [proteinName, proteinVersion] = record.Protein.split('.');
            const generalProtein = await addRecord('features', {
                biotype: 'protein', source: source['@rid'].toString(), sourceId: proteinName, sourceIdVersion: null
            }, conn, {existsOk: true});
            const versionedProtein = await addRecord('features', {
                biotype: 'protein', source: source['@rid'].toString(), sourceId: proteinName, sourceIdVersion: proteinVersion
            }, conn, {existsOk: true});
            // make the general an alias of the versioned
            await addRecord('generalizationof', {
                out: generalProtein['@rid'].toString(),
                in: versionedProtein['@rid'].toString(),
                source: source['@rid'].toString()
            }, conn, {existsOk: true});

            await addRecord('elementof', {
                out: generalProtein['@rid'].toString(),
                in: general['@rid'].toString(),
                source: source['@rid'].toString()
            }, conn, {existsOk: true});

            await addRecord('elementof', {
                out: versionedProtein['@rid'].toString(),
                in: versioned['@rid'].toString(),
                source: source['@rid'].toString()
            }, conn, {existsOk: true});
        }
    }
    console.log();
};

module.exports = {uploadFile};
