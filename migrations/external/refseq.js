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
const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const {getRecordBy, addRecord, orderPreferredOntologyTerms} = require('./util');


const uploadRefSeq = async (opt) => {
    const {filename, conn} = opt;
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    console.log('parsing into json');
    const json = parse(content, {
        delimiter: '\t', escape: null, quote: null, comment: '##', columns: true, auto_parse: true
    });
    const source = await addRecord('sources', {name: 'refseq'}, conn, {existsOk: true});
    for (const record of json) {
        record.RNA = record.RNA.replace(/\.\d+$/, ''); // separate the sourceIDVersion from the sourceID
        const transcript = await addRecord('features', {biotype: 'transcript', source: source['@rid'].toString(), sourceId: record.RNA}, conn, {existsOK: true});
        let hgnc;
        try {
            hgnc = await getRecordBy('features', {source: {name: 'hgnc'}, name: record.Symbol}, conn, orderPreferredOntologyTerms);
        } catch (err) {
            process.stdout.write('?');
            continue;
        }
        await addRecord('elementof', {out: transcript['@rid'].toString(), in: hgnc['@rid'].toString(), source: source['@rid'].toString()}, conn, {existsOk: true});
    }
    console.log();
};

module.exports = {uploadRefSeq};
