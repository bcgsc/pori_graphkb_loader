
/**
 * Contains all functions for directly interacting with the database
 */
/**
 * @ignore
 */
const _ = require('lodash');

const {util: {castToRID, timeStampNow}, error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');

const {logger} = require('./../logging');

const {
    NotImplementedError,
    PermissionError
} = require('./../error');
const {omitDBAttributes, wrapIfTypeError, hasRecordAccess} = require('./util');
const {select} = require('./select');


/**
 * Create the transaction to copy the current node as history and then update the current node
 * with the changes
 *
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt options
 * @param {Object} opt.changes the changes to the edge properties. Null for deletions
 * @param {Object} opt.original the original edge record to be updated
 * @param {Object} opt.user the user performing the record update
 */
const updateNodeTx = async (db, opt) => {
    const {original, changes, model} = opt;
    const userRID = castToRID(opt.user);

    const content = model.formatRecord(omitDBAttributes(original), {
        dropExtra: true,
        addDefaults: false
    });
    content.deletedAt = timeStampNow();
    content.deletedBy = userRID;

    changes.createdBy = userRID;
    changes.createdAt = timeStampNow();

    let commit;
    if (model.inherits.includes('V')) {
        commit = db
            .let('copy', tx => tx.create('VERTEX', original['@class'])
                .set(content));
    } else {
        commit = db
            .let('copy', tx => tx.insert().into(original['@class'])
                .set(content));
    }
    commit
        .let('updated', tx => tx.update(original['@rid'])
            .set(omitDBAttributes(changes))
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
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt options
 * @param {Object} opt.changes the changes to the edge properties. Null for deletions
 * @param {Object} opt.original the original edge record to be updated
 * @param {Object} opt.user the user performing the record update
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
            .return('AFTER @rid'));


    if (changes === null) {
        // deletion
        commit
            .let('deleted', tx => tx.update(`EDGE ${original['@rid']}`)
                .where({createdAt: original.createdAt})
                .set('out = $srcCopy').set('in = $tgtCopy')
                .set({deletedAt: timeStampNow(), deletedBy: userRID})
                .return('AFTER @rid'))
            .let('result', tx => tx.select().from('$deleted').fetch({'*': 1}));
    } else {
        // edge update
        throw new NotImplementedError('Cannot update edges. Waiting on external fix: https://github.com/orientechnologies/orientdb/issues/8444');
        /* TODO: Fix after getting feedback
        commit
            .let('edgeCopy', tx => tx.create('EDGE', original['@class'])
                .set(edgeCopy).from('$srcCopy').to('$tgtCopy'))
            .let('updatedRID', tx => tx.update(original['@rid'])
                .set(changes).set('history = $edgeCopy').set(changes)
                .where({createdAt: original.createdAt})
                .return('AFTER @rid'))
            .let('result', tx => tx.select().from('$updatedRID').fetch({'*': 1}));
        */
    }
    return commit.commit();
};

/**
 * Creates the transaction to delete a node and all of its surrounding edges
 * This requires copy all neighbors and modifying any immediate edges in
 * addition to the modifying the current node
 *
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt options
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
 * @param {orientjs.Db} db orientjs database connection
 * @param {Object} opt options
 * @param {ClassModel} opt.model the model to use in formatting the record changes
 * @param {Object} opt.changes the content for the new node (any unspecified attributes are assumed to be unchanged)
 * @param {Query} opt.query the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
 */
const modify = async (db, opt) => {
    const {
        model, user, query
    } = opt;
    if (!query || !model || !user) {
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
    const [original] = await select(db, query, {
        exactlyN: 1,
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
        commit = await updateNodeTx(db, {
            original, user, changes, model
        });
    }
    logger.log('debug', commit.buildStatement());
    try {
        const result = await commit.return('$result').one();
        if (!result) {
            throw new Error('Failed to modify');
        }
        return result;
    } catch (err) {
        err.sql = commit.buildStatement();
        throw wrapIfTypeError(err);
    }
};


/**
 * Update a node or edge.
 *
 * @param {orientjs.Db} db orientjs database connection
 * @param {Object} opt options
 * @param {Object} opt.changes the new content to be set for the node/edge
 * @param {Query} opt.query the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
 */
const update = async (db, opt) => {
    if (opt.changes === null) {
        throw new AttributeError('opt.changes is a required argument');
    }
    return modify(db, opt);
};

/**
 * Delete a record by marking it deleted. For node, delete the connecting edges as well.
 *
 * @param {orientjs.Db} db orientjs database connection
 * @param {Object} opt options
 * @param {Query} opt.query the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
 */
const remove = async (db, opt) => modify(db, Object.assign({}, opt, {changes: null}));


module.exports = {
    remove,
    update
};
