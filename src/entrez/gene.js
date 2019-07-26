/**
 * Loader module for the entrez gene utility
 * @module importer/entrez/gene
 */
const Ajv = require('ajv');

const {checkSpec} = require('../util');
const {fetchByIdList, uploadRecord, preLoadCache: preLoadAnyCache} = require('./util');

const ajv = new Ajv();

const SOURCE_DEFN = {
    name: 'entrez gene',
    url: 'https://www.ncbi.nlm.nih.gov/gene',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: 'Gene integrates information from a wide range of species. A record may include nomenclature, Reference Sequences (RefSeqs), maps, pathways, variations, phenotypes, and links to genome-, phenotype-, and locus-specific resources worldwide.'
};
const CACHE = {};
const DB_NAME = 'gene';
const MAX_CONSEC = 100;

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
const parseRecord = (record) => {
    checkSpec(recordSpec, record);
    return {
        sourceId: record.uid,
        name: record.name,
        biotype: 'gene',
        description: record.description,
        displayName: record.name
    };
};


/**
 * Given some list of pubmed IDs, return if cached,
 * If they do not exist, grab from the pubmed api
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idList list of pubmed IDs
 */
const fetchAndLoadByIds = async (api, idListIn) => {
    const records = await fetchByIdList(
        idListIn,
        {
            db: DB_NAME, parser: parseRecord, cache: CACHE
        }
    );
    const result = [];
    let queue = records;
    while (queue.length > 0) {
        const current = queue.slice(0, MAX_CONSEC);
        queue = queue.slice(MAX_CONSEC);
        const newRecords = await Promise.all(current.map(
            async record => uploadRecord(api, record, {
                cache: CACHE,
                endpoint: 'features',
                sourceDefn: SOURCE_DEFN
            })
        ));
        result.push(...newRecords);
    }
    return result;
};


const preLoadCache = async (api, idList = null) => preLoadAnyCache(api, {sourceDefn: SOURCE_DEFN, cache: CACHE, idList});


module.exports = {
    fetchAndLoadByIds,
    parseRecord,
    SOURCE_DEFN,
    preLoadCache
};
