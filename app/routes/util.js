/**
 * @module app/routes/util
 */
const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');
const escapeStringRegexp = require('escape-string-regexp');

const {
    ErrorMixin, AttributeError, NoRecordFoundError, RecordExistsError
} = require('./../repo/error');
const {
    select, create, update, remove, QUERY_LIMIT
} = require('./../repo/base');
const {
    SPECIAL_QUERY_ARGS, Clause, Comparison
} = require('./../repo/query');
const {looksLikeRID, VERBOSE} = require('./../repo/util');
const {INDEX_SEP_CHARS} = require('./../repo/schema');
const {checkClassPermissions} = require('./../middleware/auth');

const MAX_JUMPS = 4; // fetchplans beyond 6 are very slow
const INDEX_SEP_REGEX = new RegExp(`[${escapeStringRegexp(INDEX_SEP_CHARS)}]+`, 'g');
const MIN_WORD_SIZE = 4;

class InputValidationError extends ErrorMixin {}
/*
 * check that the parameters passed are expected
 */
const validateParams = async (opt) => {
    const required = opt.required || [];
    const optional = opt.optional || [];
    const allowNone = opt.allowNone !== undefined
        ? opt.allowNone
        : true;
    const params = [];

    if (Object.keys(params).length === 0 && !allowNone) {
        throw new InputValidationError('no parameters were specified');
    }
    // check that the required parameters are present
    for (const attr of required) {
        if (params.indexOf(attr) < 0) {
            throw new InputValidationError(`missing required parameter: ${attr}. Found ${params}`);
        }
    }
    // check that all parameters are expected
    for (const attr of params) {
        if (required.indexOf(attr) < 0 && optional.indexOf(attr) < 0) {
            throw new InputValidationError(`unexpected parameter: ${attr}`);
        }
    }
    return true;
};


/**
 * Parse the operators prefixed on the query parameters
 *
 * @param {Object} inputQuery
 */
const parseQueryLanguage = (inputQuery) => {
    /**
     * parse any query parameters based on the expected operator syntax. The final result will be
     * an object of attribute names as keys and arrays (AND) or arrays (OR) or
     * clauses {value,operator}
     *
     * @example
     * > parseQueryLanguage({'name': ['~cancer', '~pancreas|~pancreatic']})
     * {
     *      name: [
     *          [{value: 'cancer', operator: '~'}],
     *          [{value: 'pancreas', operator: '~'}, {value: 'pancreatic', operator: '~'}]
     *      ]
     * }
     */
    const query = {};
    for (let [name, valueList] of Object.entries(inputQuery)) {
        if (name === 'fuzzyMatch' || name === 'limit' || name === 'skip' || name === 'neighbors') {
            if (isNaN(Number(valueList))) { // eslint-disable-line no-restricted-globals
                throw new InputValidationError(`Expected ${name} to be a number, but found ${valueList}`);
            }
            valueList = Number(valueList);
            if (
                (name === 'fuzzyMatch' || name === 'neighbors')
                && (valueList < 0 || valueList > MAX_JUMPS)
            ) {
                throw new InputValidationError(`${name} must be a number between 0 and ${MAX_JUMPS}`);
            }
            if ((name === 'skip' || name === 'limit') && (valueList < 1)) {
                throw new InputValidationError(`${name} must be a positive integer greater than zero`);
            }
            if (name === 'limit' && valueList > QUERY_LIMIT) {
                throw new InputValidationError(`${name} must be a number between 1 and ${QUERY_LIMIT}. Please use skip and limit to paginate larger queries`);
            }
            query[name] = valueList;
        } else if (name === 'descendants' || name === 'ancestors' || name === 'returnProperties') {
            if (typeof (valueList) !== 'string') {
                throw new InputValidationError(`Query parameter ${name} cannot be specified multiple times`);
            }
            query[name] = valueList.split(',').filter(x => x.length > 0); // empty string should give an empty list
        } else if (name === 'activeOnly') {
            valueList = valueList.trim().toLowerCase();
            if (['0', 'false', 'f'].includes(valueList)) {
                query.activeOnly = false;
            } else {
                query.activeOnly = true;
            }
        } else if (name === 'direction') {
            valueList = valueList.toString().toLowerCase().trim();
            if (valueList === 'out') {
                query.direction = 'out';
            } else if (valueList === 'in') {
                query.direction = 'in';
            } else {
                throw new InputValidationError(`direction must be 'out' or 'in' but found: ${valueList}`);
            }
        } else if (valueList !== null && typeof valueList === 'object' && !(valueList instanceof Array)) {
            // subqueries
            valueList = parseQueryLanguage(valueList);
            query[name] = valueList;
        } else {
            if (!(valueList instanceof Array)) {
                valueList = [valueList];
            }
            const clauseList = [];
            for (let i = 0; i < valueList.length; i++) {
                const orList = new Clause('OR');
                for (let value of valueList[i].split('|')) {
                    let negate = false;
                    if (value.startsWith('!')) {
                        negate = true;
                        value = value.slice(1);
                    }
                    let operator = '=';
                    if (value.startsWith('~')) {
                        operator = '~';
                        value = value.slice(1);
                        if (INDEX_SEP_REGEX.exec(value)) {
                            INDEX_SEP_REGEX.lastIndex = 0; // https://siderite.blogspot.com/2011/11/careful-when-reusing-javascript-regexp.html
                            // contains a separator char, should split into AND clause
                            const andClause = new Clause('AND', Array.from(
                                value.split(INDEX_SEP_REGEX), word => new Comparison(word, '~', negate)
                            ));
                            if (andClause.comparisons.some(comp => comp.value.length < MIN_WORD_SIZE)) {
                                throw new InputValidationError(`Word is too short to query with ~ operator. Must be at least ${MIN_WORD_SIZE} letters after splitting on separator characters: ${INDEX_SEP_CHARS}`);
                            }
                            orList.push(andClause);
                            continue;
                        } else if (value.length < MIN_WORD_SIZE) {
                            throw new InputValidationError(`Word is too short to query with ~ operator. Must be at least ${MIN_WORD_SIZE} letters`);
                        }
                    }
                    if (value === 'null') {
                        value = null;
                    }
                    orList.push(new Comparison(value, operator, negate));
                }
                if (orList.length === 1) {
                    clauseList.push(orList.comparisons[0]);
                } else {
                    clauseList.push(orList);
                }
            }
            if (clauseList.length > 1) {
                query[name] = new Clause('AND', clauseList);
            } else {
                query[name] = clauseList[0];
            }
        }
    }
    return query;
};


/*
 * add basic CRUD methods for any standard db class
 *
 * can add get/post/delete methods to a router
 *
 * example:
 *      router.route('/feature') = resource({model: <ClassModel>, db: <OrientDB conn>, reqQueryParams: ['source', 'name', 'biotype']});
 */
const addResourceRoutes = (opt) => {
    const {
        router, model, db, schema
    } = opt;
    const optQueryParams = opt.optQueryParams || _.concat(model._optional, model._required);
    const reqQueryParams = opt.reqQueryParams || [];
    const route = opt.route || model.routeName;

    // attach the db model required for checking class permissions
    router.use(route, (req, res, next) => {
        req.model = model;
        next();
    });
    router.use(route, checkClassPermissions);

    // add the get multiple / search route
    router.get(route,
        async (req, res) => {
            try {
                req.query = parseQueryLanguage(req.query);
            } catch (err) {
                if (err instanceof InputValidationError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                if (VERBOSE) {
                    console.error('INTERNAL_SERVER_ERROR', err);
                }
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
            try {
                validateParams({
                    params: _.omit(req.query, SPECIAL_QUERY_ARGS),
                    required: reqQueryParams,
                    optional: optQueryParams
                });
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
            }
            let fetchPlan = null;
            if (req.query.neighbors !== undefined) {
                fetchPlan = `*:${req.query.neighbors}`;
                delete req.query.neighbors;
            }
            try {
                const result = await select(db, {
                    model, where: req.query, fetchPlan, user: req.user, schema
                });
                return res.json({result: jc.decycle(result)});
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                if (VERBOSE) {
                    console.error('INTERNAL_SERVER_ERROR', err);
                }
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });

    // abstract classes only have a search endpoint
    if (model.isAbstract || model.name === 'Statement') {
        return;
    }

    router.post(route,
        async (req, res) => {
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError(
                    {message: 'No query parameters are allowed for this query type', params: req.query}
                ));
            }
            try {
                const result = await create(db, {model, content: req.body, user: req.user});
                return res.json({result: jc.decycle(result)});
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } if (err instanceof RecordExistsError) {
                    return res.status(HTTP_STATUS.CONFLICT).json(err);
                }
                console.log(err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });

    // Add the rid routes
    router.get(`${route}/:rid`,
        async (req, res) => {
            try {
                req.query = parseQueryLanguage(req.query);
            } catch (err) {
                if (err instanceof InputValidationError) {
                    if (process.env.DEBUG === '1') {
                        console.log(err.stack);
                    }
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                if (VERBOSE) {
                    console.error('INTERNAL_SERVER_ERROR', err);
                }
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
            if (!looksLikeRID(req.params.rid, false)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError(
                    {message: `rid does not look like a valid record ID: ${req.params.rid}`}
                ));
            }
            req.params.rid = `#${req.params.rid.replace(/^#/, '')}`;

            let fetchPlan = null;
            if (req.query.neighbors !== undefined) {
                fetchPlan = `*:${req.query.neighbors}`;
                delete req.query.neighbors;
            }

            try {
                validateParams({
                    params: _.omit(req.query, ['activeOnly']),
                    required: reqQueryParams,
                    optional: optQueryParams
                });
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
            }

            try {
                const result = await select(db, Object.assign(req.query, {
                    model,
                    where: {'@rid': req.params.rid},
                    exactlyN: 1,
                    fetchPlan,
                    user: req.user,
                    schema
                }));
                return res.json({result: jc.decycle(result[0])});
            } catch (err) {
                if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                }
                if (VERBOSE) {
                    console.error('INTERNAL_SERVER_ERROR', err);
                }
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
    if (!model.isEdge) {
        // disable update for edges (currently unable to work with using created edges inside a transaction)
        router.patch(`${route}/:rid`,
            async (req, res) => {
                if (!looksLikeRID(req.params.rid, false)) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError(
                        {message: `ID does not look like a valid record ID: ${req.params.rid}`}
                    ));
                }
                req.params.rid = `#${req.params.rid.replace(/^#/, '')}`;
                if (!_.isEmpty(req.query)) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError(
                        {message: 'Query parameters are allowed for this query type', params: req.query}
                    ));
                }
                try {
                    const result = await update(db, {
                        model,
                        changes: req.body,
                        where: {'@rid': req.params.rid, deletedAt: null},
                        user: req.user,
                        schema
                    });
                    return res.json({result: jc.decycle(result)});
                } catch (err) {
                    if (err instanceof AttributeError) {
                        return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                    } if (err instanceof NoRecordFoundError) {
                        return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                    } if (err instanceof RecordExistsError) {
                        return res.status(HTTP_STATUS.CONFLICT).json(err);
                    }
                    if (VERBOSE) {
                        console.error(err);
                    }
                    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            });
    }
    router.delete(`${route}/:rid`,
        async (req, res) => {
            if (!looksLikeRID(req.params.rid, false)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError(
                    {message: `ID does not look like a valid record ID: ${req.params.rid}`}
                ));
            }
            req.params.rid = `#${req.params.rid.replace(/^#/, '')}`;
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError(
                    {message: 'No query parameters are allowed for this query type'}
                ));
            }
            try {
                const result = await remove(
                    db, {
                        model, schema, where: {'@rid': req.params.rid, deletedAt: null}, user: req.user
                    }
                );
                return res.json({result: jc.decycle(result)});
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                }
                if (VERBOSE) {
                    console.error(err);
                }
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
};


module.exports = {
    validateParams, addResourceRoutes, InputValidationError, parseQueryLanguage, MAX_JUMPS
};
