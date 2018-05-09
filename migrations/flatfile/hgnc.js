const _ = require('lodash');
const request = require('request-promise');
const PromisePool = require('es6-promise-pool');

/* example record
{ gene_family: [ 'Immunoglobulin like domain containing' ],
  date_approved_reserved: '1989-06-30',
  vega_id: 'OTTHUMG00000183507',
  locus_group: 'protein-coding gene',
  status: 'Approved',
  _version_: 1598236253568893000,
  uuid: '70eda6bc-724a-4370-8b27-5647e64a0ad2',
  merops: 'I43.950',
  refseq_accession: [ 'NM_130786' ],
  locus_type: 'gene with protein product',
  gene_family_id: [ 594 ],
  cosmic: 'A1BG',
  hgnc_id: 'HGNC:5',
  rgd_id: [ 'RGD:69417' ],
  ensembl_gene_id: 'ENSG00000121410',
  entrez_id: '1',
  omim_id: [ '138670' ],
  symbol: 'A1BG',
  location: '19q13.43',
  name: 'alpha-1-B glycoprotein',
  date_modified: '2015-07-13',
  mgd_id: [ 'MGI:2152878' ],
  ucsc_id: 'uc002qsd.5',
  uniprot_ids: [ 'P04217' ],
  ccds_id: [ 'CCDS12976' ],
  pubmed_id: [ 2591067 ],
  location_sortable: '19q13.43' }
*/

let LOAD_LIMIT;


const addRecords = function* (arr, token) {
    const limit = LOAD_LIMIT !== undefined ? Math.min(arr.length, LOAD_LIMIT) : arr.length;
    for (let i=0; i < limit; i++) {
        yield addRecord(arr[i], token);
    }
};


const addRecord = async (record, conn) => {
    if (record.status.toLowerCase() === 'entry withdrawn') {
        return;
    }
    record.prev_name = record.prev_name || [];
    record.prev_symbol = record.prev_symbol || [];
    let gene = {
        source: 'hgnc',
        nameVersion: record.date_modified,
        sourceId: record.hgnc_id,
        name: record.symbol,
        longName: record.name,
        biotype: 'gene'
    };

    // add the record to the kb
    let opt = conn.request({
        method: 'POST',
        uri: `independantfeatures`,
        body: gene
    });
    try {
        gene = await request(opt);
        process.stdout.write('.');
    } catch (err) {
        if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
            // already exists, try relating it
            process.stdout.write('*');
            gene = await getActiveFeature(gene, conn);
        } else {
            throw err;
        }
    }
    // now try adding the relationships to other gene types
    if (record.ensembl_gene_id) {
        let body;
        try {
            const ensg = await getActiveFeature({name: record.ensembl_gene_id}, conn);
            if (ensg) {
                body = {out: gene['@rid'], in: ensg['@rid']};
                await request(conn.request({
                    method: 'POST',
                    uri: 'aliasof',
                    body: body
                }));
                process.stdout.write('-');
            }
        } catch (err) {
            if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
                process.stdout.write('=');
            } else if (! err.message.includes('could not get a single feature')) {
                throw err;
            }
        }
    }
    // try adding the previous symbols
    await Promise.all(Array.from(record.prev_symbol, (symbol) => {
        return addRelatedHugoGene(gene, symbol, conn, 'deprecatedby');
    }));
    // try adding the previous symbols
    for (let symbol of record.alias_symbol || []) {
        await addRelatedHugoGene(gene, symbol, conn, 'aliasof');
    }
};


const addRelatedHugoGene = async (gene, symbol, conn, relation='deprecatedby') => {
    if (symbol.toLowerCase() === gene.name.toLowerCase()) {
        return;
    }
    let prev = {source: 'hgnc', name: symbol, biotype: 'gene', longName: gene.longName, sourceId: gene.sourceId};
    try {
        prev = await getActiveFeature(prev, conn);
        process.stdout.write('*');
    } catch (err) {
        try {
            prev = await request(conn.request({
                method: 'POST',
                uri: `independantfeatures`,
                body: prev
            }));
            process.stdout.write('.');
        } catch (err2) {
            throw new Error('ERROR. Could not select and also cannot add');
        }
    }
    // add link
    try {
        await request(conn.request({
            method: 'POST',
            uri: `${relation}`,
            body: {out: prev['@rid'], in: gene['@rid']}
        }));
        process.stdout.write(relation[0].toUpperCase());
    } catch (err) {
        if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
            process.stdout.write(relation[0].toLowerCase());
        } else {
            throw err;
        }
    }
};


const getActiveFeature = async (opt, conn) => {
    opt = conn.request({
        uri: 'independantfeatures',
        qs: Object.assign({}, opt, {deletedAt: 'null'})
    });

    try {
        const rec = await request(opt);
        if (rec.length !== 1) {
            throw new Error(`could not get a single feature with that name: ${opt.qs.name}. Found ${rec.length} features`);
        }
        return rec[0];
    } catch (err) {
        throw err;
    }
};

const uploadHugoGenes = async (opt) => {
    const hgnc = require(opt.filename);
    const iter = addRecords(hgnc.response.docs, opt.conn);
    const pool = new PromisePool(iter, 10);
    await pool.start();
};

module.exports = {uploadHugoGenes, getActiveFeature};
