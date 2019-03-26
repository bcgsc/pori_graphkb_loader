/**
 * This module will contain migrations that are determined by the content of the SchemaHistory table
 */

const {RID} = require('orientjs');
const semver = require('semver');
const path = require('path');

const {constants, schema: SCHEMA_DEFN, util: {timeStampNow}} = require('@bcgsc/knowledgebase-schema');

constants.RID = RID; // IMPORTANT: Without this all castToRID will do is convert to a string

const {logger} = require('./../logging');

/**
 * Get the current schema version to detect if a migration is required
 */
const getCurrentVersion = async (db) => {
    const [{version}] = await db.query('SELECT * FROM SchemaHistory ORDER BY createdAt DESC', {limit: 1});
    return version;
};

/**
 * Gets the current version with respect to the node modules installed
 */
const getLoadVersion = () => {
    const pathToVersionInfo = path.join(
        path.dirname(require.resolve('@bcgsc/knowledgebase-schema')),
        '../package.json'
    );
    // must be a global require, currently no other way to obtain dependency package version info of the actual install
    const {version, name, _resolved} = require(pathToVersionInfo); // eslint-disable-line
    return {version, name, url: _resolved};
};

/**
 * Checks if the current version is more than a patch change
 */
const requiresMigration = (currentVersion, targetVersion) => {
    const compatibleVersion = `~${targetVersion.replace(/\.[^.]+$/, '')}`;
    return !semver.satisfies(currentVersion, compatibleVersion);
};

/**
 * Migrate any 1.6.X database to any 1.7.X database
 */
const migrateMajor1Minor6to7 = async (db) => {
    logger.info('Indexing Variant.type');
    await db.index.create(
        SCHEMA_DEFN.Variant.indices.find(item => item.name === 'Variant.type')
    );
    logger.info('Indexing Statement.relevance');
    await db.index.create(
        SCHEMA_DEFN.Statement.indices.find(item => item.name === 'Statement.relevance')
    );
    logger.info('Indexing Statement.appliesTo');
    await db.index.create(
        SCHEMA_DEFN.Statement.indices.find(item => item.name === 'Statement.appliesTo')
    );
};

/**
 * Detects the current version of the db, the version of the node module and attempts
 * to migrate from one to the other
 */
const migrate = async (db, opt) => {
    const {checkOnly = false} = opt;
    const currentVersion = await getCurrentVersion(db);
    const {version: targetVersion, name, url} = getLoadVersion();

    if (!requiresMigration(currentVersion, targetVersion)) {
        logger.info(`Versions (${currentVersion}, ${targetVersion}) are compatible and do not require migration`);
        return;
    } if (checkOnly) {
        throw new Error(`Versions (${currentVersion}, ${targetVersion}) are not compatible and require migration`);
    }

    if (semver.satisfies(currentVersion, '>=1.6.2 <1.7.0')) {
        if (semver.satisfies(targetVersion, '>=1.7.0 <1.8.0')) {
            // 1.6 to 1.7 upgrade: changes to the indexing
            logger.info(`Migrating from 1.6.X series (${currentVersion}) to v1.7.X series (${targetVersion})`);

            await migrateMajor1Minor6to7(db);
            // update the schema history table
            const schemaHistory = await db.class.get('SchemaHistory');
            await schemaHistory.create({
                version: targetVersion,
                name,
                url,
                createdAt: timeStampNow()
            });
            return;
        }
    }
    throw new Error(`Unable to find migration scripts from ${currentVersion} to ${targetVersion}`);
};

module.exports = {
    migrate, getLoadVersion, getCurrentVersion
};
