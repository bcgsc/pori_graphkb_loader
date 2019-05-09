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
 * @module importer/hgnc
 */
const request = require('request-promise');
const Ajv = require('ajv');
const jsonpath = require('jsonpath');

const {
    rid, orderPreferredOntologyTerms
} = require('./util');
const {logger} = require('./logging');

const ajv = new Ajv();

const HGNC_API = 'http://rest.genenames.org/fetch';
const CLASS_NAME = 'features';

const SOURCE_DEFN = {
    name: 'hgnc',
    url: 'https://www.genenames.org/about',
    usage: 'https://www.ebi.ac.uk/about/terms-of-use',
    description: `
        The HGNC is responsible for approving unique symbols and names for human loci, including
        protein coding genes, ncRNA genes and pseudogenes, to allow unambiguous scientific
        communication.`.replace(/\s+/, ' ')
};
const CACHE = {};
/**
 * This defines the expected format of a response from the HGNC API
 */
const validateHgncSpec = ajv.compile({
    type: 'object',
    properties: {
        date_modified: {type: 'string'},
        hgnc_id: {type: 'string', pattern: '^HGNC:[0-9]+$'},
        name: {type: 'string'},
        symbol: {type: 'string'},
        ensembl_gene_id: {type: 'string', pattern: '^ENSG[0-9]+$'},
        prev_symbol: {type: 'array', items: {type: 'string'}},
        alias_symbol: {type: 'array', items: {type: 'string'}}
    }
});

/**
 * Upload a gene record and relationships from the corresponding HGNC record
 * @param {object} opt
 * @param {ApiConnection} opt.conn the graphkb api connection
 * @param {object.<string,object>} opt.source the source records
 * @param {object} opt.gene the gene record from HGNC
 */
const uploadRecord = async ({
    conn, sources: {hgnc, ensembl}, gene, ensemblMissingRecords = new Set()
}) => {
    const body = {
        source: rid(hgnc),
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

    CACHE[currentRecord.sourceId] = currentRecord;
    CACHE[currentRecord.name] = currentRecord;

    if (gene.ensembl_gene_id && ensembl) {
        try {
            const ensg = await conn.getUniqueRecordBy({
                endpoint: CLASS_NAME,
                where: {source: rid(ensembl), biotype: 'gene', sourceId: gene.ensembl_gene_id}
            });
            // try adding the cross reference relationship
            await conn.addRecord({
                endpoint: 'crossreferenceof',
                content: {src: rid(currentRecord), tgt: rid(ensg), source: rid(hgnc)},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            ensemblMissingRecords.add(gene.ensembl_gene_id);
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
            content: {out: rid(deprecatedRecord), in: rid(currentRecord), source: rid(hgnc)},
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
                content: {out: rid(aliasRecord), in: rid(currentRecord), source: rid(hgnc)},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {}
    }
    return currentRecord;
};


const fetchAndLoadBySymbol = async ({
    conn, symbol, paramType = 'symbol', ignoreCache = false
}) => {
    if (CACHE[symbol.toLowerCase()] && !ignoreCache) {
        return CACHE[symbol.toLowerCase()];
    }
    try {
        const where = {source: {name: SOURCE_DEFN.name}};
        if (paramType === 'symbol') {
            where.name = symbol;
        } else {
            where.sourceId = symbol;
        }
        const record = await conn.getUniqueRecordBy({
            endpoint: CLASS_NAME,
            sort: orderPreferredOntologyTerms,
            where
        });
        if (!ignoreCache) {
            CACHE[symbol.toLowerCase()] = record;
        }
        return record;
    } catch (err) {}
    // fetch from the HGNC API and upload
    const uri = `${HGNC_API}/${paramType}/${
        paramType === 'hgnc_id'
            ? symbol.replace(/^HGNC:/i, '')
            : symbol
    }`;
    logger.info(`loading: ${uri}`);
    const {response: {docs}} = await request(`${uri}`, {
        method: 'GET',
        headers: {Accept: 'application/json'},
        json: true
    });
    for (const record of docs) {
        if (!validateHgncSpec(record)) {
            throw new Error(
                `Spec Validation failed for fetch response of symbol ${
                    symbol
                } #${
                    validateHgncSpec.errors[0].dataPath
                } ${
                    validateHgncSpec.errors[0].message
                } found ${
                    jsonpath.query(record, `$${validateHgncSpec.errors[0].dataPath}`)
                }`
            );
        }
    }
    const [gene] = docs;

    let hgnc;
    if (CACHE.SOURCE) {
        hgnc = CACHE.SOURCE;
    } else {
        hgnc = await conn.addRecord({
            endpoint: 'sources',
            content: SOURCE_DEFN,
            fetchConditions: {name: SOURCE_DEFN.name},
            existsOk: true,
            fetchExisting: true
        });
        CACHE.SOURCE = hgnc;
    }
    let ensembl;
    try {
        ensembl = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'ensembl'}
        });
    } catch (err) {}
    return uploadRecord({conn, gene, sources: {hgnc, ensembl}});
};

/**
 * Upload the HGNC genes and ensembl links
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async (opt) => {
    logger.info('loading the external HGNC data');
    const {filename, conn} = opt;
    logger.info(`loading: ${filename}`);
    const hgncContent = require(filename); // eslint-disable-line import/no-dynamic-require,global-require
    const genes = hgncContent.response.docs;
    const hgnc = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });
    let ensembl;
    const ensemblMissingRecords = new Set();
    try {
        ensembl = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'ensembl'}
        });
    } catch (err) {
        logger.info('Unable to fetch ensembl source for linking records');
    }

    logger.info(`adding ${genes.length} feature records`);
    for (const gene of genes) {
        if (!validateHgncSpec(gene)) {
            logger.warn(`Spec Validation failed for fetch response of symbol ${
                gene && gene.hgnc_id
            } #${
                validateHgncSpec.errors[0].dataPath
            } ${
                validateHgncSpec.errors[0].message
            } found ${
                jsonpath.query(gene, `$${validateHgncSpec.errors[0].dataPath}`)
            }`);
            continue;
        }
        if (gene.longName && gene.longName.toLowerCase().trim() === 'entry withdrawn') {
            continue;
        }
        await uploadRecord({conn, sources: {hgnc, ensembl}, gene});
    }
    if (ensemblMissingRecords.size) {
        logger.warn(`Unable to retrieve ${ensemblMissingRecords.size} ensembl records for linking`);
    }
};

module.exports = {
    uploadFile, fetchAndLoadBySymbol, uploadRecord, SOURCE_DEFN, dependencies: ['ensembl']
};
