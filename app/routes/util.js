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
const {logger} = require('./../repo/logging');
const {
    select, create, update, remove, QUERY_LIMIT
} = require('./../repo/base');
const {
    Clause, Comparison
} = require('./../repo/query');
const {looksLikeRID} = require('./../repo/util');
const {INDEX_SEP_CHARS} = require('./../repo/schema');
const {checkClassPermissions} = require('./../middleware/auth');

const MAX_JUMPS = 4; // fetchplans beyond 6 are very slow
const INDEX_SEP_REGEX = new RegExp(`[${escapeStringRegexp(INDEX_SEP_CHARS)}]+`, 'g');
const MIN_WORD_SIZE = 4;

class InputValidationError extends ErrorMixin {}

/**
 * Parse the operators prefixed on the query parameters
 *
 * @param {Object} inputQuery
 */
const parseQueryLanguage = (inputQuery, defaultOperator = '=') => {
    const query = {};
    for (const [name, value] of Object.entries(inputQuery)) {
        query[name] = parseQueryComparison(name, value, defaultOperator);
    }
    return query;
};


/**
 * Convert the content of an invididual value into a set of comparisons, clauses, or
 * objects/subqueries
 *
 * @param {string} name the name of the query parameter
 * @param value
 * @param {string} [defaultOperator='='] the default operator to use in comparisons
 */
const parseQueryComparison = (name, value, defaultOperator = '=') => {
    if (['fuzzyMatch', 'limit', 'skip', 'neighbors', 'size'].includes(name)) {
        if (Number.isNaN(Number(value))) {
            throw new InputValidationError(`Expected ${name} to be a number, but found ${value}`);
        }
        value = Number(value);
        if (
            (name === 'fuzzyMatch' || name === 'neighbors')
            && (value < 0 || value > MAX_JUMPS)
        ) {
            throw new InputValidationError(`${name} must be a number between 0 and ${MAX_JUMPS}`);
        }
        if ((name === 'skip' || name === 'limit') && (value < 1)) {
            throw new InputValidationError(`${name} must be a positive integer greater than zero`);
        }
        if (name === 'limit' && value > QUERY_LIMIT) {
            throw new InputValidationError(`${name} must be a number between 1 and ${QUERY_LIMIT}. Please use skip and limit to paginate larger queries`);
        }
        if (name === 'size' && value < 0) {
            throw new InputValidationError(`${name} must be a positive integer`);
        }
        return value;
    } if (['descendants', 'ancestors', 'returnProperties', 'or'].includes(name)) {
        if (typeof (value) !== 'string') {
            throw new InputValidationError(`Query parameter ${name} cannot be specified multiple times`);
        }
        return value.split(',').filter(x => x.length > 0); // empty string should give an empty list
    } if (name === 'activeOnly') {
        value = value.trim().toLowerCase();
        return !['0', 'false', 'f'].includes(value);
    } if (name === 'direction') {
        value = value.toString().toLowerCase().trim();
        if (value === 'out' || value === 'in') {
            return value;
        }
        throw new InputValidationError(`direction must be 'out' or 'in' but found: ${value}`);
    // } if (name === 'v') {
    //    return parseQueryLanguage(value);
    } if (value instanceof Array) {
        return new Clause('AND', Array.from(value, v => new Comparison(v)));
    } if (value !== null && typeof value === 'object') {
        // subqueries
        value = parseQueryLanguage(value, name === 'v'
            ? 'CONTAINS'
            : '=');
        return value;
    }
    const orList = new Clause('OR');
    for (let subValue of value.split('|')) {
        let negate = false;
        if (subValue.startsWith('!')) {
            negate = true;
            subValue = value.slice(1);
        }
        let operator = defaultOperator;
        if (subValue.startsWith('~')) {
            operator = 'CONTAINSTEXT';
            subValue = subValue.slice(1);
            if (INDEX_SEP_REGEX.exec(subValue)) {
                INDEX_SEP_REGEX.lastIndex = 0; // https://siderite.blogspot.com/2011/11/careful-when-reusing-javascript-regexp.html
                // contains a separator char, should split into AND clause
                const andClause = new Clause('AND', Array.from(
                    subValue.split(INDEX_SEP_REGEX), word => new Comparison(word, operator, negate)
                ));
                if (andClause.comparisons.some(comp => comp.value.length < MIN_WORD_SIZE)) {
                    throw new InputValidationError(`Word is too short to query with ~ operator. Must be at least ${MIN_WORD_SIZE} letters after splitting on separator characters: ${INDEX_SEP_CHARS}`);
                }
                orList.push(andClause);
                continue;
            } else if (subValue.length < MIN_WORD_SIZE) {
                throw new InputValidationError(`Word is too short to query with ~ operator. Must be at least ${MIN_WORD_SIZE} letters`);
            }
        }
        if (subValue === 'null') {
            subValue = null;
        }
        orList.push(new Comparison(subValue, operator, negate));
    }
    return orList.length === 1
        ? orList.comparisons[0]
        : orList;
};


/**
 * Query a record class
 *
 * @param {Object} opt
 * @param {orientjs.Db} opt.db the database connection
 * @param {express.Router} opt.router the router to ad the route to
 * @param {ClassModel} opt.model the model the route is being built for
 * @param {Object.<string,ClassModel>} opt.schema the mapping of class names to models
 *
 */
const queryRoute = (opt) => {
    const {
        router, model, db, schema
    } = opt;
    logger.log('verbose', `NEW ROUTE [QUERY] ${model.routeName}`);

    router.get(model.routeName,
        async (req, res) => {
            try {
                req.query = parseQueryLanguage(req.query);
            } catch (err) {
                if (err instanceof InputValidationError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
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
                return res.json(jc.decycle({result}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
};

/**
 * Get a record by RID
 *
 * @param {Object} opt
 * @param {orientjs.Db} opt.db the database connection
 * @param {express.Router} opt.router the router to ad the route to
 * @param {ClassModel} opt.model the model the route is being built for
 * @param {Object.<string,ClassModel>} opt.schema the mapping of class names to models
 */
const getRoute = (opt) => {
    const {
        router, schema, db, model
    } = opt;
    logger.log('verbose', `NEW ROUTE [GET] ${model.routeName}`);
    router.get(`${model.routeName}/:rid`,
        async (req, res) => {
            try {
                req.query = parseQueryLanguage(req.query);
            } catch (err) {
                if (err instanceof InputValidationError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                logger.log('error', err);
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
                const result = await select(db, Object.assign(req.query, {
                    model,
                    where: {'@rid': req.params.rid},
                    exactlyN: 1,
                    fetchPlan,
                    user: req.user,
                    schema
                }));
                return res.json(jc.decycle({result: result[0]}));
            } catch (err) {
                if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
};

/**
 * POST route to create new records
 *
 * @param {Object} opt
 * @param {orientjs.Db} opt.db the database connection
 * @param {express.Router} opt.router the router to ad the route to
 * @param {ClassModel} opt.model the model the route is being built for
 * @param {Object.<string,ClassModel>} opt.schema the mapping of class names to models
 */
const postRoute = (opt) => {
    const {
        router, db, model, schema
    } = opt;
    logger.log('verbose', `NEW ROUTE [POST] ${model.routeName}`);
    router.post(model.routeName,
        async (req, res) => {
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError(
                    {message: 'No query parameters are allowed for this query type', params: req.query}
                ));
            }
            try {
                const result = await create(db, {
                    model, content: req.body, user: req.user, schema
                });
                return res.status(HTTP_STATUS.CREATED).json(jc.decycle({result}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } if (err instanceof RecordExistsError) {
                    return res.status(HTTP_STATUS.CONFLICT).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
};


/**
 * Route to update a record given its RID
 *
 * @param {Object} opt
 * @param {orientjs.Db} opt.db the database connection
 * @param {express.Router} opt.router the router to ad the route to
 * @param {ClassModel} opt.model the model the route is being built for
 * @param {Object.<string,ClassModel>} opt.schema the mapping of class names to models
 */
const updateRoute = (opt) => {
    const {
        router, schema, db, model
    } = opt;
    logger.log('verbose', `NEW ROUTE [UPDATE] ${model.routeName}`);

    router.patch(`${model.routeName}/:rid`,
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
                return res.json(jc.decycle({result}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                } if (err instanceof RecordExistsError) {
                    return res.status(HTTP_STATUS.CONFLICT).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
};

/**
 * Route to delete/remove a resource
 *
 * @param {Object} opt
 * @param {orientjs.Db} opt.db the database connection
 * @param {express.Router} opt.router the router to ad the route to
 * @param {ClassModel} opt.model the model the route is being built for
 * @param {Object.<string,ClassModel>} opt.schema the mapping of class names to models
 */
const deleteRoute = (opt) => {
    const {
        router, schema, db, model
    } = opt;
    logger.log('verbose', `NEW ROUTE [DELETE] ${model.routeName}`);
    router.delete(`${model.routeName}/:rid`,
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
                return res.json(jc.decycle({result}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
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
        router, model
    } = opt;

    // attach the db model required for checking class permissions
    router.use(model.routeName, (req, res, next) => {
        req.model = model;
        next();
    });
    router.use(model.routeName, checkClassPermissions);

    if (model.expose.QUERY) {
        queryRoute(opt);
    }
    if (model.expose.GET) {
        getRoute(opt);
    }
    if (model.expose.POST) {
        postRoute(opt);
    }
    if (model.expose.DELETE) {
        deleteRoute(opt);
    }
    if (model.expose.PATCH) {
        updateRoute(opt);
    }
};


module.exports = {
    addResourceRoutes, InputValidationError, parseQueryLanguage, MAX_JUMPS
};
