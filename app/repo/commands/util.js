

const _ = require('lodash');

const {util: {castToRID}} = require('@bcgsc/knowledgebase-schema');

const {
    NoRecordFoundError,
    RecordExistsError
} = require('../error');


/**
 * Check if the error is a particular type (expected from orientdb) and return an instance of the
 * corresponding error class
 */
const wrapIfTypeError = (err) => {
    if (err && err.type) {
        if (err.type.toLowerCase().includes('orecordduplicatedexception')) {
            return new RecordExistsError(err);
        } if (err.type.toLowerCase().includes('orecordnotfoundexception')) {
            return new NoRecordFoundError(err);
        }
    }
    return err;
};


const omitDBAttributes = rec => _.omit(rec, Object.keys(rec).filter(
    k => k.startsWith('@')
        || k.startsWith('out_')
        || k.startsWith('in_')
        || k.startsWith('_')
));

/**
 * Check if the user has sufficient access
 *
 * @param {Object} user the user
 * @param {Object} record the record the user wishes to access
 * @param {Array} record.groupRestrictions an array of groups that are allowed to access the record. If empty, then all groups are allowed access
 *
 * @returns {boolean} flag to indicate if the user is allowed access to the record
 */
const hasRecordAccess = (user, record) => {
    if (!record.groupRestrictions || record.groupRestrictions.length === 0) {
        return true;
    }
    for (let rgroup of record.groupRestrictions) {
        rgroup = castToRID(rgroup).toString();
        for (let ugroup of user.groups) {
            ugroup = castToRID(ugroup).toString();
            if (rgroup === ugroup) {
                return true;
            }
        }
    }
    return false;
};

module.exports = {wrapIfTypeError, omitDBAttributes, hasRecordAccess};
