/**
 * @module importer/entrez/pubmed
 */
const Ajv = require('ajv');

const {checkSpec} = require('../util');
const {fetchByIdList, uploadRecord} = require('./util');

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
const parseRecord = (record) => {
    checkSpec(recordSpec, record);
    const parsed = {
        sourceId: record.uid,
        name: record.title,
        journalName: record.fulljournalname
    };
    // sortpubdate: '1992/06/01 00:00'
    const match = /^(\d\d\d\d)\//.exec(record.sortpubdate);
    if (match) {
        parsed.year = parseInt(match[1], 10);
    }
    return parsed;
};


const createDisplayName = sourceId => `pmid:${sourceId}`;


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
    return Promise.all(records.map(
        async record => uploadRecord(api, record, {
            cache: CACHE,
            createDisplayName,
            endpoint: 'publications',
            sourceDefn: SOURCE_DEFN
        })
    ));
};


module.exports = {
    parseRecord,
    fetchAndLoadByIds,
    SOURCE_DEFN
};
