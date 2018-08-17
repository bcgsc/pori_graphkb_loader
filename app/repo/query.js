/**
 * The query module is reponsible for building the complex psuedo-SQL statements
 */
const _ = require('lodash');
const {RID} = require('orientjs');

const {AttributeError} = require('./error');
const {
    quoteWrap, looksLikeRID, castToRID
} = require('./util');


const RELATED_NODE_DEPTH = 3;
const PARAM_PREFIX = 'param';
const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];
const SPECIAL_QUERY_ARGS = new Set([
    'fuzzyMatch', // follow deprecatedby/aliasof links
    'ancestors', // follow outgoing edges
    'descendants', // follow incoming edges
    'returnProperties', // return select properties only
    'limit', // limit the number of records to return
    'skip',
    'neighbors',
    'activeOnly',
    'v',
    'direction',
    'or'
]);


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
                return `.${
                    this.type
                }(${
                    classesString
                }){while: (${
                    this.type
                }(${
                    classesString
                }).size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}`;
            }
            return `.${
                this.type
            }(${
                classesString
            }){while: (${
                this.type
            }(${
                classesString
            }).size() > 0)}`;
        }
        if (this.activeOnly) {
            return `.${
                this.type
            }(${
                classesString
            }){while: ($depth < ${
                this.depth
            } AND deletedAt IS NULL), where: (deletedAt IS NULL)}`;
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
        if (!['CONTAINSTEXT', '=', 'CONTAINS', 'CONTAINSALL'].includes(operator)) {
            throw new AttributeError(
                'Invalid operator. Only =, CONTAINS(|TEXT|ALL)are supported operators'
            );
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
        if (this.value instanceof Array || this.value instanceof Set) {
            for (const element of this.value) {
                const pname = `${PARAM_PREFIX}${paramIndex++}`;
                params[pname] = element;
            }
            query = `${name} ${this.operator} [${
                Array.from(Object.keys(params), p => `:${p}`).join(', ')}]`;
        } else {
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
                query = `${name} ${this.operator} :${pname}`;
            } else if (this.operator !== '=') {
                throw new AttributeError('Cannot use list operators against a null value');
            } else {
                query = `${name} IS NULL`;
            }
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
    constructor(model, conditions, opt = {}) {
        this.model = model;
        this.direction = opt.direction || 'both';
        this.conditions = conditions; // conditions that make up the terms of the query
        this.follow = opt.follow || [];
        this.skip = opt.skip
            ? opt.skip
            : null;
        this.activeOnly = opt.activeOnly === undefined
            ? true
            : opt.activeOnly;
        this.properties = model.queryProperties; // includes subclass properties
        this.returnProperties = opt.returnProperties
            ? opt.returnProperties
            : null;
        this.or = opt.or || [];
        for (const propName of this.or) {
            if (conditions[propName] === undefined) {
                throw new AttributeError(`Cannot OR properties without conditions: ${propName}`);
            }
        }

        // can only return properties which belong to this class
        for (const propName of this.returnProperties || []) {
            if (this.properties[propName] === undefined) {
                throw new AttributeError(
                    `invalid return property '${
                        propName
                    }' is not a valid member of class '${
                        this.model.name
                    }'`
                );
            }
        }
    }

    /**
     * Given some node class, create a SelectionQuery to build select statements to find items
     * in the db
     *
     * @param {Object.<string,ClassModel>} schema the set of models avaiable for build queries from
     * @param
     */
    static parseQuery(schema, currModel, query = {}, opt = {}) {
        opt = Object.assign({
            skip: null,
            activeOnly: true,
            returnProperties: null || query.returnProperties
        }, opt);
        const conditions = {};
        const properties = currModel.queryProperties;
        const schemaMap = {};
        for (const model of Object.values(schema)) {
            schemaMap[model.name.toLowerCase()] = model;
        }
        // can only return properties which belong to this class
        for (const propName of query.returnProperties || []) {
            if (properties[propName] === undefined) {
                throw new AttributeError(
                    `invalid return property '${propName}' is not a valid member of class '${currModel.name}'`
                );
            }
        }

        if (opt.activeOnly) {
            conditions.deletedAt = new Comparison(null, opt.defaultOperator);
        }
        // split the original query into subqueries where appropriate
        for (let [name, value] of Object.entries(query)) {
            if (SPECIAL_QUERY_ARGS.has(name) || name === 'deletedAt') {
                continue;
            }
            let model; // model associated with this parameter (for potential subqueries)
            const prop = properties[name];
            if (prop === undefined) { // not a property of the current class
                if (schemaMap[name.toLowerCase()] === undefined) {
                    throw new AttributeError({
                        message: `unexpected attribute '${name}' is not defined on this class model '${currModel.name}'`,
                        query,
                        propertyNames: Object.keys(properties)
                    });
                } else {
                    model = schemaMap[name.toLowerCase()];
                }
            } else if (prop.linkedClass) {
                model = prop.linkedClass;
            }
            if (model && model.isEdge) {
                const {
                    conditions: eConditions,
                    properties: eProperties
                } = SelectionQuery.parseRelatedEdgeQuery(
                    schema, model, value, opt
                );
                Object.assign(conditions, eConditions);
                Object.assign(properties, eProperties);
            } else {
                if (!(value instanceof Comparison
                    || value instanceof Clause
                    || value instanceof this
                )) {
                    if (typeof value === 'object'
                        && value !== null
                        && !(value instanceof Array || value instanceof RID)
                    ) {
                        // subquery
                        if (!properties[name].linkedClass) {
                            throw new AttributeError(
                                `cannot subquery non-link properties (${currModel.name}.${name})`
                            );
                        } else if (properties[name].linkedClass.isEdge) {
                            throw new AttributeError(
                                `cannot subquery linked edges (${currModel.name}.${name})`
                            );
                        }
                        value = this.parseQuery(
                            schema,
                            properties[name].linkedClass,
                            value,
                            opt
                        );
                    } else {
                        value = new Comparison(value, opt.defaultOperator); // default to basic equals
                    }
                }
                // Any subquery without a follow statement can be flattened
                if (value instanceof SelectionQuery && value.follow.length === 0) {
                    const result = value.flattenAs(name);
                    Object.assign(conditions, result.conditions);
                    Object.assign(properties, result.properties);
                } else {
                    conditions[name] = value;
                }
            }
        }
        const follow = Follow.parse(Object.assign({activeOnly: opt.activeOnly}, query));
        if (follow.length > 0 && currModel.isEdge) {
            throw new AttributeError(
                'Invalid query, cannot create MATCH type queries on Edge classes'
            );
        }

        // try casting all values and check that values satify enum contraints
        for (const [name, condition] of Object.entries(conditions)) {
            const prop = properties[name];
            if (prop && !(condition instanceof this)) {
                if (prop.cast) {
                    condition.applyCast(prop.cast);
                }
                if (prop.choices) {
                    if (!condition.validateEnum(prop.choices)) {
                        throw new AttributeError(
                            `The attribute ${name} violates the expected controlled vocabulary`
                        );
                    }
                }
            }
        }
        return new this(currModel, conditions, Object.assign({}, opt, {follow}));
    }

    /**
     * Given some value containing edge query properties, parse and format into valid
     * query conditions
     *
     * @param {ClassModel} currModel the model for the type of edge being selected
     * @param {string} name the attribute name
     * @param {object} query the input query
     *
     * @example
     * > query.parseEdgeConditions(model, 'SupportedBy')
     */
    static parseRelatedEdgeQuery(schema, currModel, query, opt = {}) {
        if (query.ancestors !== undefined
            || query.descendants !== undefined
            || query.fuzzyMatch !== undefined
        ) {
            throw new AttributeError(
                'Edge-based query cannot specify MATCH properties (ancestors, descendants, or fuzzyMatch)'
            );
        }
        opt = Object.assign({
            activeOnly: true
        }, opt, {defaultOperator: 'CONTAINS'});
        const conditions = {};
        const properties = currModel.queryProperties;
        const schemaMap = {};
        for (const model of Object.values(schema)) {
            schemaMap[model.name.toLowerCase()] = model;
        }
        const prefix = `${query.direction || 'both'}E('${currModel.name}')`;

        if (opt.activeOnly) {
            query.deletedAt = new Comparison(null, opt.defaultOperator);
        }
        if (query.size !== undefined) {
            conditions[`${prefix}.size()`] = new Comparison(query.size);
        }
        query.direction = query.direction || 'both';
        // subquery based on the related node
        if (query.v) {
            let targetPrefix;
            if (query.direction === 'out') {
                targetPrefix = `${prefix}.inV()`;
            } else if (query.direction === 'in') {
                targetPrefix = `${prefix}.outV()`;
            } else {
                targetPrefix = `${prefix}.bothV()`;
            }
            if (query.v instanceof Set || query.v instanceof Array) {
                // must be an array of RIDs
                if (query.direction === 'both') {
                    if (query.v.length === 1) {
                        conditions[targetPrefix] = new Comparison(
                            castToRID(query.v[0]), 'CONTAINS'
                        );
                    } else {
                        const andList = Array.from(query.v, rid => new Comparison(castToRID(rid), 'CONTAINS'));
                        conditions[targetPrefix] = new Clause('AND', andList);
                    }
                } else {
                    targetPrefix = `${targetPrefix}.asSet()`;
                    conditions[targetPrefix] = new Comparison(
                        Array.from(query.v, castToRID)
                    );
                }
            } else {
                const subqModel = schema[query.v['@class']] || schema.V;
                if (subqModel === undefined) {
                    throw new AttributeError(
                        'Cannot create a general subquery, schema does not contain the general vertex description'
                    );
                }
                let subquery = this.parseQuery(schema, subqModel, query.v, opt);
                if (subquery.follow.length === 0) {
                    const result = subquery.flattenAs(targetPrefix);
                    Object.assign(conditions, result.conditions);
                    Object.assign(properties, result.properties);
                } else {
                    // default operator should be = for a subquery b/c it does not have to account for multiplcity
                    subquery = this.parseQuery(
                        schema,
                        subqModel,
                        query.v,
                        Object.assign({}, opt, {defaultOperator: '='})
                    );
                    conditions[targetPrefix] = subquery;
                }
            }
        }
        // now cast the edge attribute querys themselves
        const edgeProps = _.omit(query, ['v', 'direction', 'size']);
        if (Object.keys(edgeProps).length) {
            const subquery = this.parseQuery(
                schema,
                currModel,
                edgeProps,
                Object.assign({}, opt, {activeOnly: false}) // edges fail on null in list comparison
            );
            // Any subquery without a follow statement can be flattened
            if (subquery.follow.length === 0) {
                const result = subquery.flattenAs(prefix);
                Object.assign(conditions, result.conditions);
                Object.assign(properties, result.properties);
            } else {
                throw new AttributeError('Cannot use MATCH QUERY properties for edge queries');
            }
        }
        return {conditions, properties};
    }

    /**
     * Convert the current query into an object to be used as linked query properties on some
     * parent query
     */
    flattenAs(asProp) {
        const properties = {};
        const conditions = {};

        for (const [name, prop] of Object.entries(this.conditions)) {
            const combinedName = `${asProp}.${name}`;
            properties[combinedName] = this.properties[name];
            conditions[combinedName] = prop;
        }
        return {conditions, properties};
    }

    /**
     * @param {string} name name of the parameter
     * @param {Clause|Comparison} query possible query(s)
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
        let prop = this.properties[name];
        if (!prop) {
            prop = {type: 'null'};
        }

        const {query, params} = value.toString(name, paramIndex, prop.iterable);
        if (prop.cast) {
            for (const pname of Object.keys(params)) {
                params[pname] = prop.cast(params[pname]);
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
        const orConditions = [];
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
            if (this.or.includes(attr)) {
                orConditions.push(clause.query);
            } else {
                conditions.push(clause.query);
            }
        }
        if (orConditions.length <= 1) {
            conditions.push(...orConditions);
        } else {
            conditions.push(`(${orConditions.join(' OR ')})`);
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
            queryString = `${queryString} SKIP ${this.skip}`;
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

module.exports = {
    SelectionQuery, Clause, Comparison, SPECIAL_QUERY_ARGS, Follow
};
