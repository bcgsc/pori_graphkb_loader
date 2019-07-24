/**
 * @module importer/entrez/refseq
 *
 * ex. https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?
 *      db=nucleotide
 *      &id=NC_000003.12
 *      &rettype=docsum&retmode=json
 */
const Ajv = require('ajv');

const ajv = new Ajv();

const SOURCE_DEFN = {
    displayName: 'RefSeq',
    longName: 'RefSeq: NCBI Reference Sequence Database',
    name: 'refseq',
    url: 'https://www.ncbi.nlm.nih.gov/refseq',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: `
        A comprehensive, integrated, non-redundant, well-annotated set of reference sequences
        including genomic, transcript, and protein.`.replace(/\s+/, ' ')
};
const DB_NAME = 'nucleotide';
const CACHE = {};

const recordSpec = ajv.compile({
    type: 'object',
    required: ['title', 'biomol', 'accessionversion'],
    properties: {
        accessionversion: {type: 'string', pattern: '^N[A-Z]_\d+\.\d+$'},
        biomol: {type: 'string', enum: ['genomic', 'rna', 'peptide']},
        subname: {type: 'string'},
        title: {type: 'string'}
    }
});

/**
 * Given an record record retrieved from pubmed, parse it into its equivalent
 * GraphKB representation
 */
const parseRecord = (record) => {
    checkSpec(recordSpec, record);
    const [sourceId, sourceIdVersion] = record.accessionversion.split('.');

    let biotype = 'chromosome';
    if (row.biomol === 'rna') {
        biotype = 'transcript';
    } else if (row.biomol === 'peptide') {
        biotype = 'protein';
    }
    const record = {
        sourceId,
        sourceIdVersion,
        biotype,
        longName: record.title,
    };
    if (biotype === 'chromosome') {
        record.name = record.subname;
    }
    return record;
};


const fetchRecordsByIds = async (idListIn, url) => {
    return fetchByIdList(
        idListIn,
        {url, db: DB_NAME, parser: parseRecord, cache: CACHE}
    );
};


/**
 * Given some pubmed ID, get the corresponding record from GraphKB
 */
const fetchRecord = async (api, sourceId) => {
    return fetchRecord(api, {
        sourceId,
        endpoint: 'features',
        cache: CACHE,
        db: DB_NAME
    });
};


/**
 * Given the parsed content of some record, upload to the api
 * @param {ApiConnection} api the record contents to be uploaded
 * @param {object} record the record contents to be uploaded
 * @param {object} opt
 * @param {boolean} opt.cache add the GraphKB Publication record to the cache
 * @param {boolean} opt.fetchFirst attempt to get the record by source Id before uploading it
 */
const uploadRecord = async (api, record, opt = {}) => {
    return uploadRecord(api, record, {
        cache: CACHE,
        endpoint: 'features',
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
    return Promise.all(records.map(async rec => uploadRecord(api, rec)));
};


module.exports = {
    fetchRecord,
    fetchRecordsByIds,
    parseRecord,
    uploadRecord,
    fetchAndLoadByIds,
    SOURCE_DEFN,
};