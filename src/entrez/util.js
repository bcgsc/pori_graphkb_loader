/**
 * @module importer/entrez/util
 */

const {rid, requestWithRetry, orderPreferredOntologyTerms} = require('../util');
const {logger} = require('../logging');


const DEFAULT_QS = {
    retmode: 'json',
    rettype: 'docsum'
};

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const MAX_CONSEC_IDS = 150;

const generateCacheKey = (record) => {
    if (record.sourceIdVersion !== undefined) {
        return `${record.sourceId}-${record.sourceIdVersion}`.toLowerCase();
    }
    return `${record.sourceId}`.toLowerCase();;
};


/**
 * pull records from a cache where stored, return leftoever id's otherwise
 * @param {Array.<string>} rawIdList array of sourceIds to pull records from a cache by
 * @param {object} cache the cache to pull from
 */
const pullFromCacheById = (rawIdList, cache) => {
    const idList = Array.from(new Set(rawIdList.map(id => id.toLowerCase().trim())));
    const cached = [];
    const remaining = [];
    for (const id of idList) {
        if (cache[id]) {
            cached.push(cache[id]);
        } else {
            remaining.push(id);
        }
    }
    return {cached, remaining};
};


/**
 * Given some list of pumbed Ids, fetch the minimal parsed aricle summaries
 * @param {Array.<string>} pmidListIn list of pubmed ids
 * @param {object} opt
 * @param {string} [opt.url=BASE_URL] the base url for the pubmed api
 * @param {string} [opt.db='pubmed'] the entrez database name
 * @param {function} opt.parser the parser function to transform the entrez record to a graphkb record
 * @param {object} opt.cache the cache associated with calls to this db
 */
const fetchByIdList = async (rawIdList, opt) => {
    const {
        url = BASE_URL, db = 'pubmed', parser, cache = {}
    } = opt;
    const {cached: allRecords, remaining: idList} = pullFromCacheById(rawIdList, cache);

    for (let startIndex = 0; startIndex < idList.length; startIndex += MAX_CONSEC_IDS) {
        const idListString = idList
            .slice(startIndex, startIndex + MAX_CONSEC_IDS)
            .map(id => id.toString())
            .join(',');

        logger.info(`loading: ${url}?db=${db}`);
        const {result} = await requestWithRetry({
            method: 'GET',
            uri: url,
            qs: {...DEFAULT_QS, db, id: idListString},
            headers: {Accept: 'application/json'},
            json: true
        });

        const records = Object.values(result)
            .filter(content => !Array.isArray(content))
            .map(parser);
        allRecords.push(...records);
    }

    return allRecords;
};

/**
 * Given some pubmed ID, get the corresponding record from GraphKB
 */
const fetchRecord = async (api, {
    sourceId, sourceIdVersion = null, db = 'pubmed', endpoint = 'publications', cache = {}
}) => {
    const cacheKey = generateCacheKey({sourceId, sourceIdVersion});

    if (cache[cacheKey]) {
        return cache[cacheKey];
    }
    const record = await api.getUniqueRecordBy({
        endpoint,
        where: {sourceId, sourceIdVersion, source: {name: db}},
        sort: orderPreferredOntologyTerms
    });
    cache[cacheKey] = record;
    return record;
};


/**
 * Given the parsed content of some recrod, upload to the api
 * @param {object} content the record contents to be uploaded
 * @param {object} opt
 * @param {boolean} opt.cache add the GraphKB record to the cache
 * @param {boolean} opt.fetchFirst attempt to get the record by source Id before uploading it
 * @param {string} opt.endpoint
 * @param {object} opt.sourceDefn
 * @param {function} opt.createDisplayName
 */
const uploadRecord = async (api, content, opt = {}) => {
    const {
        cache = true,
        fetchFirst = true,
        endpoint = 'publications',
        sourceDefn,
        createDisplayName
    } = opt;

    const {sourceId, sourceIdVersion} = content;

    const cacheKey = generateCacheKey({sourceId, sourceIdVersion});

    if (cache && cache[cacheKey]) {
        return cache[cacheKey];
    } if (fetchFirst) {
        try {
            const record = await api.getUniqueRecordBy({
                endpoint,
                where: {sourceId}
            });
            if (cache) {
                cache[cacheKey] = record;
            }
            return record;
        } catch (err) {}
    }
    let source = cache.__source;
    if (!source) {
        source = await api.addRecord({
            endpoint: 'sources',
            content: sourceDefn,
            fetchConditions: {name: sourceDefn.name},
            existsOk: true
        });
        if (cache) {
            cache.__source = source;
        }
    }
    const formattedContent = {
        ...content,
        source: rid(source)
    };

    if (createDisplayName) {
        formattedContent.displayName = createDisplayName(content.sourceId);
    }

    const result = await api.addRecord({
        endpoint,
        content: formattedContent,
        existsOk: true,
        fetchConditions: {
            sourceId,
            source: rid(source)
        }
    });
    if (cache) {
        cache[cacheKey] = result;
    }
    return result;
};


const preLoadCache = async (api, {sourceDefn, cache}) => {
    const limit = 1000;
    let lastFetch = limit;
    let skip = 0;
    const records = [];

    while (lastFetch === limit) { // paginate
        const fetch = await api.getRecords({
            endpoint: 'features',
            where: {source: {name: sourceDefn.name}, dependency: null, deprecated: false, limit, skip},
        });
        lastFetch = fetch.length;
        skip += limit;
        records.push(...fetch);
    }

    const dups = new Set();

    for (const record of records) {
        const cacheKey = generateCacheKey(record);
        if (cache[cacheKey]) {
            // duplicate
            dups.add(cacheKey);
        }
        cache[cacheKey] = record;
    }
    Array(dups).map(key => {
        delete cache[key];
    });
    logger.info(`cache contains ${Object.keys(cache).length} keys`);
};


module.exports = {
    uploadRecord,
    fetchRecord,
    fetchByIdList,
    pullFromCacheById,
    DEFAULT_QS,
    generateCacheKey,
    preLoadCache
};
