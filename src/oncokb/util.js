/* eslint-disable multiline-ternary */

const { isArray } = require('lodash');
const { rid } = require('../graphkb');
const { logger } = require('../logging');
const { hashRecordToId } = require('../util');

/** @typedef {import('../graphkb').ApiConnection} ApiConnection */


/**
 * Parse a string of references (PMIDs or abstracts) into an array of individual refs.
 *
 * @param {string} s the PMIDs|abstracts string
 * @param {string} [type] the type of refs (sep is semicolon for abstracts, else commas)
 * @returns {Array<string>}
 */
const parseEvidence = (s, type) => (s || '')
    .split(type === 'abstracts' ? ';' : ',')
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Fetch the previously loaded OncoKB statements records, mapped by sourceId.
 * Records without sourceId (e.g. from the cancer gene list) are not considered.

 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.source the GraphKB Source record for OncoKB
 * @returns {Promise<Map<string, object>>} sourceId -> Statement record
 */
const fetchPrevious = async ({ conn, source }) => {
    logger.info('\n\n** EXISTING STATEMENTS **');
    logger.info('Fetching records...');

    const statements = await conn.getRecords({
        filters: { source: rid(source) },
        target: 'Statement',
    });
    const duplicates = [...new Set(
        statements
            .map(r => r.sourceId || '')
            .filter((r) => r !== '')
            .filter((value, index, values) => values.indexOf(value) !== index),
    )];

    if (duplicates.length > 0) {
        throw new Error(`Cannot proceed without sourceId being a unique key. Found sourceId duplicates in Statements from OncoKB: ${duplicates}`);
    }

    const previous = new Map(
        statements
            .filter((r) => r.sourceId && r.sourceId !== '')
            .map((r) => [r.sourceId, r]),
    );
    logger.info(`Found ${previous.size} previous OncoKB statements in GraphKB`);

    return previous;
};

/**
 * Given the content of a Statement record,
 * returns a hash of selected props as sourceId.
 *
 * @param {object} content the Statement content
 * @returns {string}
 */
const hashContentToSourceId = (content) => {
    const c = JSON.parse(JSON.stringify(content));

    if (c.conditions && isArray(c.conditions)) {
        c.conditions.sort();
    }
    if (c.evidenceLevel && isArray(c.evidenceLevel)) {
        c.evidenceLevel.sort();
    }
    return hashRecordToId(c, [
        'conditions',
        'evidenceLevel',
        'relevance',
        'subject',
    ]);
};

/**
 * Given an OncoKB variant record (actionable or annotated),
 * returns a hash of selected props as id.
 * Used for linking each OncoKB variant record to a GraphKB biomarker
 *
 * @param {object} r the OncoKB variant record
 * @returns {string}
 */
const hashOncokbRecordToId = (r) => hashRecordToId(r, [
    'entrezGeneId',
    'grch37Isoform',
    'grch37RefSeq',
    'grch38Isoform',
    'grch38RefSeq',
    'proteinChange',
    'setting',
    'variant',
    // actionable-specific props:
    'cancerType',
    'drugs',
    'level',
    // annotated-specific props:
    'oncogenicity',
    'mutationEffect',
]);

module.exports = {
    fetchPrevious,
    hashContentToSourceId,
    hashOncokbRecordToId,
    parseEvidence,
};
