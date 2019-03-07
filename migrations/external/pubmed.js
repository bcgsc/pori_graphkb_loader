const request = require('request-promise');

const {rid} = require('./util');

const PUBMED_DEFAULT_QS = {
    retmode: 'json',
    db: 'pubmed',
    rettype: 'docsum'
};

const PUBMED_CACHE = {};

const PUBMED_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const MAX_CONSEC_IDS = 150;


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
    const pmidList = Array.from((new Set(pmidListIn)).values()); // remove dups

    for (let startIndex = 0; startIndex < pmidList.length; startIndex += MAX_CONSEC_IDS) {
        const pmidString = pmidList
            .slice(startIndex, startIndex + MAX_CONSEC_IDS)
            .map(id => id.toString())
            .join(',');

        const {result} = await request({
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
        return sourceId;
    }
    const record = api.getUniqueRecord({
        uri: 'publications',
        qs: {sourceId}
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
const uploadArticle = async (api, article, opt) => {
    const {
        cache = true,
        fetchFirst = true
    } = opt;

    if (cache && PUBMED_CACHE[article.sourceId]) {
        return PUBMED_CACHE[article.sourceId];
    } if (fetchFirst) {
        try {
            const record = await api.getUniqueRecord({
                uri: 'publications',
                method: 'GET',
                qs: {sourceId: article.sourceId}
            });
            if (cache) {
                PUBMED_CACHE[article.sourceId] = record;
            }
            return record;
        } catch (err) {}
    }
    let pubmedSource = cache
        ? PUBMED_CACHE.source
        : null;
    if (!pubmedSource) {
        pubmedSource = await api.getUniqueRecord({
            uri: 'sources',
            qs: {name: 'pubmed'}
        });
        if (cache) {
            PUBMED_CACHE.source = pubmedSource;
        }
    }
    const {result} = await api.request({
        uri: 'publications',
        method: 'POST',
        body: Object.assign({source: rid(pubmedSource)}, article)
    });
    if (cache) {
        PUBMED_CACHE[result.sourceId] = result;
    }
    return result;
};


module.exports = {
    fetchArticle,
    fetchArticlesByPmids,
    parseArticleRecord,
    uploadArticle
};
