/**
 * @module importer/entrez/pubmed
 */
const Ajv = require('ajv');

const {checkSpec} = require('../util');
const {fetchByIdList, uploadRecord, fetchRecord} = require('./util');

const ajv = new Ajv();

const SOURCE_DEFN = {
    displayName: 'PubMed',
    name: 'pubmed',
    url: 'https://www.ncbi.nlm.nih.gov/pubmed',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: `
        pubmed comprises more than 29 million citations for biomedical literature from medline,
        life science journals, and online books. citations may include links to full-text content
        from pubmed central and publisher web sites`.replace(/\s+/, ' ')
};

const CACHE = {};

const recordSpec = ajv.compile({
    type: 'object',
    required: ['uid', 'title', 'fulljournalname', 'sortpubdate'],
    properties: {
        uid: {type: 'string', pattern: '^\\d+$'},
        title: {type: 'string'},
        fulljournalname: {type: 'string'},
        sortpubdate: {type: 'string'}
    }
});

/**
 * Given an article record retrieved from pubmed, parse it into its equivalent
 * GraphKB representation
 */
const parseArticleRecord = (record) => {
    checkSpec(recordSpec, record);
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


const fetchArticlesByPmids = async (pmidListIn, url) => {
    return fetchByIdList(
        pmidListIn,
        {url, db: 'pubmed', parser: parseArticleRecord, cache: CACHE}
    );
};


/**
 * Given some pubmed ID, get the corresponding record from GraphKB
 */
const fetchArticle = async (api, sourceId) => {
    return fetchRecord(api, {
        sourceId,
        endpoint: 'publications',
        cache: CACHE,
        db: 'pubmed'
    });
};


const createDisplayName = sourceId => `pmid:${sourceId}`;


/**
 * Given the parsed content of some article, upload to the api
 * @param {object} article the article contents to be uploaded
 * @param {object} opt
 * @param {boolean} opt.cache add the GraphKB Publication record to the cache
 * @param {boolean} opt.fetchFirst attempt to get the record by source Id before uploading it
 */
const uploadArticle = async (api, article, opt = {}) => {
    return uploadRecord(api, article, {
        cache: CACHE,
        createDisplayName,
        endpoint: 'publications',
        sourceDefn: SOURCE_DEFN,
        ...opt
    });
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
    SOURCE_DEFN,
};
