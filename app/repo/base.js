'use strict';
const {AttributeError, MultipleResultsFoundError, NoResultFoundError} = require('./error');
const cache = require('./cache');
const {timeStampNow, quoteWrap} = require('./util');

const RELATED_NODE_DEPTH = 3;
const QUERY_LIMIT = 1000;



class Follow {
    /**
     * Sets up the edge following clause portion for tha match query statement
     * @param {Array[string]} classnames the names of the edge classes to follow
     * @param {string} type the type of edge to follow (in, out, both)
     * @param {int|null} depth depth of the edges to follow
     *
     * @example
     * > new Follow().toString();
     * '.both(){while: ($depth < 3)}'
     *
     * > new Follow(['blargh', 'monkeys'], 'out', null).toString();
     * '.out('blargh', 'monkeys'){while: ($matched.out('blargh', 'monkeys').size() > 0)}'
     *
     */
    constructor(classnames=[], type='both', depth=RELATED_NODE_DEPTH) {
        if (!['both', 'in', 'out'].includes(type)) {
            throw new AttributeError(`expected type to be: in, out, or both. But was given: ${type}`);
        }
        if (type === 'both' && depth === null) {
            throw new Error('following edges requires a stopping point. Cannot have null depth with type \'both\'');
        }
        this.classnames = classnames;
        this.type = type;
        this.depth = depth;
    }
    toString() {
        const classesString = Array.from(this.classnames, quoteWrap).join(', ');
        if (this.depth === null) {
            // follow until out of edge types
            return `.${this.type}(${classesString}){while: ($matched.${this.type}(${classesString}).size() > 0)}`;
        } else {
            return `.${this.type}(${classesString}){while: ($depth < ${this.depth})}`;
        }
    }
}


class SelectionQuery {
    /**
     * Builds the query statement for selecting or matching records from the database
     *
     * @param {Object} opt Selection options
     * @param {Boolean} [opt.activeOnly=true] Return only non-deleted records
     * @param {ClassModel} model the model to be selected from
     * @param {Object} [where={}] the query requirements
     *
     * @param {Array[Array[Follow]]} [where.follow] Array of Arrays of Follow clauses.
     *
     */
    constructor(model, where={}, opt={}) {
        this.model = model;
        this.conditions = [];
        this.params = {};
        this.paramIndex = opt.paramIndex || 0;
        this.follow = opt.follow || [];

        const formatted = model.formatQuery(where);
        const {subqueries} = formatted;
        where = formatted.where;
        if (opt.activeOnly) {
            where.deletedAt = null;
        }

        for (let attr of Object.keys(where)) {
            const value = (typeof where[attr] === 'object' && where[attr] !== null) ? where[attr] : [where[attr]];
            const clause = this.conditionClause(attr, value);
            Object.assign(this.params, clause.params);
            this.paramIndex += Object.keys(clause.params).length;
            this.conditions.push(clause.query);
        }
        for (let attr of Object.keys(subqueries)) {
            const subQuery = new SelectionQuery(
                this.model.linkedModels[attr],
                subqueries[attr],
                {paramIndex: this.paramIndex, activeOnly: opt.activeOnly}
            );
            Object.assign(this.params, subQuery.params);
            this.paramIndex += Object.keys(subQuery.params).length;
            this.conditions.push(`${attr} in (SELECT @rid from (${subQuery.toString()}))`);
        }
    }
    /**
     * @param {string} name name of the parameter
     * @param {Array} arr array of possible values
     *
     * @example
     *  >>> query.OrClause('thing', ['blargh', null])
     *  {query: '(thing = :param0 OR thing IS NULL)', params: {param0: 'blargh'}}
     *
     *  >>> query.OrClause('thing', [2])
     *  {query: 'thing = :param0', params: {param0: 2}}
     */
    conditionClause(name, arr, opt) {
        opt = Object.assign({
            joinOperator: ' OR ',
            noWrap: false
        }, opt);
        const content = [];
        const params = {};
        let paramStartIndex = Object.keys(this.params).length;

        for (let value of arr) {
            const pname = `param${paramStartIndex}`;
            if (value === undefined || value === null) {
                content.push(`${name} is NULL`);
            } else {
                content.push(`${name} = :${pname}`);
                params[pname] = value;
                paramStartIndex++;
            }
        }
        let query = `${content.join(opt.joinOperator)}`;
        if (content.length > 1 && ! opt.noWrap) {
            query = `(${query})`;
        }
        return {query, params};
    }
    toString() {
        let queryString;
        if (this.follow.length > 0) {
            // must be a match query to follow edges
            const prefix = `{class: ${this.model.name}, where: (${this.conditions.join(', ')})}`;
            const expressions = [];
            for (let arr of this.follow) {
                expressions.push(`${prefix}${Array.from(arr, x => x.toString()).join('')}`);
            }
            queryString = `MATCH ${expressions.join(', ')} RETURN \$pathElements`;
        } else {
            queryString = `SELECT * FROM ${this.model.name} WHERE ${this.conditions.join(' AND ')}`;
        }
        return queryString;
    }
    /**
     * Returns the query as a string but substitutes all parameters to make the results more readable.
     *
     * @warning
     *      use the toString and params to query the db. This method is for debugging/logging only
     */
    displayString() {
        let statement = this.toString();
        for (let key of Object.keys(this.params)) {
            let value = this.params[key];
            if (typeof value === 'string') {
                value = `'${value}'`;
            }
            statement = statement.replace(new RegExp(':' + key, 'g'), `${value}`);
        }
        return statement;
    }
}


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
};


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
};

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
        Object.assign({}, content, {createdBy: user['@rid']}),
        {dropExtra: false, addDefaults: true});
    return await db.insert().into(model.name).set(record).one();
};


const createEdge = async (db, opt) => {
    const {content, model, user} = opt;
    content.createdBy = user['@rid'];
    const record = model.formatRecord(content, {dropExtra: false, addDefaults: true});
    const from = record.out;
    const to = record.in;
    console.log('createEdge', record);
    delete record.out;
    delete record.in;
    return await db.create('EDGE', model.name).from(from).to(to).set(record).one();
};


/**
 * Builds the query statement for selecting or matching records from the database
 *
 * @param {Object} db Database connection from orientjs
 *
 * @param {Object} opt Selection options
 * @param {Boolean} [opt.activeOnly=true] Return only non-deleted records
 * @param {Boolean} [opt.debug=true] print more output to help with debugging queries
 * @param {ClassModel} opt.model the model to be selected from
 * @param {Object} [opt.fetchPlan] key value mapping of class names to depths of edges to follow or '*' for any class
 * @param {Object} [opt.where={}] the query requirements
 * @param {int|null} [opt.exactlyN=null] if not null, check that the returned record list is the same length as this value
 * @param {int|null} [opt.limit=QUERY_LIMIT] the maximum number of records to return
 *
 */
const select = async (db, opt) => {
    // set the default options
    opt = Object.assign({
        activeOnly: true,
        exactlyN: null,
        fetchPlan: {'*': 1},
        debug: true,
        where: {},
        limit: QUERY_LIMIT
    }, opt);
    console.log('select', opt);

    const query = new SelectionQuery(opt.model, opt.where, opt);

    if (opt.debug) {
        console.log('select query statement:', query.displayString());
    }

    // send the query statement to the database
    const recordList = await db.query(query.toString(), {
        params: query.params,
        limit: opt.limit,
        fetchPlan: opt.fetchPlan
    }).all();

    if (opt.exactlyN !== null) {
        if (recordList.length === 0) {
            if (opt.exactlyN === 0) {
                return [];
            } else {
                throw new NoResultFoundError(`query returned an empty list: ${query.displayString()}`);
            }
        } else if (opt.exactlyN !== recordList.length) {
            throw new MultipleResultsFoundError(
                `query returned unexpected number of results. Found ${recordList.length} results ` +
                `but expected ${opt.exactlyN} results: ${query.displayString()}`
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
            return tx.select().from('$updatedRID').fetch({'*': 1});
        }).commit();
    try {
        return await commit.return('$updated').one();
    } catch (err) {
        err.sql = commit.buildStatement();
        throw err;
    }
};


/**
 * uses a transaction to copy the current record into a new record
 * then update the actual current record (to preserve links)
 * the link the copy to the current record with the history link
 *
 * @param {Object} db orientjs database connection
 * @param {Object} opt options
 * @param {Boolean=false} opt.verbose print extra information to the console
 * @param {Object} opt.content the content for the new node (any unspecified attributes are assumed to be unchanged)
 * @param {Object} opt.where the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
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
            return tx.select().from('$updatedRID').fetch({'*': 1});
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

module.exports = {select, create, update, remove, checkAccess, createUser, populateCache, cacheVocabulary, QUERY_LIMIT, SelectionQuery, Follow, RELATED_NODE_DEPTH};
