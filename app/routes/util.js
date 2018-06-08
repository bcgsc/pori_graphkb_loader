const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');

const {ErrorMixin, AttributeError, NoRecordFoundError,  RecordExistsError} = require('./../repo/error');
const {select, create, update, remove, QUERY_LIMIT, SPEICAL_QUERY_ARGS, Clause, Comparison} = require('./../repo/base');
const {getParameterPrefix, looksLikeRID, VERBOSE} = require('./../repo/util');

//const SPEICAL_QUERY_ARGS = new Set(['fuzzyMatch', 'ancestors', 'descendants', 'returnProperties', 'limit', 'skip']);
const MAX_JUMPS = 6;  // fetchplans beyond 6 are very slow

class InputValidationError extends ErrorMixin {}

/*
 * check that the parameters passed are expected
 */
const validateParams = async (opt) => {
    const required = opt.required || [];
    const optional = opt.optional || [];
    const allowNone = opt.allowNone !== undefined ? opt.allowNone : true;
    const params = [];

    for (let param of Array.from(opt.params) || []) {
        const {prefix} = getParameterPrefix(param);
        params.push(prefix ? prefix : param);
    }
    if (Object.keys(params).length == 0 && ! allowNone) {
        throw new InputValidationError('no parameters were specified');
    }
    // check that the required parameters are present
    for (let attr of required) {
        if (params.indexOf(attr) < 0) {
            throw new InputValidationError(`missing required parameter: ${attr}. Found ${params}`);
        }
    }
    // check that all parameters are expected
    for (let attr of params) {
        if (required.indexOf(attr) < 0 && optional.indexOf(attr) < 0) {
            throw new InputValidationError(`unexpected parameter: ${attr}`);
        }
    }
    return true;
};


const parseQueryLanguage = async (inputQuery) => {
    /**
     * parse any query parameters based on the expected operator syntax. The final result will be
     * an object of attribute names as keys and arrays (AND) or arrays (OR) or clauses {value,operator}
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

    for (let {name, valueList} in inputQuery) {
        if (name === 'fuzzyMatch' || name === 'limit' || name === 'skip' || name === 'neighbors') {
            if (isNaN(Number(valueList))) {
                throw new InputValidationError(`Expected ${name} to be a number, but found ${valueList}`);
            }
            valueList = Number(valueList);
            if ((name === 'fuzzyMatch' || name === 'neighbors') && (valueList < 0 || valueList > MAX_JUMPS)) {
                throw new InputValidationError(`${name} must be a number between 0 and ${MAX_JUMPS}`);
            }
            if ((name === 'skip' || name === 'limit') && (valueList < 1)) {
                throw new InputValidationError(`${name} must be a positive integer greater than zero`);
            }
            if (name == 'limit' && valueList > QUERY_LIMIT) {
                throw new InputValidationError(`${name} must be a value between 0 and ${QUERY_LIMIT}. Please use skip and limit to paginate larger queries`);
            }
            query[name] = valueList;
        } else if (name == 'descendants' || name == 'ancestors' || name == 'returnProperties') {
            if (typeof(valueList) !== 'string') {
                throw new InputValidationError(`Query parameter ${name} cannot be specified multiple times`);
            }
            query[name] = valueList === '' ? [] : valueList.split(',');  // empty string should give an empty list
        } else if (name === 'activeOnly') {
            valueList = valueList.trim().lower();
            if (['0', 'false', 'f'].includes(valueList)) {
                query.activeOnly = false;
            } else {
                query.activeOnly = true;
            }
        } else {
            if (typeof(valueList) === 'string') {
                valueList = [valueList];  // when a query parameter is given multiple times, express parses it as a list. Cast any non-lists to lists to make this consistent
            }
            const clauseList = [];
            for (let i in valueList) {
                const orList = new Clause('OR');
                for (let value of valueList[i].split('|')) {
                    let negate = false;
                    if (value.startswith('!')) {
                        negate = true;
                        value = value.slice(1);
                    }
                    let operator = '=';
                    if (value.startswith('~')) {
                        operator = '~';
                        value = valueList.slice(1);
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
    const {router, model, db, cacheUpdate} = opt;
    const optQueryParams = opt.optQueryParams || _.concat(model._optional, model._required);
    const reqQueryParams = opt.reqQueryParams || [];
    let route = opt.route || `/${model.name.toLowerCase()}${model.isEdge ? '' : 's'}`;
    if (route.endsWith('ys')) {
        route = route.replace(/ys$/, 'ies');
    }
    if (VERBOSE) {
        console.log(`addResourceRoutes: ${route}`);
    }

    router.get(route,
        async (req, res) => {
            try {
                req.query = parseQueryLanguage(req.query);
            } catch (err) {
                if (err instanceof InputValidationError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
                return;
            }
            try {
                validateParams({params: _.omit(req.query, SPEICAL_QUERY_ARGS), required: reqQueryParams, optional: optQueryParams});
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                return;
            }
            let fetchPlan = '*:1';
            if (req.query.neighbors !== undefined) {
                fetchPlan = `*${req.query.neighbors}`;
                delete req.query.neighbors;
            }
            try {
                const result = await select(db, {model: model, where: req.query, fetchPlan: fetchPlan});
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                    return;
                }
                if (VERBOSE) {
                    console.error(err);
                }
                res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
    router.post(route,
        async (req, res) => {
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError({message: 'No query parameters are allowed for this query type', params: req.query}));
                return;
            }
            try {
                const result = await create(db, {model: model, content: req.body, user: req.user});
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else if (err instanceof RecordExistsError) {
                    res.status(HTTP_STATUS.CONFLICT).json(err);
                } else {
                    if (VERBOSE) {
                        console.error(err);
                    }
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        }
    );

    // Add the id routes
    router.get(`${route}/:id`,
        async (req, res) => {
            let fetchPlan = '*:1';
            try {
                req.query = parseQueryLanguage(req.query);
            } catch (err) {
                if (err instanceof InputValidationError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
                return;
            }
            if (! looksLikeRID(req.params.id, false)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError({message: `ID does not look like a valid record ID: ${req.params.id}`}));
                return;
            }
            req.params.id = `#${req.params.id.replace(/^#/, '')}`;
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError({message: 'No query parameters are allowed for this query type', params: req.query}));
                return;
            }
            try {
                const result = await select(db, {model: model, where: {'@rid': req.params.id}, exactlyN: 1, fetchPlan: fetchPlan});
                res.json(jc.decycle(result[0]));
            } catch (err) {
                if (err instanceof NoRecordFoundError) {
                    res.status(HTTP_STATUS.NOT_FOUND).json(err);
                } else {
                    if (VERBOSE) {
                        console.error(err);
                    }
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        });
    router.patch(`${route}/:id`,
        async (req, res) => {
            if (! looksLikeRID(req.params.id, false)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError({message: `ID does not look like a valid record ID: ${req.params.id}`}));
                return;
            }
            req.params.id = `#${req.params.id.replace(/^#/, '')}`;
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError({message: 'No query parameters are allowed for this query type', params: req.query}));
                return;
            }
            try {
                const result = await update(db, {
                    model: model,
                    content: req.body,
                    where: {'@rid': req.params.id, deletedAt: null},
                    user: req.user
                });
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else if (err instanceof NoRecordFoundError) {
                    res.status(HTTP_STATUS.NOT_FOUND).json(err);
                } else if (err instanceof RecordExistsError) {
                    res.status(HTTP_STATUS.CONFLICT).json(err);
                } else {
                    if (VERBOSE) {
                        console.error(err);
                    }
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        }
    );
    router.delete(`${route}/:id`,
        async (req, res) => {
            if (! looksLikeRID(req.params.id, false)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError({message: `ID does not look like a valid record ID: ${req.params.id}`}));
                return;
            }
            req.params.id = `#${req.params.id.replace(/^#/, '')}`;
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(new InputValidationError({message: 'No query parameters are allowed for this query type'}));
                return;
            }
            try {
                const result = await remove(db, {model: model, where: {'@rid': req.params.id, deletedAt: null}, user: req.user});
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else if (err instanceof NoRecordFoundError) {
                    res.status(HTTP_STATUS.NOT_FOUND).json(err);
                } else {
                    if (VERBOSE) {
                        console.error(err);
                    }
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        }
    );
};


module.exports = {validateParams, addResourceRoutes, InputValidationError};
