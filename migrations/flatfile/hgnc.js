const hgnc = require('./../../hgnc_complete_set');
const _ = require('lodash');
const request = require('request-promise');
const PromisePool = require('es6-promise-pool');
const stringSimilarity = require('string-similarity');

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

const BASE_URL = 'http://localhost:8080/api'


const addRecords = function* (arr, token) {
    for (let i=0; i < arr.length; i++) {
        yield addRecord(arr[i], token);
    }
}

const convertNameToSymbol = (name) => {
    let symbol = [];
    const subs = {
        zinc: 'zn',
        antigen: 'age'
    };
    name = name.replace(/(\b(with|and|the|a|or|protein|family member)|-type|type)\b/i, '');
    for (let token of name.split(/(\s|-)+/)) {
        token = token.replace(/[^a-zA-Z0-9]+/, '').trim().toLowerCase();
        if (subs[token] !== undefined) {
            symbol.push(subs[token]);
        } else {
            let match = /^(ZN\b|[A-Z]|[0-9]+|[0-9]+[A-Z]\b)/i.exec(token);
            if (match) {
                symbol.push(match[1].toUpperCase());
            }
        }
    }
    return symbol.join('').toUpperCase();
}


const bestMatches = (symbols, names) => {
    const matches = {};
    for (let name of names) {
        const expectedSymbol = convertNameToSymbol(name);
        for (let symbol of symbols) {
            const sim = stringSimilarity.compareTwoStrings(symbol, expectedSymbol);
            if (matches[symbol] === undefined || matches[symbol].similarity < sim) {
                matches[symbol] = {name: name, expectedSymbol: expectedSymbol, similarity: sim};
            }
        }
    }
    return matches;
}


const addRecord = async (record, token) => {
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
    let opt = {
        method: 'POST',
        uri: `${BASE_URL}/independantfeatures`,
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
            gene = await getActiveFeature(gene, token);
        } else {
            throw err;
        }
    }
    // now try adding the relationships to other gene types
    if (record.ensembl_gene_id) {
        let body; 
        try {
            const ensg = await getActiveFeature({name: record.ensembl_gene_id}, token);
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
            } else if (! err.message.includes('could not get a single feature')) {
                throw err;
            }
        }
    }
    // try adding the previous symbols
    for (let symbol of record.prev_symbol || []) {
        if (symbol.toLowerCase() === gene.name.toLowerCase()) {
            continue;
        }
        let prev;
        try {
            prev = await getActiveFeature({name: symbol, longName: record.name, source: 'hgnc', sourceId: record.hgnc_id}, token);
        } catch (err) {
            
            try {
                prev = await request({
                    method: 'POST',
                    uri: `${BASE_URL}/independantfeatures`,
                    headers: {Authorization: token},
                    json: true,
                    body: {source: 'hgnc', name: symbol, biotype: 'gene', longName: record.name, sourceId: record.hgnc_id}
                });
            } catch (err2) {
                console.log(record);
                console.log(err);
                console.log(err2.error);
                throw new Error('ERROR. Could not select and also cannot add');
            }
        }
        // add deprecated link
        try {
            const newRecord = await request({
                method: 'POST',
                uri: `${BASE_URL}/deprecatedby`,
                body: {out: prev['@rid'], in: gene['@rid']},
                headers: {
                    Authorization: token
                },
                json: true
            });
            process.stdout.write('D');
        } catch (err) {
            if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
                process.stdout.write('d');
            } else {
                throw err;
            }
        }
    }
};


const getActiveFeature = async (opt, token) => {
    opt = {
        method: 'GET',
        uri: `${BASE_URL}/independantfeatures`,
        headers: {
            Authorization: token
        },
        qs: Object.assign({}, opt, {deletedAt: "null"}),
        json: true
    };

    try {
        const rec = await request(opt);
        if (rec.length !== 1) {
            throw new Error(`could not get a single feature with that name: ${opt.qs.name}. Found ${rec.length} features`);
        }
        return rec[0];
    } catch (err) {
        throw err;
    }
}

const uploadHugoGenes = async (token) => {
    const iter = addRecords(hgnc.response.docs, token);
    const pool = new PromisePool(iter, 1);
    await pool.start();
}

module.exports = {uploadHugoGenes, getActiveFeature};
