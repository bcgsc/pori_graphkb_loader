/** @module app/repo/util */
const {RID} = require('orientjs');
const {error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');

/**
 * Join a list of strings as you would for putting into a sentence
 *
 * @param {Array.<string>} list the list to join
 * @returns {string} the joined list
 *
 * @example
 * > naturalListJoin(['a', 'b', 'c'])
 * 'a, b, and c'
 */
const naturalListJoin = (list) => {
    if (list.length === 0) {
        return '';
    }
    let result = list.slice(0, list.length - 1).join(', ');
    if (list.length > 1) {
        result = `${result}, and ${list[list.length - 1]}`;
    }
    return result;
};


/**
 * wrap a string in single quotations
 *
 * @param {string} string the input string
 *
 * @example
 *  >>> quoteWrap('thing')
 *  "'thing'"
 *
 */
const quoteWrap = string => `'${string}'`;


/**
 * @param {Array.<Object>} records the records to be nested
 * @param {Array.<string>} keysList keys to use as levels for nesting
 * @param {?Object} opt options
 * @param {?string} [opt.value=null] the value to use as the lowest level value (if null defaults to entire record)
 * @param {?boolean} [opt.aggregate=true] create a list of records for each grouping
 *
 * @example
 * > groupRecordsBy([{name: 'bob', city: 'van'}, {name: 'alice', city: 'van'}, {name: 'blargh', city: 'monkey'}], ['city'], {value: 'name'})
 * {van: ['bob', 'alice'], monkey: ['blargh']}
 */
const groupRecordsBy = (records, keysList, opt = {}) => {
    const nestedProperty = opt.value || null;
    const aggregate = opt.aggregate === undefined
        ? true
        : opt.aggregate;
    const nested = {};
    // nest counts into objects based on the grouping keys
    for (const record of records) {
        let level = nested;
        for (const groupingKey of keysList.slice(0, -1)) {
            const key = record[groupingKey];
            if (level[key] === undefined) {
                level[key] = {};
            }
            level = level[key];
        }
        const lastKey = record[keysList.slice(-1)];
        if (aggregate) {
            if (level[lastKey] === undefined) {
                level[lastKey] = [];
            }
            if (nestedProperty) {
                level[lastKey].push(record[nestedProperty]);
            } else {
                level[lastKey].push(record);
            }
        } else if (level[lastKey] === undefined) {
            level[lastKey] = nestedProperty
                ? record[nestedProperty]
                : record;
        } else {
            throw new AttributeError('grouping is not unique. Must aggregate for non-unique groupings');
        }
    }
    return nested;
};


module.exports = {
    groupRecordsBy,
    naturalListJoin,
    quoteWrap
};
