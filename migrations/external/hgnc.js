/**
 * | | |
 * | --- | --- |
 * | Source | HGNC |
 * | About | https://www.genenames.org/about/overview |
 * | Source Type | Ontology |
 * | Data Example| ftp://ftp.ebi.ac.uk/pub/databases/genenames/new/json/locus_types/gene_with_protein_product.json |
 * | Data Format| JSON |
 *
 *@example <caption>Example record</caption>
 * {
 *      gene_family: [ 'Immunoglobulin like domain containing' ],
 *      date_approved_reserved: '1989-06-30',
 *      vega_id: 'OTTHUMG00000183507',
 *      locus_group: 'protein-coding gene',
 *      status: 'Approved',
 *      _version_: 1598236253568893000,
 *      uuid: '70eda6bc-724a-4370-8b27-5647e64a0ad2',
 *      merops: 'I43.950',
 *      refseq_accession: [ 'NM_130786' ],
 *      locus_type: 'gene with protein product',
 *      gene_family_id: [ 594 ],
 *      cosmic: 'A1BG',
 *      hgnc_id: 'HGNC:5',
 *      rgd_id: [ 'RGD:69417' ],
 *      ensembl_gene_id: 'ENSG00000121410',
 *      entrez_id: '1',
 *      omim_id: [ '138670' ],
 *      symbol: 'A1BG',
 *      location: '19q13.43',
 *      name: 'alpha-1-B glycoprotein',
 *      date_modified: '2015-07-13',
 *      mgd_id: [ 'MGI:2152878' ],
 *      ucsc_id: 'uc002qsd.5',
 *      uniprot_ids: [ 'P04217' ],
 *      ccds_id: [ 'CCDS12976' ],
 *      pubmed_id: [ 2591067 ],
 *      location_sortable: '19q13.43'
 * }
 *
 * @module migrations/external/hgnc
 */
const request = require('request-promise');


const {
    rid, orderPreferredOntologyTerms
} = require('./util');
const {logger, progress} = require('./logging');

const HGNC_API = 'http://rest.genenames.org/fetch/symbol';
const SOURCE_NAME = 'hgnc';
const CLASS_NAME = 'features';


const fetchAndLoadBySymbol = async ({conn, symbol}) => {
    console.log('fetchAndLoadBySymbol', symbol);
    try {
        const record = await conn.getUniqueRecordBy({
            endpoint: CLASS_NAME,
            sortFunc: orderPreferredOntologyTerms,
            where: {source: {name: SOURCE_NAME}, name: symbol}
        });
        return record;
    } catch (err) {}
    // fetch from the HGNC API and upload
    const {response: {docs}} = await request(`${HGNC_API}/${symbol}`, {
        method: 'GET',
        headers: {Accept: 'application/json'},
        json: true
    });
    const [gene] = docs;

    const hgnc = await conn.addRecord({
        endpoint: 'sources',
        content: {name: 'hgnc'},
        fetchFirst: true,
        existsOk: true,
        fetchExisting: true
    });
    let ensembl;
    try {
        ensembl = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'ensembl'},
            fetchFirst: true
        });
    } catch (err) {}

    return conn.uploadRecord({conn, gene, sources: {hgnc, ensembl}});
};

/**
 * Upload a gene record and relationships from the corresponding HGNC record
 * @param {object} opt
 * @param {ApiConnection} opt.conn the graphkb api connection
 * @param {object.<string,object>} opt.source the source records
 * @param {object} opt.gene the gene record from HGNC
 */
const uploadRecord = async ({conn, sources: {hgnc, ensembl}, gene}) => {
    const body = {
        hgnc,
        sourceIdVersion: gene.date_modified,
        sourceId: gene.hgnc_id,
        name: gene.symbol,
        longName: gene.name,
        biotype: 'gene'
    };

    const currentRecord = await conn.addRecord({
        endpoint: CLASS_NAME,
        content: body,
        existsOk: true
    });

    if (gene.ensembl_gene_id && ensembl) {
        try {
            const ensg = await conn.getUniqueRecordBy({
                endpoint: CLASS_NAME,
                where: {source: 'ensembl', biotype: 'gene', sourceId: gene.ensembl_gene_id}
            });
            // try adding the cross reference relationship
            await conn.addRecord({
                endpoint: 'crossreferenceof',
                content: {src: rid(currentRecord), tgt: rid(ensg), source: rid(hgnc)},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            progress('x');
        }
    }
    for (const symbol of gene.prev_symbol || []) {
        const {sourceId, biotype} = currentRecord;
        const deprecatedRecord = await conn.addRecord({
            endpoint: CLASS_NAME,
            content: {
                source: rid(hgnc),
                sourceId,
                dependency: rid(currentRecord),
                deprecated: true,
                biotype,
                name: symbol
            },
            existsOk: true,
            fetchConditions: {
                source: rid(hgnc), sourceId, name: symbol, deprecated: true
            },
            fetchExisting: true
        });
        // link to the current record
        await conn.addRecord({
            endpoint: 'deprecatedby',
            content: {src: rid(deprecatedRecord), tgt: rid(currentRecord), source: rid(hgnc)},
            existsOk: true,
            fetchExisting: false
        });
    }
    for (const symbol of gene.alias_symbol || []) {
        const {sourceId, biotype} = currentRecord;
        try {
            const aliasRecord = await this.addRecord({
                endpoint: CLASS_NAME,
                content: {
                    source: rid(hgnc),
                    name: symbol,
                    sourceId,
                    biotype,
                    dependency: rid(currentRecord)
                },
                existsOk: true,
                fetchConditions: {
                    source: rid(hgnc), sourceId, name: symbol
                }
            });
            await conn.addRecord({
                endpoint: 'aliasof',
                content: {src: rid(aliasRecord), tgt: rid(currentRecord), source: rid(hgnc)},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            progress('x');
        }
    }
};

/**
 * Upload the HGNC genes and ensembl links
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async (opt) => {
    console.log('Loading the external HGNC data');
    const {filename, conn} = opt;
    console.log(`loading: ${filename}`);
    const hgncContent = require(filename); // eslint-disable-line import/no-dynamic-require,global-require
    const genes = hgncContent.response.docs;
    const hgnc = await conn.addRecord({
        endpoint: 'sources',
        content: {name: SOURCE_NAME},
        existsOk: true
    });
    let ensembl;
    try {
        ensembl = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'ensembl'}
        });
    } catch (err) {
        logger.info('Unable to fetch ensembl source for linking records:', err);
    }

    logger.info(`\nAdding ${genes.length} feature records`);
    for (const gene of genes) {
        if (gene.longName && gene.longName.toLowerCase().trim() === 'entry withdrawn') {
            continue;
        }
        await uploadRecord({conn, sources: {hgnc, ensembl}, gene});
    }
    console.log();
};

module.exports = {uploadFile, fetchAndLoadBySymbol, uploadRecord};
