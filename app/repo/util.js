/** @module app/repo/util */
const moment = require('moment');
const {RID} = require('orientjs');
const uuidValidate = require('uuid-validate');
const {AttributeError} = require('./error');


const castUUID = (uuid) => {
    if (uuidValidate(uuid, 4)) {
        return uuid;
    }
    throw new Error(`not a valid version 4 uuid ${uuid}`);
};


const timeStampNow = () => moment().valueOf();


/**
 * Given an input object/estring, attemps to return the RID equivalent
 * @param string the input object
 * @returns {orientjs.RID} the record ID
 */
const castToRID = (string) => {
    if (string == null) {
        throw new AttributeError('cannot cast null/undefined to RID');
    }
    if (string instanceof RID) {
        return string;
    } if (typeof string === 'object' && string['@rid'] !== undefined) {
        return castToRID(string['@rid']);
    } if (looksLikeRID(string)) {
        string = `#${string.replace(/^#/, '')}`;
        return new RID(string);
    }
    throw new AttributeError({message: 'not a valid RID', value: string});
};

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


const castString = (string) => {
    if (string === null) {
        throw new AttributeError('cannot cast null to string');
    }
    return string.toString().toLowerCase().trim();
};
const castNullableString = x => (x === null
    ? null
    : castString(x));
const castNonEmptyString = (x) => {
    const result = x.toString().toLowerCase().trim();
    if (result.length === 0) {
        throw new AttributeError('Cannot be an empty string');
    }
    return result;
};
const castNonEmptyNullableString = x => (x === null
    ? null
    : castNonEmptyString(x));
const castNullableLink = (string) => {
    try {
        if (string === null || string.toString().toLowerCase() === 'null') {
            return null;
        }
    } catch (err) {}
    return castToRID(string);
};
const castDecimalInteger = (string) => {
    if (/^\d+$/.exec(string.toString().trim())) {
        return parseInt(string, 10);
    }
    throw new AttributeError(`${string} is not a valid decimal integer`);
};


/**
 *
 * @param {string} rid the putative @rid value
 * @param {boolean} [requireHash=true] if true the hash must be present
 * @returns {boolean} true if the string follows the expected format for an @rid, false otherwise
 *
 * @example
 * >>> looksLikeRID('#4:10', true);
 * true
 * @example
 * >>> looksLikeRID('4:0', true);
 * false
 * @example
 * >>> looksLikeRID('#4:10', false);
 * true
 * @example
 * >>> looksLikeRID('4:0', false);
 * true
 */
const looksLikeRID = (rid, requireHash = false) => {
    try {
        const pattern = requireHash
            ? /^#\d+:\d+$/
            : /^#?\d+:\d+$/;
        if (pattern.exec(rid.trim())) {
            return true;
        }
    } catch (err) {} // eslint-disable-line no-empty
    return false;
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
    castDecimalInteger,
    castNullableLink,
    castNullableString,
    castNonEmptyString,
    castNonEmptyNullableString,
    castString,
    castToRID,
    castUUID,
    groupRecordsBy,
    looksLikeRID,
    naturalListJoin,
    quoteWrap,
    timeStampNow
};
