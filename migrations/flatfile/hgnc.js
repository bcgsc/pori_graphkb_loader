const hgnc = require('./../../hgnc_complete_set');
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


const addRecords = function* (arr, token) {
    for (let i=0; i < arr.length; i++) {
        yield addRecord(arr[i], token)
    }
}

const addRecord = async (record, token) => {
    if (record.status.toLowerCase() === 'entry withdrawn') {
        return;
    }
    let gene = {
        source: 'hgnc',
        nameVersion: record.date_modified,
        sourceId: record.hgnc_id,
        name: record.symbol,
        fullName: record.name,
        biotype: 'gene'
    };

    // add the record to the kb
    let opt = {
        method: 'POST',
        uri: 'http://localhost:8080/api/features',
        body: gene,
        headers: {
            Authorization: token
        },
        json: true
    };
    try {
        gene = await request(opt);
        process.stdout.write('.');
    } catch (err) {
        if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
            // already exists, try relating it
            process.stdout.write('*');
            gene = await getFeatureByName(gene.name, token);
        } else {
            console.log(err.error);
            console.log(opt);
            throw err;
        }
    }

    // now try adding the relationships to other gene types
    if (! record.ensembl_gene_id) {
        return;
    }
    let body; 
    try {
        const ensg = await getFeatureByName(record.ensembl_gene_id, token);
        if (! ensg) {
            return;
        }
        body = {out: gene['@rid'], in: ensg['@rid']};
        const newRecord = await request({
            method: 'POST',
            uri: 'http://localhost:8080/api/aliasof',
            body: body,
            headers: {
                Authorization: token
            },
            json: true
        });
        process.stdout.write('-');
    } catch (err) {
        if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
            process.stdout.write('=');
        } else {
            console.error(err.message);
            console.error(body);
            console.error(genes[gene.name]);
            console.error(genes[record.ensembl_gene_id]);
            console.log(record);
            throw err;
        }
    }
};


const getFeatureByName = async (name, token) => {
    let opt = {
        method: 'GET',
        uri: `http://localhost:8080/api/features`,
        headers: {
            Authorization: token
        },
        qs: {name: name, deletedAt: null},
        json: true
    };

    try {
        const rec = await request(opt);
        return rec[0];
    } catch (err) {
        console.log(err.error);
        console.log(opt);
    }
}

const uploadHugoGenes = async (token) => {
    const iter = addRecords(hgnc.response.docs, token);
    const pool = new PromisePool(iter, 100);
    await pool.start();
}

module.exports = { uploadHugoGenes };
