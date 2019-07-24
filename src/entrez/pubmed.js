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
const DB_NAME = 'pubmed';
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
 * Given an record record retrieved from pubmed, parse it into its equivalent
 * GraphKB representation
 */
const parseRecordRecord = (record) => {
    checkSpec(recordSpec, record);
    const record = {
        sourceId: record.uid,
        name: record.title,
        journalName: record.fulljournalname
    };
    // sortpubdate: '1992/06/01 00:00'
    const match = /^(\d\d\d\d)\//.exec(record.sortpubdate);
    if (match) {
        record.year = parseInt(match[1], 10);
    }
    return record;
};


const fetchRecordsByIds = async (idListIn, url) => {
    return fetchByIdList(
        idListIn,
        {url, db: DB_NAME, parser: parseRecordRecord, cache: CACHE}
    );
};


/**
 * Given some pubmed ID, get the corresponding record from GraphKB
 */
const fetchRecord = async (api, sourceId) => {
    return fetchRecord(api, {
        sourceId,
        endpoint: 'publications',
        cache: CACHE,
        db: DB_NAME
    });
};


const createDisplayName = sourceId => `id:${sourceId}`;


/**
 * Given the parsed content of some record, upload to the api
 * @param {object} record the record contents to be uploaded
 * @param {object} opt
 * @param {boolean} opt.cache add the GraphKB Publication record to the cache
 * @param {boolean} opt.fetchFirst attempt to get the record by source Id before uploading it
 */
const uploadRecord = async (api, record, opt = {}) => {
    return uploadRecord(api, record, {
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
 * @param {Array.<string>} idList list of pubmed IDs
 */
const fetchAndLoadByIds = async (api, idListIn) => {
    const records = await fetchRecordsByIds(idListIn);
    return Promise.all(records.map(async record => uploadRecord(api, record)));
};


module.exports = {
    fetchRecord,
    fetchRecordsByIds,
    parseRecord,
    uploadRecord,
    fetchAndLoadByIds,
    SOURCE_DEFN,
};
