/**
 * Loader module for the entrez gene utility
 * @module importer/entrez/gene
 */
const Ajv = require('ajv');

const {checkSpec} = require('../util');
const {fetchByIdList, uploadRecord, fetchRecord} = require('./util');

const ajv = new Ajv();

const CACHE = {};

const SOURCE_DEFN = {
    name: 'entrez gene',
    url: 'https://www.ncbi.nlm.nih.gov/gene',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: 'Gene integrates information from a wide range of species. A record may include nomenclature, Reference Sequences (RefSeqs), maps, pathways, variations, phenotypes, and links to genome-, phenotype-, and locus-specific resources worldwide.'
};

const recordSpec = ajv.compile({
    type: 'object',
    required: ['uid', 'name'],
    properties: {
        uid: {type: 'string', pattern: '^\\d+$'},
        name: {type: 'string'},
        description: {type: 'string'}
    }
});

/**
 * Given an gene record retrieved from entrez, parse it into its equivalent
 * GraphKB representation
 */
const parseGeneRecord = (record) => {
    checkSpec(recordSpec, record);
    return {
        sourceId: record.uid,
        name: record.name,
        biotype: 'gene',
        description: record.description
    };
};

/**
 * Given some list of entrex Ids, fetch the minimal parsed aricle summaries
 * @param {Array.<string>} geneIdListIn list of entrez ids
 * @param {string} url the base url for the entrez api
 */
const fetchGenesByIds = async (geneIdListIn, url = API) => {
    return fetchByIdList(geneIdList, {
        db: 'gene',
        parser: parseGeneRecord,
        cache: CACHE
    });
};


/**
 * Given the parsed content of some gene, upload to the api
 * @param {object} gene the gene contents to be uploaded
 * @param {object} opt
 * @param {boolean} opt.cache add the GraphKB Publication record to the cache
 * @param {boolean} opt.fetchFirst attempt to get the record by source Id before uploading it
 */
const uploadGene = async (api, gene, opt = {}) => {
    return uploadRecord(api, gene, {
        cache: CACHE,
        endpoint: 'features',
        sourceDefn: SOURCE_DEFN,
        ...opt
    });
};

/**
 * Given some list of entrez IDs, return if cached,
 * If they do not exist, grab from the entrez api
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} geneIdList list of entrez IDs
 */
const uploadGenesByGeneId = async (api, geneIdListIn) => {
    const genes = await fetchGenesByIds(geneIdListIn);
    return Promise.all(genes.map(async gene => uploadGene(api, gene)));
};


const fetchAndLoadById = async (conn, geneId) => {
    return fetchRecord(conn, {
        sourceId: geneId,
        db: 'gene',
        endpoint: 'features',
        cache: CACHE
    });
};


module.exports = {
    fetchGenesByIds,
    parseGeneRecord,
    uploadGene,
    uploadGenesByGeneId,
    fetchAndLoadById,
    SOURCE_DEFN
};
