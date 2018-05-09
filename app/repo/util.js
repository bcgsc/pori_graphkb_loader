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

module.exports = {timeStampNow, castUUID, getParameterPrefix, quoteWrap};
