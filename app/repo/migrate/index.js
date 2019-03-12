/**
 * This module will contain migrations that are determined by the content of the SchemaHistory table
 */

const {RID} = require('orientjs');
const semver = require('semver');

const {constants, schema: SCHEMA_DEFN} = require('@bcgsc/knowledgebase-schema');

constants.RID = RID; // IMPORTANT: Without this all castToRID will do is convert to a string

const {logger} = require('./../logging');
const {ClassModel} = require('./../model');

/**
 * Get the current schema version to detect if a migration is required
 */
const getCurrentVersion = async (db) => {
    const [{version}] = await db.query('SELECT * FROM SchemaHistory ORDER BY createdAt DESC', {limit: 1});
    return version;
};

/**
 * Given some target version, get the current version of the db an apply the necessary transformations
 */
const migrate = async (db, targetVersion) => {
    const currentVersion = await getCurrentVersion(db);
    logger.info(`Detected the current db-schema version as ${currentVersion}`);
    if (currentVersion === '1.6.2') {
        if (semver.gte(targetVersion, '1.7.0')) {
            logger.info('Creating the ExternalVocab class');
            await ClassModel.create(SCHEMA_DEFN.ExternalVocab, db);
        }
    } else {
        throw new Error(`Unable to find migration scripts from ${currentVersion} to ${targetVersion}`);
    }
};

module.exports = migrate;
