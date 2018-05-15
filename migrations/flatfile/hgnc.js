const {getRecordBy, addRecord} = require('./util');

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


const uploadHugoGenes = async (opt) => {
    const {filename, conn} = opt;
    console.log(`loading: ${filename}`);
    const hgnc = require(filename);
    const genes = hgnc.response.docs;
    const aliasOf = [];
    const ensemblLinks = [];
    const deprecatedBy = [];
    const records = {};

    console.log(`\nAdding ${genes.length} feature records`);
    for (let gene of genes) {
        let body = {
            source: 'hgnc',
            sourceIdVersion: gene.date_modified,
            sourceId: gene.hgnc_id,
            name: gene.symbol,
            longName: gene.name,
            biotype: 'gene'
        };
        const record = await addRecord('independantfeatures', body, conn, true);
        records[record.sourceId] = record;

        if (record.ensembl_gene_id) {
            try {
                const ensembl = await getRecordBy('independantfeatures', {source: 'ensembl', biotype: 'gene', sourceId: record.ensembl_gene_id}, conn);
                ensemblLinks.push({src: record['@rid'], tgt: ensembl['@rid']});
            } catch (err) {
                process.stdout.write('x');
            }
        }
        for (let symbol of record.prev_symbol || []) {
            const related = await addRecord('independantfeatures', {
                source: record.source,
                sourceId: record.sourceId,
                biotype: record.biotype,
                name: symbol
            });
            deprecatedBy.push({src: related['@rid'], tgt: record['@rid']});
        }
        for (let symbol of record.alias_symbol || []) {
            try {
                const related = getRecordBy('independantfeatures', {source: 'hgnc', name: symbol}, conn);
                aliasOf.push({src: record['@rid'], tgt: related['@rid']});
            } catch (err) {
                process.stdout.write('x');
            }
        }
    }
    console.log(`\nAdding the ${ensemblLinks.length} ensembl links`);
    for (let {src, tgt} of ensemblLinks) {
        await addRecord('aliasof', {out: src, in: tgt}, conn, true);
    }
    console.log(`\nAdding the ${aliasOf.length} aliasof links`);
    for (let {src, tgt} of aliasOf) {
        await addRecord('aliasof', {out: src, in: tgt}, conn, true);
    }
    console.log(`\nAdding the ${deprecatedBy.length} deprecatedby links`);
    for (let {src, tgt} of deprecatedBy) {
        await addRecord('deprecatedby', {out: src, in: tgt}, conn, true);
    }
};

module.exports = {uploadHugoGenes};
