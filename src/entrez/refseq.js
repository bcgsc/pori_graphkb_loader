/**
 * @module importer/entrez/refseq
 */
const Ajv = require('ajv');
const _ = require('lodash');

const { fetchByIdList, uploadRecord } = require('./util');
const { checkSpec } = require('../util');
const { rid } = require('../graphkb');
const { refseq: SOURCE_DEFN } = require('../sources');

const ajv = new Ajv();


const DB_NAME = 'nucleotide';
const CACHE = {};

const recordSpec = ajv.compile({
    properties: {
        accessionversion: { pattern: '^N[A-Z]_\\d+\\.\\d+$', type: 'string' },
        biomol: { enum: ['genomic', 'rna', 'peptide', 'mRNA'], type: 'string' },
        replacedby: { type: 'string' },
        status: { type: 'string' },
        subname: { type: 'string' },
        title: { type: 'string' },
    },
    required: ['title', 'biomol', 'accessionversion'],
    type: 'object',
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
        biotype,
        displayName: record.accessionversion.toUpperCase(),
        longName: record.title,
        sourceId,
        sourceIdVersion,
    };

    if (biotype === 'chromosome') {
        parsed.name = record.subname;
    }
    return parsed;
};


/**
 * Given some list of refseq IDs, return if cached,
 * If they do not exist, grab from the refseq graphkbConn
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idList list of IDs
 */
const fetchAndLoadByIds = async (api, idListIn) => {
    const versionedIds = [];
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
                cache: CACHE, db: DB_NAME, parser: parseRecord,
            },
        ));
    }

    if (unversionedIds.length > 0) {
        const fullRecords = await fetchByIdList(
            unversionedIds,
            {
                cache: CACHE, db: DB_NAME, parser: parseRecord,
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
            sourceDefn: SOURCE_DEFN,
            target: 'Feature',
        }),
    ));
    // for versioned records link to the unversioned version
    await Promise.all(result.map(async (record) => {
        if (record.sourceIdVersion !== undefined && record.sourceIdVersion !== null) {
            const unversioned = await api.addRecord({
                content: _.omit(record, ['sourceIdVersion', '@rid', '@class']),
                fetchConditions: {
                    AND: [
                        { name: record.name },
                        { source: record.source },
                        { sourceId: record.sourceId },
                        { sourceIdVersion: null },
                    ],
                },
                target: 'Feature',
            });
            await api.addRecord({
                content: { in: rid(record), out: rid(unversioned), source: record.source },
                target: 'GeneralizationOf',
            });
        }
    }));

    return result;
};


module.exports = {
    SOURCE_DEFN,
    fetchAndLoadByIds,
    parseRecord,
};
