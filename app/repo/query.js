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
        if (!['CONTAINSTEXT', '=', 'CONTAINS', 'CONTAINSALL'].includes(operator)) {
            throw new AttributeError('Invalid operator. Only =, CONTAINSTEXT, CONTAINS, CONTAINSALL are supported operators');
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
            query = `${name} ${this.operator} :${pname}`;
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
                                vValue = new Comparison(vValue, 'CONTAINS');
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

module.exports = {
    SelectionQuery, Clause, Comparison, SPECIAL_QUERY_ARGS, Follow
};
