'use strict';
const {AttributeError, MultipleRecordsFoundError, NoRecordFoundError, RecordExistsError} = require('./error');
const cache = require('./cache');
const {timeStampNow, quoteWrap, looksLikeRID, getParameterPrefix, DEBUG, VERBOSE} = require('./util');
const RID = require('orientjs').RID;


const RELATED_NODE_DEPTH = 3;
const QUERY_LIMIT = 1000;
const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];


/**
 * Check if the error is a particular type (expected from orientdb) and return an instance of the corresponding error class
 */
const wrapIfTypeError = (err) => {
    if (err && err.type) {
        if (err.type.toLowerCase().includes('orecordduplicatedexception')) {
            return new RecordExistsError(err);
        } else if (err.type.toLowerCase().includes('orecordnotfoundexception')) {
            return new NoRecordFoundError(err);
        }
    }
    return err;
};


class Follow {
    /**
     * Sets up the edge following clause portion for tha match query statement
     * @param {string[]} classnames the names of the edge classes to follow
     * @param {string} [type='both'] the type of edge to follow (in, out, both)
     * @param {?number} [depth=RELATED_NODE_DEPTH] depth of the edges to follow
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
        this.depth = depth === null ? null : Number(depth);
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
    static parse(query) {
        const follow = [];
        const splitUnlessEmpty = (string) => {
            return string === '' ? [] : string.split(',');
        };
        // translate the fuzzyMatch/ancestors/descendants into proper follow statements
        if (query.ancestors !== undefined) {
            if (typeof query.ancestors === 'string') {
                follow.push([new this(splitUnlessEmpty(query.ancestors), 'in', null)]);
            } else {
                follow.push(Array.from(query.ancestors, anc => new this(splitUnlessEmpty(anc), 'in', null)));
            }
        }
        if (query.descendants !== undefined) {
            if (typeof query.descendants === 'string') {
                follow.push([new this(splitUnlessEmpty(query.descendants), 'out', null)]);
            } else {
                follow.push(Array.from(query.descendants, desc => new this(splitUnlessEmpty(desc), 'out', null)));
            }
        }
        if (query.fuzzyMatch) {
            const fuzzy = new this(FUZZY_CLASSES, 'both', query.fuzzyMatch);
            if (follow.length === 0) {
                follow.push([fuzzy]);
            } else {
                for (let followArr of follow) {
                    followArr.unshift(fuzzy);
                    followArr.push(fuzzy);
                }
            }
        }
        return follow;
    }
}


class SelectionQuery {
    /**
     * Builds the query statement for selecting or matching records from the database
     *
     * @param {Object} opt Selection options
     * @param {boolean} [opt.activeOnly=true] Return only non-deleted records
     * @param {ClassModel} model the model to be selected from
     * @param {Object} [where={}] the query requirements
     *
     */
    constructor(model, inputQuery={}, opt={activeOnly: false}) {
        this.model = model;
        this.conditions = {};
        this.follow = [];

        const query = {where: {}, subqueries: {}, follow: []};
        const propertyNames = this.model.propertyNames;


        if (opt.activeOnly && propertyNames.includes('deletedAt')) {
            inputQuery.deletedAt = null;
        }
        const properties = this.model.properties;
        const cast = this.model.cast;
        const subqueries = {};
        const specialArgs = ['fuzzyMatch', 'ancestors', 'descendants', 'returnProperties', 'limit'];
        const odbArgs = ['@rid', '@class'];
        // split the original query into subqueries where appropriate
        for (let condition of Object.keys(inputQuery)) {
            if (specialArgs.includes(condition)) {
                continue;
            }
            let {prefix, suffix} = getParameterPrefix(condition);
            let value = inputQuery[condition];
            if (typeof value !== 'object' || value === null) {
                // query params are returned as an array when given twice in the url but otherwise not, change all to arrays for consistency
                value = [value];
            }
            if (! propertyNames.includes(prefix) && ! odbArgs.includes(prefix)) {
                throw new AttributeError(`unexpected attribute ${prefix} for class ${this.model.name}`);
            }
            if (suffix && properties[prefix].linkedModel) {
                if (subqueries[prefix] === undefined) {
                    subqueries[prefix] = {where: {}, model: properties[prefix].linkedModel};
                }
                subqueries[prefix].where[suffix] = value;
            } else {
                if (cast[condition]) {
                    if (properties[condition] && /(set|list|map)/.exec(properties[condition].type)) {  //expect a mutli-value type already
                        try {
                            value = cast[condition](value);
                        } catch (err) {
                            throw new AttributeError(err);
                        }
                    } else {
                        // cast is meant to operate individually
                        for (let i=0; i < value.length; i++) {
                            try {
                                value[i] = cast[condition](value[i]);
                            } catch (err) {
                                throw new AttributeError(err);
                            }
                        }
                    }
                }
                this.conditions[condition] = value;
            }
        }
        this.follow = Follow.parse(inputQuery);

        for (let propName of Object.keys(subqueries)) {
            const inputSubquery = subqueries[propName];
            const subquery = new SelectionQuery(inputSubquery.model, inputSubquery.where, opt);
            if (subquery.follow.length === 0) {  // don't need a subquery, can use direct links instead
                for (let subPropName of Object.keys(subquery.conditions)) {
                    this.conditions[`${propName}.${subPropName}`] = subquery.conditions[subPropName];
                }
            } else {
                this.conditions[propName] = subquery;
            }
        }

        if (inputQuery.returnProperties !== undefined) {
            // make sure the colnames specified make sense
            let props = inputQuery.returnProperties.split(',');
            for (let propName of props) {
                if (! propertyNames.includes(propName) && ! odbArgs.includes(propName)) {
                    throw new AttributeError(`returnProperties query parameter must be a csv delimited string of columns on this class type: ${propertyNames}`);
                }
            }
            query.returnProperties = props;
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
     * @example
     *  >>> query.OrClause('thing', [2])
     *  {query: 'thing = :param0', params: {param0: 2}}
     */
    conditionClause(name, arr, opt) {
        opt = Object.assign({
            joinOperator: ' OR ',
            noWrap: false,
            paramStartIndex: 0
        }, opt);
        const content = [];
        const params = {};
        const property = this.model.properties[name];

        for (let value of arr) {
            const pname = `param${opt.paramStartIndex}`;
            if (value === undefined || value === null) {
                content.push(`${name} is NULL`);
            } else {
                if (property && property.type && property.type.includes('link') && looksLikeRID(value)) {
                    value = new RID(`#${value.replace(/^#/, '')}`);
                }
                if ((typeof value !== 'object' || value instanceof RID) && property && /^(embedded|link)(list|set|map|bag)$/.exec(property.type)) {
                    content.push(`${name} contains :${pname}`);
                    params[pname] = value;
                    opt.paramStartIndex++;
                } else {
                    content.push(`${name} = :${pname}`);
                    params[pname] = value;
                    opt.paramStartIndex++;
                }
            }
        }
        let query = `${content.join(opt.joinOperator)}`;
        if (content.length > 1 && ! opt.noWrap) {
            query = `(${query})`;
        }
        return {query, params};
    }
    toString(paramStartIndex=0) {
        let queryString;
        const selectionElements = this.returnProperties ? this.returnProperties.join(', ') : '*';
        const conditions = [];
        const params = {};
        const conditionNames = Object.keys(this.conditions);
        conditionNames.sort();  // parameters will have the same aliases
        for (let attr of conditionNames) {
            let clause;
            if (this.conditions[attr] instanceof SelectionQuery) {
                clause = this.conditions[attr].toString(paramStartIndex);
                clause.query = `${attr} IN (SELECT @rid FROM (${clause.query}))`;
            } else {
                clause = this.conditionClause(attr, this.conditions[attr], {paramStartIndex});
            }
            paramStartIndex += Object.keys(clause.params).length;
            Object.assign(params, clause.params);
            conditions.push(clause.query);
        }
        if (this.follow.length > 0) {
            // must be a match query to follow edges
            let prefix;
            if (conditions.length > 0) {
                prefix = `{class: ${this.model.name}, where: (${conditions.join(' AND ')})}`;
            } else {
                prefix = `{class: ${this.model.name}}`;
            }
            const expressions = [];
            for (let arr of this.follow) {
                expressions.push(`${prefix}${Array.from(arr, x => x.toString()).join('')}`);
            }
            queryString = `MATCH ${expressions.join(',')} RETURN \$pathElements`;
        } else {
            queryString = `SELECT ${selectionElements} FROM ${this.model.name}`;
            if (conditions.length > 0) {
                queryString = `${queryString} WHERE ${conditions.join(' AND ')}`;
            }
        }
        return {query: queryString, params: params};
    }
    /**
     * Returns the query as a string but substitutes all parameters to make the results more readable.
     *
     * @warning
     *      use the toString and params to query the db. This method is for debugging/logging only
     */
    displayString() {
        let {query: statement, params} = this.toString();
        for (let key of Object.keys(params)) {
            let value = params[key];
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
    const {model, userName, groupNames} = opt;
    const record = model.formatRecord({
        name: userName,
        groups: Array.from(groupNames, x => cache.userGroups[x]['@rid']),
        deletedAt: null
    }, {dropExtra: false, addDefaults: true});
    await db.insert().into(model.name)
        .set(record)
        .one();
    try {
        return await select(db, {where: {name: userName}, model: model, exactlyN: 1});
    } catch (err) {
        throw wrapIfTypeError(err);
    }
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
    if (VERBOSE) {
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
    if (VERBOSE) {
        console.log(cache.vocabulary);
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
        return await createEdge(db, opt);
    }
    const record = model.formatRecord(
        Object.assign({}, content, {createdBy: user['@rid']}),
        {dropExtra: false, addDefaults: true});
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
    const from = record.out;
    const to = record.in;
    delete record.out;
    delete record.in;
    try {
        return await db.create('EDGE', model.name).from(from).to(to).set(record).one();
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};


/**
 * Builds the query statement for selecting or matching records from the database
 *
 * @param {Object} db Database connection from orientjs
 *
 * @param {Object} opt Selection options
 * @param {boolean} [opt.activeOnly=true] Return only non-deleted records
 * @param {ClassModel} opt.model the model to be selected from
 * @param {string} [opt.fetchPlan='*: 1'] key value mapping of class names to depths of edges to follow or '*' for any class
 * @param {Object} [opt.where={}] the query requirements
 * @param {?number} [opt.exactlyN=null] if not null, check that the returned record list is the same length as this value
 * @param {?number} [opt.limit=QUERY_LIMIT] the maximum number of records to return
 *
 */
const select = async (db, opt) => {
    // set the default options
    opt = Object.assign({
        activeOnly: true,
        exactlyN: null,
        fetchPlan: '*:1',
        where: {},
        limit: QUERY_LIMIT
    }, opt);
    const query = new SelectionQuery(opt.model, opt.where, opt);
    if (DEBUG) {
        console.log('select query statement:', query.displayString(), {limit: opt.limit, fetchPlan: opt.fetchPlan});
    }

    // send the query statement to the database
    const {params, query: statement} = query.toString();
    const recordList = await db.query(statement, {
        params: params,
        limit: opt.limit,
        fetchPlan: opt.fetchPlan
    }).all();

    if (opt.exactlyN !== null) {
        if (recordList.length === 0) {
            if (opt.exactlyN === 0) {
                return [];
            } else {
                throw new NoRecordFoundError({
                    message: 'query expected results but returned an empty list',
                    sql: query.displayString()
                });
            }
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


/**
 * Mark a particular record as deleted
 *
 *
 */
const remove = async (db, opt) => {
    const {model, user, where} = opt;
    let rid = where['@rid'];
    if (rid === undefined) {
        const rec = (await select(db, {model: model, where: where, exactlyN: 1}))[0];
        rid = rec['@rid'];
        where['createdAt'] = rec['createdAt'];
    }
    delete where['@rid'];
    const commit = db.let(
        'updatedRID', (tx) => {
            // update the original record and set the history link to link to the copy
            return tx.update(`${rid}`)
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
        throw wrapIfTypeError(err);
    }
};


/**
 * uses a transaction to copy the current record into a new record
 * then update the actual current record (to preserve links)
 * the link the copy to the current record with the history link
 *
 * @param {Object} db orientjs database connection
 * @param {Object} opt options
 * @param {Object} opt.content the content for the new node (any unspecified attributes are assumed to be unchanged)
 * @param {Object} opt.where the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
 */
const update = async (db, opt) => {
    const {content, model, user, where} = opt;
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
    if (VERBOSE) {
        console.log(`update: ${commit.buildStatement()}`);
    }
    try {
        return await commit.return('$updated').one();
    } catch (err) {
        err.sql = commit.buildStatement();
        throw wrapIfTypeError(err);
    }
};

module.exports = {select, create, update, remove, checkAccess, createUser, populateCache, cacheVocabulary, QUERY_LIMIT, SelectionQuery, Follow, RELATED_NODE_DEPTH};
