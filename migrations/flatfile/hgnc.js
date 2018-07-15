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


const SOURCE_NAME = 'hgnc';
const CLASS_NAME = 'features';

const uploadHugoGenes = async (opt) => {
    console.log('Loading the external HGNC data');
    const {filename, conn} = opt;
    console.log(`loading: ${filename}`);
    const hgnc = require(filename);
    const genes = hgnc.response.docs;
    const aliasOf = [];
    const ensemblLinks = [];
    const deprecatedBy = [];
    const records = {};
    let source = await addRecord('sources', {name: SOURCE_NAME}, conn, true);
    source = source['@rid'].toString();
    let ensemblSource;
    try {
        let ensemblSource = getRecordBy('sources', {name: 'ensembl'}, conn);
    } catch (err) {
        console.log('Unable to fetch ensembl source for llinking records:', err);
    }

    console.log(`\nAdding ${genes.length} feature records`);
    for (let gene of genes) {
        let body = {
            source,
            sourceIdVersion: gene.date_modified,
            sourceId: gene.hgnc_id,
            name: gene.symbol,
            longName: gene.name,
            biotype: 'gene'
        };
        if (gene.longName && gene.longName.toLowerCase().trim() === 'entry withdrawn') {
            continue;
        }
        const record = await addRecord(CLASS_NAME, body, conn, true);
        records[record.sourceId] = record;

        if (gene.ensembl_gene_id && ensemblSource) {
            try {
                const ensembl = await getRecordBy(CLASS_NAME, {source: 'ensembl', biotype: 'gene', sourceId: gene.ensembl_gene_id}, conn);
                ensemblLinks.push({src: record['@rid'], tgt: ensembl['@rid']});
            } catch (err) {
                process.stdout.write('x');
            }
        }
        for (let symbol of gene.prev_symbol || []) {
            const related = await addRecord(CLASS_NAME, {
                source,
                sourceId: record.sourceId,
                dependency: record['@rid'].toString(),
                deprecated: true,
                biotype: record.biotype,
                name: symbol
            }, conn, true, ['dependency']);
            deprecatedBy.push({src: related['@rid'], tgt: record['@rid']});
        }
        for (let symbol of gene.alias_symbol || []) {
            try {
                const related = await addRecord(CLASS_NAME, {
                    source,
                    name: symbol,
                    sourceId: record.sourceId,
                    biotype: record.biotype,
                    dependency: record['@rid'].toString()
                }, conn, true, ['dependency']);
                aliasOf.push({src: record['@rid'], tgt: related['@rid']});
            } catch (err) {
                process.stdout.write('x');
            }
        }
    }
    if (ensemblSource) {
        console.log(`\nAdding the ${ensemblLinks.length} ensembl links`);
        for (let {src, tgt} of ensemblLinks) {
            await addRecord('aliasof', {out: src, in: tgt, source}, conn, true);
        }
    }
    console.log(`\nAdding the ${aliasOf.length} aliasof links`);
    for (let {src, tgt} of aliasOf) {
        await addRecord('aliasof', {out: src, in: tgt, source}, conn, true);
    }
    console.log(`\nAdding the ${deprecatedBy.length} deprecatedby links`);
    for (let {src, tgt} of deprecatedBy) {
        await addRecord('deprecatedby', {out: src, in: tgt, source}, conn, true);
    }
    console.log();
};

module.exports = {uploadHugoGenes};
