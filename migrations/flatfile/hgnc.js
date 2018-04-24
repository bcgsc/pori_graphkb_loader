const hgnc = require('./../../hgnc_complete_set');
const _ = require('lodash');
const request = require('request-promise');

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
    const genes = {};
    const aliasOf = [];
    const deprecatedBy = [];
    for (let record of hgnc.response.docs) {
        if (record.status.toLowerCase() === 'entry withdrawn') {
            continue;
        }
        const gene = {
            source: 'hgnc',
            nameVersion: record.date_modified,
            sourceId: record.hgnc_id,
            name: record.symbol,
            fullName: record.name,
            biotype: 'gene'
        };
        if (genes[gene.name] !== undefined) {
            console.error(record);
            console.error(gene)
            console.error(genes[gene.name]);
            break;
        }

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
            const newRecord = await request(opt);
            genes[gene.name] = newRecord;
            process.stdout.write('.');
        } catch (err) {
            if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
                // already exists, try relating it
                process.stdout.write('*');
                const result = await getFeatureByName(gene.name, token);
                genes[gene.name] = result;
            } else {
                console.log(err.error);
                console.log(opt);
                break;
            }
        }

        // now try adding the relationships to other gene types
        if (! record.ensembl_gene_id) {
            continue;
        }
        let body; 
        try {
            if (genes[record.ensembl_gene_id] === undefined) {
                genes[record.ensembl_gene_id] = await getFeatureByName(record.ensembl_gene_id, token);
                if (! genes[record.ensembl_gene_id]) {
                    continue;
                }
            }
            body = {out: genes[gene.name]['@rid'], in: genes[record.ensembl_gene_id]['@rid']};
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
    }
}

module.exports = { uploadHugoGenes };
