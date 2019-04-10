

/**
 * Contains all functions for directly interacting with the database
 */
/**
 * @ignore
 */
const {error: {AttributeError}, util: {castToRID}} = require('@bcgsc/knowledgebase-schema');

const {logger} = require('../logging');
const {
    Query, generalKeywordSearch
} = require('../query');
const {
    MultipleRecordsFoundError,
    NoRecordFoundError
} = require('../error');
const {
    groupRecordsBy,
    trimRecords
} = require('../util');
const {wrapIfTypeError} = require('./util');


const STATS_GROUPING = new Set(['@class', 'source']);
const RELATED_NODE_DEPTH = 3;
const QUERY_LIMIT = 1000;
const FETCH_OMIT = -2;


/**
 * @param {orientjs.Db} db the database connection object
 * @param {Array.<string>} classList list of classes to gather stats for
 * @param {Array.<string>} [extraGrouping=[]] the terms used for grouping the counts into sets (not includeing @class which is always used)
 */
const selectCounts = async (db, classList, extraGrouping = []) => {
    const grouping = [];
    grouping.push(...(extraGrouping || []));
    for (const attr of grouping) {
        if (!STATS_GROUPING.has(attr)) {
            throw new AttributeError(`Invalid attribute for grouping (${attr}) is not supported`);
        }
    }
    const clause = grouping.join(', ');
    const tempCounts = await Promise.all(Array.from(
        classList,
        async (cls) => {
            let statement;
            if (grouping.length === 0) {
                statement = `SELECT count(*) FROM ${cls}`;
            } else {
                statement = `SELECT ${clause}, count(*) FROM ${cls} GROUP BY ${clause}`;
            }
            logger.log('debug', statement);
            return db.query(statement).all();
        }
    ));
    const counts = [];
    // nest counts into objects based on the grouping keys
    for (let i = 0; i < classList.length; i++) {
        for (const record of tempCounts[i]) {
            record['@class'] = classList[i]; // selecting @prefix removes on return
            counts.push(record);
        }
    }
    grouping.unshift('@class');
    const result = groupRecordsBy(counts, grouping, {value: 'count', aggregate: false});
    return result;
};


/**
 * Given a user name return the active record. Groups will be returned in full so that table level
 * permissions can be checked
 *
 * @param {orientjs.Db} db the orientjs database connection object
 * @param {string} username the name of the user to select
 */
const getUserByName = async (db, username) => {
    logger.debug(`getUserByName: ${username}`);
    // raw SQL to avoid having to load db models in the middleware
    const user = await db.query(
        'SELECT * from User where name = :param0 AND deletedAt IS NULL',
        {
            params: {param0: username},
            fetchPlan: 'groups:1'
        }
    ).all();
    if (user.length > 1) {
        throw new MultipleRecordsFoundError(`username '${username} is not unique and returned multiple records`);
    } else if (user.length === 0) {
        throw new NoRecordFoundError(`no user found for the username '${username}'`);
    } else {
        return user[0];
    }
};


/**
 * Builds the query statement for selecting or matching records from the database
 *
 * @param {orientjs.Db} db Database connection from orientjs
 * @param {Query} query the query object
 *
 * @param {Object} opt Selection options
 * @param {?number} [opt.exactlyN=null] if not null, check that the returned record list is the same length as this value
 * @param {User} [opt.user] the current user
 * @param {string} [opt.fetchPlan] overrides the default fetch plan created from the neighbors
 *
 * @todo Add support for permissions base-d fetch plans
 *
 * @returns {Array.<Object>} array of database records
 */
const select = async (db, query, opt) => {
    // set the default options
    const {exactlyN, user, fetchPlan} = Object.assign({
        exactlyN: null,
        fetchPlan: null
    }, opt);
    logger.log('debug', query.displayString());

    // send the query statement to the database
    const {params, query: statement} = query.toString();
    const queryOpt = {
        params
    };
    if (!query.count) {
        queryOpt.limit = query.limit;
        if (fetchPlan) {
            queryOpt.fetchPlan = fetchPlan;
        } else if (query.neighbors !== null && query.neighbors !== undefined) {
            queryOpt.fetchPlan = `*:${query.neighbors}`;
        }
        // add history if not explicity specified already
        if (query.activeOnly && (!queryOpt.fetchPlan || !queryOpt.fetchPlan.includes('history'))) {
            if (!queryOpt.fetchPlan) {
                queryOpt.fetchPlan = `history:${FETCH_OMIT}`;
            } else if (!queryOpt.fetchPlan.includes(`history:${FETCH_OMIT}`)) {
                queryOpt.fetchPlan = `${queryOpt.fetchPlan} history:${FETCH_OMIT}`;
            }
        }
    }
    logger.log('debug', JSON.stringify(queryOpt));

    let recordList;

    try {
        recordList = await db.query(`${statement}`, queryOpt).all();
    } catch (err) {
        logger.log('debug', `Error in executing the query statement (${statement})`);
        logger.log('debug', err);
        // will be listed as connection error but only happens when selecting from non-existent RID (sepcifically bad cluster)
        throw new NoRecordFoundError({query: statement, message: 'One or more invalid record cluster IDs (<cluster>:#)'});
    }

    logger.log('debug', `selected ${recordList.length} records`);

    recordList = trimRecords(recordList, {activeOnly: query.activeOnly, user});

    if (exactlyN !== null) {
        if (recordList.length === 0) {
            if (exactlyN === 0) {
                return [];
            }
            throw new NoRecordFoundError({
                message: 'query expected results but returned an empty list',
                sql: query.displayString()
            });
        } else if (exactlyN !== recordList.length) {
            throw new MultipleRecordsFoundError({
                message: `query returned unexpected number of results. Found ${recordList.length} results but expected ${exactlyN} results`,
                sql: query.displayString()
            });
        } else {
            return recordList;
        }
    } else {
        return recordList;
    }
};


/**
 * @param {orientjs.Db} db Database connection from orientjs
 * @param {Array.<string>} keywords array of keywords to search for
 * @param {Object} opt Selection options
 */
const selectByKeyword = async (db, keywords, opt) => {
    const queryObj = Object.assign({
        toString: () => generalKeywordSearch(keywords, {...opt, skip: opt.skip || 0}),
        activeOnly: true
    }, opt);
    queryObj.displayString = () => Query.displayString(queryObj);
    return select(db, queryObj);
};


/**
 * @param {orientjs.Db} db Database connection from orientjs
 * @param {Array.<string|RID>} recordList array of record IDs to select from
 * @param {Object} opt Selection options
 * @param {?Number} opt.neighbors number of related records to fetch
 * @param {?Boolean} opt.activeOnly exclude deleted records
 */
const selectFromList = async (db, recordList, opt) => {
    const {neighbors = 0, activeOnly = true} = opt;
    const params = {};
    recordList.forEach((rec) => {
        const rid = castToRID(rec);
        params[`param${Object.keys(params).length}`] = rid;
    });
    if (recordList.length < 1) {
        throw new AttributeError('Must select a minimum of 1 record');
    }
    let query = `SELECT * FROM [${Object.keys(params).sort().map(p => `:${p}`).join(', ')}]`;

    if (activeOnly) {
        query = `${query} WHERE deletedAt IS NULL`;
    }
    const queryObj = Object.assign({
        toString: () => ({query, params}),
        activeOnly,
        neighbors,
        params
    }, opt);
    queryObj.displayString = () => Query.displayString(queryObj);
    return select(db, queryObj);
};


module.exports = {
    getUserByName,
    QUERY_LIMIT,
    RELATED_NODE_DEPTH,
    select,
    selectCounts,
    selectByKeyword,
    selectFromList
};
