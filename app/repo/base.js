

/**
 * Contains all functions for directly interacting with the database
 * @module app/repo/base
 */
const _ = require('lodash');
const {RID, RIDBag} = require('orientjs');

const {SelectionQuery} = require('./query');
const {
    AttributeError,
    MultipleRecordsFoundError,
    NoRecordFoundError,
    RecordExistsError,
    PermissionError
} = require('./error');
const {
    timeStampNow, VERBOSE, castToRID
} = require('./util');
const {PERMISSIONS} = require('./constants');


const RELATED_NODE_DEPTH = 3;
const QUERY_LIMIT = 1000;
const FETCH_OMIT = -2;


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

/**
 * Given a list of records, removes any object which contains a non-null deletedAt property
 *
 * @param {object} opt options
 * @param {boolean} activeOnly trim deleted records
 * @param {User} user if the user object is given, will check record-level permissions and trim any non-permitted content
 */
const trimRecords = (recordList, opt = {}) => {
    const {activeOnly, user} = Object.assign({
        activeOnly: true,
        user: null
    }, opt);
    const queue = recordList.slice();
    const visited = new Set();
    const readableClasses = new Set();
    const allGroups = new Set();

    if (user) {
        for (const group of user.groups) {
            allGroups.add(castToRID(group).toString());
            for (const [cls, permissions] of Object.entries(group.permissions || {})) {
                if (permissions & PERMISSIONS.READ) {
                    readableClasses.add(cls);
                }
            }
        }
    }

    const accessOk = (record) => {
        if (user) {
            const cls = record['@class'];
            if (cls && !readableClasses.has(cls)) {
                return false;
            }
            if (!record.groupRestrictions || record.groupRestrictions.length === 0) {
                return true;
            }
            for (let group of record.groupRestrictions || []) {
                group = castToRID(group).toString();
                if (allGroups.has(group)) {
                    return true;
                }
            }
            return false;
        }
        return true;
    };

    while (queue.length > 0) {
        const curr = queue.shift(); // remove the first element from the list

        if (visited.has(curr)) { // avoid infinite look from cycles
            continue;
        }
        visited.add(curr);
        const keys = Array.from(Object.keys(curr));
        for (const attr of keys) {
            const value = curr[attr];
            if (attr === '@type' || attr === '@version') {
                delete curr[attr];
            } else if (attr === 'history' && activeOnly) {
                curr[attr] = castToRID(value);
            } else if (value instanceof RID) {
                if (value.cluster < 0) { // abstract, remove
                    delete curr[attr];
                }
            } else if (value instanceof RIDBag) {
                const arr = [];
                for (const edge of value.all()) {
                    queue.push(edge);
                    arr.push(edge);
                }
                curr[attr] = arr;
            } else if (typeof value === 'object' && value && value['@rid'] !== undefined) {
                if (!accessOk(value)) {
                    delete curr[attr];
                } else {
                    queue.push(value);
                }
            }
        }
    }
    // remove the top level elements last
    const result = [];
    for (const record of recordList) {
        if (accessOk(record)) {
            result.push(record);
        }
    }
    return result;
};


/**
 * Check if the user has sufficient access
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

/**
 * Create new User record
 *
 * @param {object} db the orientjs database connection
 * @param {object} opt options
 * @param {ClassModel} opt.model the class model for User
 * @param {string} opt.userName the name of the new user
 * @param {string[]} opt.groupNames the list of group names for which to add the new user to
 */
const createUser = async (db, opt) => {
    const {
        schema, model, userName, groupNames
    } = opt;
    const userGroups = await db.select().from('UserGroup').all();
    const groupIds = Array.from(userGroups.filter(
        group => groupNames.includes(group.name)
    ), group => group['@rid']);

    const record = model.formatRecord({
        name: userName,
        groups: groupIds,
        deletedAt: null
    }, {dropExtra: false, addDefaults: true});
    await db.insert().into(model.name)
        .set(record)
        .one();
    try {
        return await select(db, {
            schema,
            where: {name: userName},
            model,
            exactlyN: 1,
            fetchPlan: 'groups:1'
        });
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};


/**
 * create new record in the database
 *
 * @param {object} db the orientjs database connection
 * @param {object} opt options
 * @param {object} opt.content the contents of the new record
 * @param {ClassModel} opt.model the model for the table/class to insert the new record into
 * @param {object} opt.user the user creating the new record
 */
const create = async (db, opt) => {
    const {content, model, user} = opt;
    if (model.isEdge) {
        return createEdge(db, opt);
    }
    const record = model.formatRecord(
        Object.assign({}, content, {createdBy: user['@rid']}),
        {dropExtra: false, addDefaults: true},
    );
    if (VERBOSE) {
        console.log('create:', record);
    }
    try {
        return await db.insert().into(model.name).set(record).one();
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};

/**
 * create new edge record in the database
 *
 * @param {object} db the orientjs database connection
 * @param {object} opt options
 * @param {object} opt.content the contents of the new record
 * @param {string} opt.content.out the @rid of the source node
 * @param {string} opt.content.in the @rid of the target node
 * @param {ClassModel} opt.model the model for the table/class to insert the new record into
 * @param {object} opt.user the user creating the new record
 */
const createEdge = async (db, opt) => {
    const {content, model, user} = opt;
    content.createdBy = user['@rid'];
    const record = model.formatRecord(content, {dropExtra: false, addDefaults: true});
    if (VERBOSE) {
        console.log('create:', record);
    }
    const from = record.out;
    const to = record.in;
    delete record.out;
    delete record.in;
    try {
        return await db.create('EDGE', model.name).from(from).to(to).set(record)
            .one();
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};

/**
 * Given a user name return the active record. Groups will be returned in full so that table level
 * permissions can be checked
 */
const getUserByName = async (db, username) => {
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
 * @param {Object} db Database connection from orientjs
 *
 * @param {Object} opt Selection options
 * @param {boolean} [opt.activeOnly=true] Return only non-deleted records
 * @param {ClassModel} opt.model the current model to be selected from
 * @param {object.<string,ClassModel>} opt.schema the schema of all models
 * @param {string} [opt.fetchPlan='*:0'] key value mapping of class names to depths of edges to follow or '*' for any class
 * @param {Array} [opt.where=[]] the query requirements
 * @param {?number} [opt.exactlyN=null] if not null, check that the returned record list is the same length as this value
 * @param {?number} [opt.limit=QUERY_LIMIT] the maximum number of records to return
 * @param {number} [opt.skip=0] the number of records to skip (for pagination)
 *
 *
 * Add support for permissions base-d fetch plans
 * SELECT * FROM statement fetchPlan appliesTo:-2 *:1
 */
const select = async (db, opt) => {
    // set the default options
    opt.where = opt.where || {};
    opt = Object.assign({
        activeOnly: true,
        exactlyN: null,
        limit: QUERY_LIMIT,
        skip: 0
    }, opt.where, opt);
    const query = new SelectionQuery(opt.schema, opt.model, opt.where || {}, opt);
    if (VERBOSE) {
        console.log('select query statement:',
            query.displayString(),
            {limit: opt.limit, fetchPlan: opt.fetchPlan, skip: opt.skip});
    }

    // send the query statement to the database
    const {params, query: statement} = query.toString();
    const queryOpt = {
        params,
        limit: opt.limit
    };
    if (opt.fetchPlan) {
        queryOpt.fetchPlan = opt.fetchPlan;
    }
    // add history if not explicity specified already
    if (opt.activeOnly && (!queryOpt.fetchPlan || !queryOpt.fetchPlan.includes('history'))) {
        if (!queryOpt.fetchPlan) {
            queryOpt.fetchPlan = `history:${FETCH_OMIT}`;
        } else if (!queryOpt.fetchPlan.includes(`history:${FETCH_OMIT}`)) {
            queryOpt.fetchPlan = `${queryOpt.fetchPlan} history:${FETCH_OMIT}`;
        }
    }
    let recordList = await db.query(`${statement}`, queryOpt).all();

    if (process.env.DEBUG === '1') {
        console.log(`selected ${recordList.length} records`);
    }
    recordList = trimRecords(recordList, {activeOnly: opt.activeOnly, user: opt.user});

    if (opt.exactlyN !== null) {
        if (recordList.length === 0) {
            if (opt.exactlyN === 0) {
                return [];
            }
            throw new NoRecordFoundError({
                message: 'query expected results but returned an empty list',
                sql: query.displayString()
            });
        } else if (opt.exactlyN !== recordList.length) {
            throw new MultipleRecordsFoundError({
                message: `query returned unexpected number of results. Found ${recordList.length} results but expected ${opt.exactlyN} results`,
                sql: query.displayString()
            });
        } else {
            return recordList;
        }
    } else {
        return recordList;
    }
};


const omitDBAttributes = rec => _.omit(rec, Object.keys(rec).filter(
    k => k.startsWith('@')
        || k.startsWith('out_')
        || k.startsWith('in_')
        || k.startsWith('_')
));

/**
 * Create the transaction to copy the current node as history and then update the current node
 * with the changes
 */
const updateNodeTx = async (db, opt) => {
    const {original, changes} = opt;
    const userRID = castToRID(opt.user);

    const content = omitDBAttributes(original);
    content.deletedAt = timeStampNow();
    content.deletedBy = userRID;

    changes.createdBy = userRID;
    changes.createdAt = timeStampNow();

    const commit = db
        .let('copy', tx => tx.create('VERTEX', original['@class'])
            .set(content))
        .let('updated', tx => tx.update(original['@rid'])
            .set(changes)
            .set('history = $copy')
            .where({createdAt: original.createdAt})
            .return('AFTER @rid'))
        .let('result', tx => tx.select()
            .from(original['@class']).where({'@rid': original['@rid']}));
    return commit.commit();
};

/**
 * Update or delete an existing edge and its source/target nodes
 * Creates the transaction to update/copy and relink nodes/edges when an edge requires updating
 * 1. copy src node as srcCopy
 * 2. link srcCopy to src as history
 * 3. copy tgt node as tgtCopy
 * 4. link tgtCopy to tgt as history
 * 5. copy e as eCopy from srcCopy to tgtCopy
 * 6. link eCopy to e as history
 *
 * @param {object} opt.changes the changes to the edge properties. Null for deletions
 * @param {object} opt.original the original edge record to be updated
 * @param {object} opt.user the user performing the record update
 */
const modifyEdgeTx = async (db, opt) => {
    const {original, changes} = opt;
    const userRID = castToRID(opt.user);
    const [src, tgt] = await Promise.all(Array.from(
        [original.out, original.in],
        async rid => db.record.get(rid)
    ));
    const srcCopy = omitDBAttributes(src);
    srcCopy.deletedAt = timeStampNow();
    srcCopy.deletedBy = userRID;

    const tgtCopy = omitDBAttributes(tgt);
    tgtCopy.deletedAt = timeStampNow();
    tgtCopy.deletedBy = userRID;

    const edgeCopy = _.omit(omitDBAttributes(original), ['in', 'out']);
    edgeCopy.deletedAt = timeStampNow();
    edgeCopy.deletedBy = userRID;

    if (changes) {
        changes.createdAt = timeStampNow();
        changes.createdBy = userRID;
    }

    // create the transaction to update the edge. Uses the createdAt stamp to avoid concurrency errors
    const commit = db
        .let('srcCopy', tx => tx.create('VERTEX', src['@class'])
            .set(srcCopy))
        .let('src', tx => tx.update(src['@rid'])
            .set('history = $srcCopy')
            .set({createdBy: userRID, createdAt: timeStampNow()})
            .where({createdAt: src.createdAt})
            .return('AFTER @rid'))
        .let('tgtCopy', tx => tx.create('VERTEX', tgt['@class'])
            .set(tgtCopy))
        .let('tgt', tx => tx.update(tgt['@rid'])
            .set('history = $tgtCopy')
            .set({createdBy: userRID, createdAt: timeStampNow()})
            .where({createdAt: tgt.createdAt})
            .return('AFTER @rid'))
        .let('edgeCopy', tx => tx.create('EDGE', original['@class'])
            .set(edgeCopy).from('$srcCopy').to('$tgtCopy'));

    if (changes === null) {
        // deletion
        commit
            .let('deleted', tx => tx.delete('EDGE', original['@class'])
                .from('$src').to('$tgt')
                .where({createdAt: original.createdAt, '@rid': original['@rid']}))
            .let('result', tx => tx.select().from('$edgeCopy').fetch({'*': 1}));
    } else {
        // edge update
        console.log(original['@rid']);
        commit
            .let('updatedRID', tx => tx.update(original['@rid'])
                .set(changes).set('history = $edgeCopy').set(changes)
                .where({createdAt: original.createdAt})
                .return('AFTER @rid'))
            .let('result', tx => tx.select().from('$updatedRID').fetch({'*': 1}));
    }
    return commit.commit();
};

/**
 * Creates the transaction to delete a node and all of its surrounding edges
 * This requires copy all neighbors and modifying any immediate edges in
 * addition to the modifying the current node
 */
const deleteNodeTx = async (db, opt) => {
    const {original} = opt;
    const userRID = castToRID(opt.user);
    const commit = db
        .let('deleted', tx => tx.update(original['@rid'])
            .set({deletedAt: timeStampNow(), deletedBy: userRID})
            .where({createdAt: original.createdAt}));
    const updatedVertices = {}; // mapping of rid string to let variable name
    let edgeCount = 0;
    for (const attr of Object.keys(original)) {
        let direction;
        if (attr.startsWith('out_')) {
            direction = 'in';
        } else if (attr.startsWith('in_')) {
            direction = 'out';
        } else {
            continue;
        }
        // back up the target vetex
        for (const value of original[attr]) {
            const targetNode = value[direction];
            const target = castToRID(targetNode);
            const targetContent = omitDBAttributes(targetNode);
            targetContent.deletedAt = timeStampNow();
            targetContent.deletedBy = userRID;
            // clean any nested content
            for (const [subAttr, subValue] of Object.entries(targetContent)) {
                if (subValue['@rid'] !== undefined) {
                    targetContent[subAttr] = castToRID(subValue);
                }
            }

            // if the vertex has already been copied do not recopy it
            if (updatedVertices[target.toString()] === undefined) {
                const name = `newVertex${Object.keys(updatedVertices).length}`;
                commit
                    .let(name, tx => tx.create('VERTEX', targetNode['@class'])
                        .set(targetContent))
                    .let(`vertex${Object.keys(updatedVertices).length}`, tx => tx.update(target)
                        .set(`history = $${name}`)
                        .set({createdBy: userRID, createdAt: timeStampNow()})
                        .where({createdAt: targetContent.createdAt})
                        .return('AFTER @rid'));
                updatedVertices[target.toString()] = name;
            }

            // move the current edge to point to the copied node
            commit.let(`edge${edgeCount++}`, tx => tx.update(castToRID(value))
                .set({deletedAt: timeStampNow(), deletedBy: userRID})
                .set(`${direction} = $${updatedVertices[target.toString()]}`)
                .where({createdAt: value.createdAt})
                .return('AFTER @rid'));
        }
    }
    commit.let('result', tx => tx.select().from(original['@class']).where({'@rid': original['@rid']}));
    return commit.commit();
};

/**
 * uses a transaction to copy the current record into a new record
 * then update the actual current record (to preserve links)
 * the link the copy to the current record with the history link
 *
 * @param {Object} db orientjs database connection
 * @param {Object} opt options
 * @param {Object} opt.content the content for the new node (any unspecified attributes are assumed to be unchanged)
 * @param {Array} opt.where the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
 */
const modify = async (db, opt) => {
    const {
        model, user, where, schema
    } = opt;
    if (!schema || !where || !model || !user) {
        throw new AttributeError('missing required argument');
    }
    const changes = opt.changes === null
        ? null
        : Object.assign({}, model.formatRecord(opt.changes, {
            dropExtra: false,
            addDefaults: false,
            ignoreMissing: true,
            ignoreExtra: false
        }));
    // select the original record and check permissions
    // select will also throw an error when the user attempts to modify a deleted record
    const [original] = await select(db, {
        schema,
        model,
        where,
        exactlyN: 1,
        activeOnly: true,
        fetchPlan: 'in_*:2 out_*:2 history:0'
    });
    if (!hasRecordAccess(user, original)) {
        throw new PermissionError(`The user '${user.name}' does not have sufficient permissions to interact with record ${original['@rid']}`);
    }

    let commit;
    if (model.isEdge) {
        commit = await modifyEdgeTx(db, {original, user, changes});
    } else if (changes === null) {
        // vertex deletion
        commit = await deleteNodeTx(db, {original, user});
    } else {
        // vertex update
        commit = await updateNodeTx(db, {original, user, changes});
    }
    if (process.env.DEBUG === '1') {
        console.log('modify transaction');
        console.log(commit.buildStatement());
    }
    try {
        const result = await commit.return('$result').one();
        if (!result) {
            throw new Error('Failed to update');
        }
        return result;
    } catch (err) {
        err.sql = commit.buildStatement();
        throw wrapIfTypeError(err);
    }
};

const update = async (db, opt) => {
    if (opt.changes === null) {
        throw new AttributeError('opt.changes is a required argument');
    }
    return modify(db, opt);
};

const remove = async (db, opt) => modify(db, Object.assign({}, opt, {changes: null}));


module.exports = {
    create,
    createUser,
    getUserByName,
    hasRecordAccess,
    QUERY_LIMIT,
    RELATED_NODE_DEPTH,
    remove,
    select,
    SelectionQuery,
    trimRecords,
    update,
    modify,
    modifyEdgeTx
};
