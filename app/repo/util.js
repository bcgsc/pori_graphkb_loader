const moment = require('moment');
const uuidValidate = require('uuid-validate');

const castUUID = (uuid) => {
    if (uuidValidate(uuid, 4)) {
        return uuid;
    }
    throw new Error(`not a valid version 4 uuid ${uuid}`);
};

const timeStampNow = () => {
    return moment().valueOf();
};

const getParameterPrefix = (param) => {
    const match = /^([^\.]+)\.([^\.]+)$/.exec(param);
    if (match) {
        return {prefix: match[1], suffix: match[2]};
    } else {
        return {};
    }
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
const looksLikeRID = (rid, requireHash=false) => {
    try {
        const pattern = requireHash ? /^#\d+:\d+$/ : /^#?\d+:\d+$/;
        if (pattern.exec(rid.trim())) {
            return true;
        }
    } catch (err) {}  // eslint-disable-line no-empty
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
const quoteWrap = (string) => {
    return `'${string}'`;
};

module.exports = {timeStampNow, castUUID, getParameterPrefix, quoteWrap, looksLikeRID};
