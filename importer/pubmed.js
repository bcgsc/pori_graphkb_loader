/**
 * @module importer/pubmed
 */

const {rid, requestWithRetry} = require('./util');
const {logger} = require('./logging');

const PUBMED_DEFAULT_QS = {
    retmode: 'json',
    db: 'pubmed',
    rettype: 'docsum'
};

const PUBMED_CACHE = {};

const PUBMED_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const MAX_CONSEC_IDS = 150;

const SOURCE_DEFN = {
    name: 'pubmed',
    url: 'https://www.ncbi.nlm.nih.gov/pubmed',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: `
        pubmed comprises more than 29 million citations for biomedical literature from medline,
        life science journals, and online books. citations may include links to full-text content
        from pubmed central and publisher web sites`.replace(/\s+/, ' ')
};

/**
 * Given an article record retrieved from pubmed, parse it into its equivalent
 * GraphKB representation
 */
const parseArticleRecord = (record) => {
    const article = {
        sourceId: record.uid,
        name: record.title,
        journalName: record.fulljournalname
    };
    // sortpubdate: '1992/06/01 00:00'
    const match = /^(\d\d\d\d)\//.exec(record.sortpubdate);
    if (match) {
        article.year = parseInt(match[1], 10);
    }
    return article;
};

/**
 * Given some list of pumbed Ids, fetch the minimal parsed aricle summaries
 * @param {Array.<string>} pmidListIn list of pubmed ids
 * @param {string} url the base url for the pubmed api
 */
const fetchArticlesByPmids = async (pmidListIn, url = PUBMED_API) => {
    const allArticles = [];
    const pmidList = Array.from((new Set(Array.from(pmidListIn))).values()) // remove dups
        .map(pmid => pmid.toString().trim())
        .filter(pmid => pmid);

    for (let startIndex = 0; startIndex < pmidList.length; startIndex += MAX_CONSEC_IDS) {
        const pmidString = pmidList
            .slice(startIndex, startIndex + MAX_CONSEC_IDS)
            .map(id => id.toString())
            .join(',');

        logger.info(`loading: ${url}`);
        const {result} = await requestWithRetry({
            method: 'GET',
            uri: url,
            qs: Object.assign({id: pmidString}, PUBMED_DEFAULT_QS),
            headers: {Accept: 'application/json'},
            json: true
        });

        const articles = Object.values(result)
            .filter(content => !Array.isArray(content))
            .map(parseArticleRecord);
        allArticles.push(...articles);
    }

    return allArticles;
};

/**
 * Given some pubmed ID, get the corresponding record from GraphKB
 */
const fetchArticle = async (api, sourceId) => {
    if (PUBMED_CACHE[sourceId]) {
        return PUBMED_CACHE[sourceId];
    }
    const record = api.getUniqueRecordBy({
        endpoint: 'publications',
        where: {sourceId, source: {name: 'pubmed'}}
    });
    return record;
};


/**
 * Given the parsed content of some article, upload to the api
 * @param {object} article the article contents to be uploaded
 * @param {object} opt
 * @param {boolean} opt.cache add the GraphKB Publication record to the cache
 * @param {boolean} opt.fetchFirst attempt to get the record by source Id before uploading it
 */
const uploadArticle = async (api, article, opt = {}) => {
    const {
        cache = true,
        fetchFirst = true
    } = opt;

    const {sourceId} = article;

    if (cache && PUBMED_CACHE[article.sourceId]) {
        return PUBMED_CACHE[article.sourceId];
    } if (fetchFirst) {
        try {
            const record = await api.getUniqueRecordBy({
                endpoint: 'publications',
                where: {sourceId}
            });
            if (cache) {
                PUBMED_CACHE[sourceId] = record;
            }
            return record;
        } catch (err) {}
    }
    let pubmedSource = cache
        ? PUBMED_CACHE.source
        : null;
    if (!pubmedSource) {
        pubmedSource = await api.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'pubmed'}
        });
        if (cache) {
            PUBMED_CACHE.source = pubmedSource;
        }
    }
    const result = await api.addRecord({
        endpoint: 'publications',
        content: Object.assign({source: rid(pubmedSource)}, article),
        existsOk: true,
        fetchConditions: {
            sourceId,
            source: rid(pubmedSource)
        }
    });
    if (cache) {
        PUBMED_CACHE[sourceId] = result;
    }
    return result;
};

/**
 * Given some list of pubmed IDs, return if cached,
 * If they do not exist, grab from the pubmed api
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} pmidList list of pubmed IDs
 */
const uploadArticlesByPmid = async (api, pmidListIn) => {
    const articles = await fetchArticlesByPmids(pmidListIn);
    return Promise.all(articles.map(async article => uploadArticle(api, article)));
};


module.exports = {
    fetchArticle,
    fetchArticlesByPmids,
    parseArticleRecord,
    uploadArticle,
    uploadArticlesByPmid,
    SOURCE_DEFN
};
