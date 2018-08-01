

/**
 * Contains all functions for directly interacting with the database
 * @module app/repo/base
 */
const _ = require('lodash');
const {RID, RIDBag} = require('orientjs');

const {
    AttributeError,
    MultipleRecordsFoundError,
    NoRecordFoundError,
    RecordExistsError,
    PermissionError
} = require('./error');
const {
    timeStampNow, quoteWrap, looksLikeRID, VERBOSE, castToRID
} = require('./util');
const {PERMISSIONS} = require('./constants');


const RELATED_NODE_DEPTH = 3;
const PARAM_PREFIX = 'param';
const QUERY_LIMIT = 1000;
const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];
const SPECIAL_QUERY_ARGS = new Set([
    'fuzzyMatch',
    'ancestors',
    'descendants',
    'returnProperties',
    'limit',
    'skip',
    'neighbors',
    'activeOnly',
    'v',
    'direction'
]);
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
    constructor(classnames = [], type = 'both', depth = RELATED_NODE_DEPTH, activeOnly = true) {
        if (!['both', 'in', 'out'].includes(type)) {
            throw new AttributeError(`expected type to be: in, out, or both. But was given: ${type}`);
        }
        if (type === 'both' && depth === null) {
            throw new Error('following edges requires a stopping point. Cannot have null depth with type \'both\'');
        }
        this.classnames = classnames;
        this.type = type;
        this.depth = depth === null
            ? null
            : Number(depth);
        this.activeOnly = activeOnly;
    }

    /**
     * Converts the follow clause into an SQL statement
     */
    toString() {
        const classesString = Array.from(this.classnames, quoteWrap).join(', ');
        if (this.depth === null) {
            // follow until out of edge types
            if (this.activeOnly) {
                return `.${this.type}(${classesString}){while: (${this.type}(${classesString}).size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}`;
            }
            return `.${this.type}(${classesString}){while: (${this.type}(${classesString}).size() > 0)}`;
        }
        if (this.activeOnly) {
            return `.${this.type}(${classesString}){while: ($depth < ${this.depth} AND deletedAt IS NULL), where: (deletedAt IS NULL)}`;
        }
        return `.${this.type}(${classesString}){while: ($depth < ${this.depth})}`;
    }

    /**
     * Based on the input query, create the follow statement (part of a match expresion)
     * @param {object} query
     * @param {Array} [query.ancestors] list of edge class names to follow for all ancestors
     * @param {Array} [query.descendants] list of edge class names to follow for all descendants
     * @param {int} [query.fuzzyMatch] sets how far to follow 'aliasof' and 'deprecatedby' edges
     * @param {bool} [query.activeOnly=true] only follow active nodes/edges
     *
     * @returns {Follow} the follow statement
     */
    static parse(query) {
        const activeOnly = query.activeOnly === undefined
            ? true
            : query.activeOnly;
        const follow = [];
        // translate the fuzzyMatch/ancestors/descendants into proper follow statements
        if (query.ancestors) {
            follow.push([new this(query.ancestors, 'in', null, activeOnly)]);
        }
        if (query.descendants) {
            follow.push([new this(query.descendants, 'out', null, activeOnly)]);
        }
        if (query.fuzzyMatch) {
            const fuzzy = new this(FUZZY_CLASSES, 'both', query.fuzzyMatch, activeOnly);
            if (follow.length === 0) {
                follow.push([fuzzy]);
            } else {
                for (const followArr of follow) {
                    followArr.unshift(fuzzy);
                    followArr.push(fuzzy);
                }
            }
        }
        return follow;
    }
}


class Clause {
    /**
     * @param {string} type can be OR or AND
     * @param {Array.<(Comparison|Clause)>} comparisons the array of comparisons (or clauses) which make up the clause
     */
    constructor(type = 'OR', comparisons = []) {
        this.type = type;
        this.comparisons = Array.from(comparisons, (comp) => {
            if (comp instanceof Clause || comp instanceof Comparison) {
                return comp;
            }
            return new Comparison(comp);
        });
    }

    push(item) {
        this.comparisons.push(item);
    }

    get length() {
        return this.comparisons.length;
    }

    applyCast(cast) {
        for (const item of this.comparisons) {
            item.applyCast(cast);
        }
    }

    /**
     * @param {string} name the name of the attribute we are comparing to
     * @param {int} [paramIndex=0] the number to append to parameter names
     * @param {bool} [listableType=false] indicates if the attribute being compared to is a set/list/bag/map etc.
     */
    toString(name, paramIndex = 0, listableType = false) {
        const params = {};
        const components = [];
        for (const comp of this.comparisons) {
            const result = comp.toString(
                name,
                paramIndex + (Object.keys(params).length),
                listableType
            );
            if (comp instanceof Clause && comp.length > 1) {
                // wrap in brackets
                result.query = `(${result.query})`;
            }
            Object.assign(params, result.params);
            components.push(result.query);
        }
        const query = components.join(` ${this.type} `);
        return {query, params};
    }

    validateEnum(arr) {
        for (const comp of this.comparisons) {
            if (!comp.validateEnum(arr)) {
                return false;
            }
        }
        return true;
    }
}


class Comparison {
    /**
     * @param value the value to be compared to
     * @param {string} operator the operator to use for the comparison
     * @param {bool} negate if true then surround the comparison with a negation
     */
    constructor(value, operator = '=', negate = false) {
        this.value = value;
        this.operator = operator;
        this.negate = negate;
        if (operator !== '=' && operator !== '~') {
            throw new AttributeError('Invalid operator. Only = and ~ are supported operators');
        }
    }

    applyCast(cast) {
        if (this.value !== null) {
            this.value = cast(this.value);
        }
    }

    /**
     * Given some array, check that the value exists in it
     */
    validateEnum(arr) {
        if (this.value === null) {
            return true;
        }
        return arr.includes(this.value);
    }

    /**
     * @param {string} name the name of the attribute we are comparing to
     * @param {int} [paramIndex=0] the number to append to parameter names
     * @param {bool} [listableType=false] indicates if the attribute being compared to is a set/list/bag/map etc.
     */
    toString(name, paramIndex = 0, listableType = false) {
        const params = {};
        let query;
        const pname = `${PARAM_PREFIX}${paramIndex}`;
        if (listableType) {
            if (this.value === null) {
                query = `${name} CONTAINS NULL`;
            } else {
                params[pname] = this.value;
                query = `${name} CONTAINS :${pname}`;
            }
        } else if (this.value !== null) {
            params[pname] = this.value;
            query = `${name} ${this.operator === '~'
                ? 'CONTAINSTEXT'
                : '='} :${pname}`;
        } else {
            query = `${name} IS NULL`;
        }
        if (this.negate) {
            query = `NOT (${query})`;
        }
        return {query, params};
    }
}


class SelectionQuery {
    /**
     * Builds the query statement for selecting or matching records from the database
     *
     * @param {Object} opt Selection options
     * @param {boolean} [opt.activeOnly=true] Return only non-deleted records
     * @param {ClassModel} model the model to be selected from
     * @param {Object} [inputQuery={}] object of property names linked to values, comparisons, or clauses
     *
     */
    constructor(schema, model, inputQuery = {}, opt = {}) {
        this.schema = schema;
        this.model = model;
        this.conditions = {};
        this.follow = [];
        this.skip = opt.skip
            ? opt.skip
            : null;
        this.activeOnly = opt.activeOnly === undefined
            ? true
            : opt.activeOnly;
        this.properties = Object.assign({}, model.properties);
        this.returnProperties = inputQuery.returnProperties
            ? inputQuery.returnProperties
            : null;
        const {propertyNames} = this.model;
        // get the names of the edge classes for checking queries on edge 'properties'
        const edgeClasses = {};
        for (const mod of Object.values(schema)) {
            if (mod.isEdge) {
                edgeClasses[mod.name.toLowerCase()] = mod;
            }
        }
        // can only return properties which belong to this class
        for (const propName of this.returnProperties || []) {
            if (!propertyNames.includes(propName)) {
                throw new AttributeError(`invalid return property '${propName}' is not a valid member of class '${this.model.name}'`);
            }
        }

        if (this.activeOnly) {
            this.conditions.deletedAt = new Comparison(null);
        }
        this.cast = Object.assign({}, this.model.cast);
        // split the original query into subqueries where appropriate
        for (let [name, value] of Object.entries(inputQuery)) {
            if (SPECIAL_QUERY_ARGS.has(name) || name === 'deletedAt') {
                continue;
            }
            if (edgeClasses[name.toLowerCase()] !== undefined) {
                const edgeModel = edgeClasses[name.toLowerCase()];
                value = Object.assign({direction: 'both'}, value);
                const edgePropName = `${value.direction}E('${name}')`;

                if (value.size !== undefined) {
                    this.conditions[`${edgePropName}.size()`] = new Comparison(value.size);
                }
                if (value.v) {
                    let targetVertexName;
                    if (value.direction === 'out') {
                        targetVertexName = `${edgePropName}.inV()`;
                    } else if (value.direction === 'in') {
                        targetVertexName = `${edgePropName}.outV()`;
                    } else {
                        targetVertexName = `${edgePropName}.bothV()`;
                    }
                    for (let [vProp, vValue] of Object.entries(value.v)) {
                        if (!(vValue instanceof Comparison) && !(vValue instanceof Clause)) {
                            if (vValue === null || typeof vValue !== 'object') {
                                if (vValue instanceof 'string') {
                                    // without a model we need to manually cast values
                                    vValue = vValue.toLowerCase().trim();
                                    if (looksLikeRID(vValue, true)) {
                                        vValue = castToRID(value);
                                    }
                                }
                                vValue = new Comparison(vValue);
                            } else {
                                throw new AttributeError(`cannot nest queries after an edge-based selection: ${name}.v.${vProp}`);
                            }
                        }
                        this.conditions[`${targetVertexName}.${vProp}`] = vValue;
                    }
                }
                // now cast the edge attribute values themselves
                const edgeProps = _.omit(value, ['v', 'direction', 'size']);
                if (Object.keys(edgeProps).length) {
                    const subquery = new SelectionQuery(
                        schema,
                        edgeModel, _.omit(value, ['v', 'direction', 'size']),
                        {activeOnly: this.activeOnly}
                    );
                    // can this subquery be flattened?
                    try {
                        const result = subquery.flattenAs(edgePropName);
                        Object.assign(this.conditions, result.conditions);
                        Object.assign(this.properties, result.properties);
                    } catch (err) {
                        this.conditions[edgePropName] = value;
                    }
                }
            } else if (this.properties[name] === undefined) {
                throw new AttributeError(`unexpected attribute '${name}' is not defined on this class model '${this.model.name}'`);
            } else {
                if (!(value instanceof Comparison || value instanceof Clause || value instanceof SelectionQuery)) {
                    if (typeof value === 'object' && value !== null && !(value instanceof Array)) {
                        // subquery
                        if (this.properties[name].linkedModel) {
                            let subQueryModel = this.properties[name].linkedModel;
                            if (value['@class'] && value['@class'].value !== subQueryModel.name) {
                                subQueryModel = subQueryModel.subClassModel(value['@class'].value);
                            }
                            const subquery = new SelectionQuery(schema, subQueryModel, value, {activeOnly: this.activeOnly});
                            // can this subquery be flattened?
                            try {
                                const result = subquery.flattenAs(name);
                                Object.assign(this.conditions, result.conditions);
                                Object.assign(this.properties, result.properties);
                            } catch (err) {
                                this.conditions[name] = subquery;
                            }
                            continue;
                        } else {
                            throw new AttributeError(`cannot subquery the non-linked attribute '${name}'`);
                        }
                    }
                    value = new Comparison(value); // default to basic equals
                }
                this.conditions[name] = value;
            }
        }
        this.follow = Follow.parse(Object.assign({activeOnly: this.activeOnly}, inputQuery));

        for (const [name, condition] of Object.entries(this.conditions)) {
            if (!(condition instanceof SelectionQuery) && this.cast[name]) {
                condition.applyCast(this.cast[name]);
            }
            if (this.properties[name] && this.properties[name].choices) {
                if (!condition.validateEnum(this.properties[name].choices)) {
                    throw new AttributeError(`The attribute ${name} violates the expected controlled vocabulary`);
                }
            }
        }
    }

    /**
     * Convert the current query into an object to be used as linked query properties on some
     * parent query
     */
    flattenAs(asProp) {
        if (this.follow.length > 0) {
            throw new AttributeError('cannot flatten a selection query with a non-zero follow statment');
        }
        const result = {
            properties: {}, conditions: {}
        };
        for (const [name, prop] of Object.entries(this.conditions)) {
            const combinedName = `${asProp}.${name}`;
            result.properties[combinedName] = this.properties[name];
            result.conditions[combinedName] = prop;
        }
        return result;
    }

    /**
     * @param {string} name name of the parameter
     * @param {Clause|Comparison} value possible value(s)
     * @param {int} [paramIndex=0] the index to use for naming parameters
     *
     * @example
     *  >>> query.OrClause('thing', new Clause('OR', [new Comparison('blargh'), new Comparison(null)]))
     *  {query: '(thing = :param0 OR thing IS NULL)', params: {param0: 'blargh'}}
     *
     * @example
     *  >>> query.OrClause('thing', new Comparison(2))
     *  {query: 'thing = :param0', params: {param0: 2}}
     */
    conditionClause(name, value, paramIndex = 0) {
        let property = this.properties[name];
        if (!property) {
            property = {type: 'null'};
        }

        let isList = false;
        if (/^(embedded|link)(list|set|map|bag)$/.exec(property.type)) {
            isList = true;
        }

        const {query, params} = value.toString(name, paramIndex, isList);
        if (property.type.includes('link')) {
            for (const pname of Object.keys(params)) {
                if (params[pname] instanceof RID) {
                    continue;
                } else if (params[pname] !== null && !looksLikeRID(params[pname])) {
                    throw new AttributeError(`'${name}' expects an RID or null but saw '${params[pname]}'`);
                } else if (params[pname] !== null) {
                    params[pname] = new RID(`#${params[pname].replace(/^#/, '')}`);
                }
            }
        }
        return {query, params};
    }

    /**
     * print the selection query as a string with SQL paramters.
     *
     * @param {int} paramStartIndex
     *
     * @returns {object} an object containing the SQL query statment (query) and the parameters (params)
     */
    toString(paramStartIndex = 0) {
        let queryString;
        const selectionElements = this.returnProperties
            ? this.returnProperties.join(', ')
            : '*';
        const conditions = [];
        const params = {};
        const conditionNames = Object.keys(this.conditions);
        conditionNames.sort(); // parameters will have the same aliases
        for (const attr of conditionNames) {
            let clause;
            if (this.conditions[attr] instanceof SelectionQuery) {
                clause = this.conditions[attr].toString(paramStartIndex);
                clause.query = `${attr} IN (SELECT @rid FROM (${clause.query}))`;
            } else {
                clause = this.conditionClause(attr, this.conditions[attr], paramStartIndex);
            }
            paramStartIndex += Object.keys(clause.params).length;
            Object.assign(params, clause.params);
            if (this.conditions[attr] instanceof Clause && this.conditions[attr].length > 1) {
                clause.query = `(${clause.query})`;
            }
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
            for (const arr of this.follow) {
                expressions.push(`${prefix}${Array.from(arr, x => x.toString()).join('')}`);
            }
            queryString = `MATCH ${expressions.join(', ')} RETURN $pathElements`;
            if (selectionElements !== '*') {
                queryString = `SELECT ${selectionElements} FROM (${queryString})`;
            }
        } else {
            queryString = `SELECT ${selectionElements} FROM ${this.model.name}`;
            if (conditions.length > 0) {
                queryString = `${queryString} WHERE ${conditions.join(' AND ')}`;
            }
        }
        if (this.skip != null) {
            queryString = `${queryString} skip ${this.skip}`;
        }
        return {query: queryString, params};
    }

    /**
     * Returns the query as a string but substitutes all parameters to make the results more
     * readable.
     *
     * @warning
     *      use the toString and params to query the db. This method is for VERBOSE/logging only
     */
    displayString() {
        let {query: statement, params} = this.toString();
        for (const key of Object.keys(params)) {
            let value = params[key];
            if (typeof value === 'string') {
                value = `'${value}'`;
            }
            statement = statement.replace(new RegExp(`:${key}`, 'g'), `${value}`);
        }
        return statement;
    }
}


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
 * @param {ClassModel} opt.model the model to be selected from
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
    Clause,
    Comparison,
    create,
    createUser,
    Follow,
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
