/**
 * Loader module for the entrez gene utility
 * @module importer/entrez/gene
 */
const Ajv = require('ajv');

const { checkSpec } = require('../util');
const util = require('./util');

const ajv = new Ajv();

const SOURCE_DEFN = {
    name: 'entrez gene',
    url: 'https://www.ncbi.nlm.nih.gov/gene',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: 'Gene integrates information from a wide range of species. A record may include nomenclature, Reference Sequences (RefSeqs), maps, pathways, variations, phenotypes, and links to genome-, phenotype-, and locus-specific resources worldwide.',
};
const CACHE = {};
const SEARCH_CACHE = {};
const DB_NAME = 'gene';
const MAX_CONSEC = 100;

const recordSpec = ajv.compile({
    type: 'object',
    required: ['uid', 'name'],
    properties: {
        uid: { type: 'string', pattern: '^\\d+$' },
        name: { type: 'string' },
        description: { type: 'string' },
    },
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
        displayName: record.name,
    };
};


/**
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idList list of pubmed IDs
 */
const fetchAndLoadGeneByIds = async (api, idListIn) => util.fetchAndLoadByIds(
    api,
    idListIn,
    {
        dbName: DB_NAME,
        parser: parseRecord,
        cache: CACHE,
        target: 'Feature',
        sourceDefn: SOURCE_DEFN,
        MAX_CONSEC,
    },
);

/**
 * Given a gene symbol, search the genes and upload the resulting records to graphkb
 * @param {ApiConnection} api connection to GraphKB
 * @param {string} symbol the gene symbol
 */
const fetchAndLoadBySearchTerm = async (api, term, termType = 'Preferred Symbol', fallbackTermType = null) => {
    const cacheKey = `${termType}:${term}`;

    if (SEARCH_CACHE[cacheKey]) {
        return SEARCH_CACHE[cacheKey];
    }
    let result = await util.fetchAndLoadBySearchTerm(
        api,
        `${term}[${termType}] AND human[ORGN] AND alive[prop]`,
        {
            dbName: DB_NAME,
            parser: parseRecord,
            cache: CACHE,
            target: 'Feature',
            sourceDefn: SOURCE_DEFN,
            MAX_CONSEC,
        },
    );

    // fallback to gene name
    if (result.length === 0 && fallbackTermType) {
        result = await util.fetchAndLoadBySearchTerm(
            api,
            `${term}[${fallbackTermType}] AND human[ORGN] AND alive[prop]`,
            {
                dbName: DB_NAME,
                parser: parseRecord,
                cache: CACHE,
                target: 'Feature',
                sourceDefn: SOURCE_DEFN,
                MAX_CONSEC,
            },
        );
    }
    SEARCH_CACHE[cacheKey] = result;
    return SEARCH_CACHE[cacheKey];
};


const preLoadCache = async api => util.preLoadCache(
    api,
    {
        sourceDefn: SOURCE_DEFN, cache: CACHE, target: 'Feature',
    },
);

const fetchAndLoadBySymbol = async (api, term) => fetchAndLoadBySearchTerm(api, term, 'Preferred Symbol', 'Gene Name');


module.exports = {
    fetchAndLoadByIds: fetchAndLoadGeneByIds,
    fetchAndLoadBySearchTerm,
    fetchAndLoadBySymbol,
    parseRecord,
    SOURCE_DEFN,
    preLoadCache,
};
