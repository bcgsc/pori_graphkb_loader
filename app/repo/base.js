'use strict';
const {AttributeError, ControlledVocabularyError, MultipleResultsFoundError, NoResultFoundError, PermissionError, AuthenticationError} = require('./error');
const cache = require('./cache');
const {timeStampNow} = require('./util');
const {PERMISSIONS} = require('./constants');


const checkAccess = (user, model, permissionsRequired) => {
    if (! user.permissions) {
        return false;
    }
    if (user.permissions[model.name] !== undefined && (permissionsRequired & user.permissions[model.name])) {
        return true;
    }
    for (let name of model.inherits) {
        if (user.permissions[name] !== undefined) {
            if (permissionsRequired & user.permissions[name]) {
                return true;
            }
        }
    }
    return false;
};


const createUser = async (db, opt) => {
    const {model, userName, groupNames} = opt;
    const record = model.formatRecord({
        name: userName, 
        groups: Array.from(groupNames, x => cache.userGroups[x]['@rid']), 
        deletedAt: null
    }, {dropExtra: false, addDefaults: true});
    await db.insert().into(model.name)
        .set(record)
        .one();
    const user = await select(db, {where: {name: userName}, model: model, exactlyN: 1});
    return user;
}


const populateCache = async (db, schema) => {
    // load the user groups
    const groups = await select(db, {model: schema.UserGroup});
    for (let group of groups) {
        cache.userGroups[group.name] = group;
    }
    // load the individual users
    const users = await select(db, {model: schema.User});
    for (let user of users) {
        cache.users[user.name] = user;
    }
    // load the vocabulary
    await cacheVocabulary(db, schema.Vocabulary);
}

const cacheVocabulary = async (db, model) => {
    // load the vocabulary
    if (process.env.VERBOSE == '1') {
        console.log('updating the vocabulary cache');
    }
    const rows = await select(db, {model: model});
    // reformats the rows to fit with the cache expected structure
    cache.vocabulary = {};  // remove old vocabulary
    for (let row of rows) {
        if (cache.vocabulary[row.class] === undefined) {
            cache.vocabulary[row.class] = {};
        }
        if (cache.vocabulary[row.class][row.property] === undefined) {
            cache.vocabulary[row.class][row.property] = [];
        }
        cache.vocabulary[row.class][row.property].push(row);
    }
    if (process.env.VERBOSE == '1') {
        console.log(cache.vocabulary);
    }
};

/*
 * create a record
 */
const create = async (db, opt) => {
    const {content, model, user} = opt;
    if (model.isEdge) {
        return await createEdge(db, opt);
    }
    const record = model.formatRecord(
        Object.assign({}, content, {user: user['@rid']}), 
        {dropExtra: false, addDefaults: true});
    return await db.insert().into(model.name).set(record).one();
};


const createEdge = async (db, opt) => {
    const {content, model, user} = opt;
    content.createdBy = user['@rid']; 
    const record = model.formatRecord(content, {dropExtra: false, addDefaults: true});
    const from = record.out;
    const to = record.in;
    delete record.out;
    delete record.in;
    return await db.create('EDGE', model.name).from(from).to(to).set(record).one();
}


const getStatement = (query) => {
    let statement = query.buildStatement();
    for (let key of Object.keys(query._state.params)) {
        let value = query._state.params[key];
        if (typeof value === 'string') {
            value = `'${value}'`;
        }
        statement = statement.replace(':' + key, `${value}`);
    }
    return statement;
}


const select = async (db, opt) => {
    // set the default options
    opt = Object.assign({
        activeOnly: true, 
        exactlyN: null, 
        fetchPlan: {'*': 1}, 
        debug: false,
        where: {}
    }, opt);
    const params = opt.model.formatRecord(opt.where, {addDefaults: false, dropExtra: false, ignoreMissing: true});
    if (opt.activeOnly) {
        params.deletedAt = null;
    }
    let query = db.select().from(opt.model.name).where(params);
    if (Object.keys(params).length == 0) {
        query = db.select().from(opt.model.name);
    }
    
    if (opt.debug) {
        console.log('select query statement:', getStatement(query));
    }
    const recordList  = await query.fetch(opt.fetchPlan).all();
    if (opt.exactlyN !== null) {
        if (recordList.length === 0) {
            if (opt.exactlyN === 0) {
                return [];
            } else {
                throw new NoResultFoundError(`query returned an empty list: ${getStatement(query)}`);
            }
        } else if (opt.exactlyN !== recordList.length) {
            throw new MultipleResultsFoundError(
                `query returned unexpected number of results. Found ${recordList.length} results `
                `but expected ${opt.exactlyN} results: ${getStatement(query)}`
            );
        } else {
            return recordList;
        }
    } else {
        return recordList;
    }
};

const remove = async (db, opt) => {
    const {model, user, where} = opt;
    if (where['@rid'] === undefined) {
        const rec = (await select(db, {model: model, where: where, exactlyN: 1}))[0];
        where['@rid'] = rec['@rid'];
        where['createdAt'] = rec['createdAt'];
    }
    
    const commit = db.let(
        'updatedRID', (tx) => {
            // update the original record and set the history link to link to the copy
            return tx.update(`${where['@rid']}`)
                .set({deletedAt: timeStampNow()})
                .set(`deletedBy = ${user['@rid']}`)
                .return('AFTER @rid')
                .where(where);
        }).let('updated', (tx) => {
            return tx.select().from('$updatedRID').fetch({history: 10});
        }).commit();
    try {
        return await commit.return('$updated').one();
    } catch (err) {
        err.sql = commit.buildStatement();
        throw err;
    }
};

/*
 * uses a transaction to copy the current record into a new record
 * then update the actual current record (to preserve links)
 * the link the copy to the current record with the history link
 */
const update = async (db, opt) => {
    const {content, model, user, where} = opt;
    const verbose = opt.verbose || (process.env.VERBOSE == '1' ? true : false);
    const original = (await select(db, {model: model, where: where, exactlyN: 1}))[0];
    const originalWhere = Object.assign(model.formatRecord(original, {dropExtra: true, addDefaults: false}));
    delete originalWhere.createdBy;
    delete originalWhere.history;
    const copy = Object.assign({}, originalWhere, {deletedAt: timeStampNow()});

    const commit = db.let(
        'copy', (tx) => {
            // create the copy of the original record with a deletion time
            if (original.history !== undefined) {
                return tx.create(model.isEdge ? 'EDGE' : 'VERTEX', model.name)
                    .set(copy)
                    .set(`createdBy = ${original.createdBy['@rid']}`)
                    .set(`deletedBy = ${user['@rid']}`)
                    .set(`history = ${original.history['@rid']}`);
            } else {
                return tx.create(model.isEdge ? 'EDGE' : 'VERTEX', model.name)
                    .set(copy)
                    .set(`createdBy = ${original.createdBy['@rid']}`)
                    .set(`deletedBy = ${user['@rid']}`);
            }
        }).let('updatedRID', (tx) => {
            // update the original record and set the history link to link to the copy
            return tx.update(`${original['@rid']}`)
                .set(content)
                .set('history = $copy')
                .return('AFTER @rid')
                .where(originalWhere);
        }).let('updated', (tx) => {
            return tx.select().from('$updatedRID').fetch({history: 10});
        }).commit();
    if (verbose) {
        console.log(`update: ${commit.buildStatement()}`);
    }
    try {
        return await commit.return('$updated').one();
    } catch (err) {
        err.sql = commit.buildStatement();
        throw err;
    }
};

module.exports = {select, create, update, remove, checkAccess, createUser, populateCache, cacheVocabulary};
