/**
 * @module importer/entrez/refseq
 */
const Ajv = require('ajv');
const _ = require('lodash');

const { fetchByIdList, uploadRecord } = require('./util');
const { checkSpec } = require('../util');

const ajv = new Ajv();

const SOURCE_DEFN = {
    displayName: 'RefSeq',
    longName: 'RefSeq: NCBI Reference Sequence Database',
    name: 'refseq',
    url: 'https://www.ncbi.nlm.nih.gov/refseq',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: `
        A comprehensive, integrated, non-redundant, well-annotated set of reference sequences
        including genomic, transcript, and protein.`.replace(/\s+/, ' '),
};
const DB_NAME = 'nucleotide';
const CACHE = {};

const recordSpec = ajv.compile({
    type: 'object',
    required: ['title', 'biomol', 'accessionversion'],
    properties: {
        accessionversion: { type: 'string', pattern: '^N[A-Z]_\\d+\\.\\d+$' },
        biomol: { type: 'string', enum: ['genomic', 'rna', 'peptide', 'mRNA'] },
        subname: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string' },
        replacedby: { type: 'string' },
    },
});

/**
 * Given an record record retrieved from refseq, parse it into its equivalent
 * GraphKB representation
 */
const parseRecord = (record) => {
    checkSpec(recordSpec, record);
    const [sourceId, sourceIdVersion] = record.accessionversion.split('.');
    let biotype = 'transcript';

    if (record.biomol === 'genomic') {
        biotype = 'chromosome';
    } else if (record.biomol === 'peptide') {
        biotype = 'protein';
    }
    const parsed = {
        sourceId,
        sourceIdVersion,
        biotype,
        longName: record.title,
        displayName: record.accessionversion.toUpperCase(),
    };

    if (biotype === 'chromosome') {
        parsed.name = record.subname;
    }
    return parsed;
};


/**
 * Given some list of refseq IDs, return if cached,
 * If they do not exist, grab from the refseq api
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idList list of IDs
 */
const fetchAndLoadByIds = async (api, idListIn) => {
    const versionedIds = []; idListIn.filter(id => /\.\d+$/.exec(id));
    const unversionedIds = [];
    idListIn.forEach((id) => {
        if (/\.\d+$/.exec(id)) {
            versionedIds.push(id);
        } else {
            unversionedIds.push(id);
        }
    });
    const records = [];

    if (versionedIds.length > 0) {
        records.push(...await fetchByIdList(
            versionedIds,
            {
                db: DB_NAME, parser: parseRecord, cache: CACHE,
            },
        ));
    }

    if (unversionedIds.length > 0) {
        const fullRecords = await fetchByIdList(
            unversionedIds,
            {
                db: DB_NAME, parser: parseRecord, cache: CACHE,
            },
        );
        fullRecords.forEach((rec) => {
            const simplified = _.omit(rec, ['sourceIdVersion', 'longName', 'description']);
            simplified.displayName = simplified.sourceId.toUpperCase();
            records.push(simplified);
        });
    }

    const result = await Promise.all(records.map(
        async record => uploadRecord(api, record, {
            cache: CACHE,
            target: 'Feature',
            sourceDefn: SOURCE_DEFN,
        }),
    ));
    return result;
};


module.exports = {
    parseRecord,
    fetchAndLoadByIds,
    SOURCE_DEFN,
};
