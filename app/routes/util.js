const HTTP_STATUS = require('http-status-codes');
var uuidValidate = require('uuid-validate');
const jc = require('json-cycle');
const _ = require('lodash');

const {ErrorMixin, AttributeError, NoResultFoundError, MultipleResultsFoundError} = require('./../repo/error');
const {select, create, update, remove, QUERY_LIMIT} = require('./../repo/base');
const {getParameterPrefix} = require('./../repo/util');


class InputValidationError extends ErrorMixin {}
const RECORD_LIMIT = 1000;

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
    const verbose = opt.verbose === undefined ? true : false;
    let route = opt.route || `/${model.name.toLowerCase()}${model.isEdge ? '' : 's'}`;
    if (route.endsWith('ys')) {
        route = route.replace(/ys$/, 'ies');
    }
    if (verbose) {
        console.log(`addResourceRoutes: ${route}`);
    }

    router.get(route,
        async (req, res) => {
            const params = _.omit(req.query, ['limit', 'fuzzyMatch', 'ancestors', 'descendants']);
            const other = Object.assign({limit: QUERY_LIMIT}, _.omit(req.query, Object.keys(params)));
            try {
                validateParams({params: params, required: reqQueryParams, optional: optQueryParams});
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                return;
            }
            try {
                const result = await select(db, Object.assign(other, {model: model, where: params}));
                res.json(jc.decycle(result));
            } catch (err) {
                res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
    router.post(route,
        async (req, res) => {
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type', params: req.query});
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
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        }
    );
    router.delete(route,
        async (req, res) => {
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type'});
                return;
            }
            try {
                const result = await remove(db, {model: model, where: req.body.where, user: req.user});
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError || err instanceof NoResultFoundError || err instanceof MultipleResultsFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        }
    );

    // Add the id routes
    router.get(`${route}/:id`,
        async (req, res) => {
            if (! looksLikeRID(req.params.id, false)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: `ID does not look like a valid record ID: ${req.params.id}`});
                return;
            }
            req.params.id = `#${req.params.id.replace(/^#/, '')}`;
            try {
                validateParams({params: req.query, required: reqQueryParams, optional: optQueryParams});
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                return;
            }
            const where = Object.assign({}, req.query, {'@rid': req.params.id, deletedAt: 'null'});
            try {
                const result = await select(db, {model: model, where: where, exactlyN: 1});
                res.json(jc.decycle(result[0]));
            } catch (err) {
                if (err instanceof NoResultFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        });
    router.put(`${route}/:id`,
        async (req, res) => {
            if (! looksLikeRID(req.params.id, false)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: `ID does not look like a valid record ID: ${req.params.id}`});
                return;
            }
            req.params.id = `#${req.params.id.replace(/^#/, '')}`;
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type', params: req.query});
                return;
            }
            try {
                const result = await update(db, {
                    model: model,
                    content: req.body,
                    where: {'@rid': req.params.id, deletedAt: 'null'},
                    user: req.user
                });
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError || err instanceof NoResultFoundError || err instanceof MultipleResultsFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        }
    );
    router.delete(`${route}/:id`,
        async (req, res) => {
            if (! looksLikeRID(req.params.id, false)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: `ID does not look like a valid record ID: ${req.params.id}`});
                return;
            }
            req.params.id = `#${req.params.id.replace(/^#/, '')}`;
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type'});
                return;
            }
            try {
                const result = await remove(db, {model: model, where: {'@rid': req.params.id, deletedAt: 'null'}, user: req.user});
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError || err instanceof NoResultFoundError || err instanceof MultipleResultsFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
                }
            }
        }
    );
};


const errorToJSON = (err) => {
    const json = {message: err.message};
    for (let attr of Object.keys(err)) {
        json[attr] = err[attr];
    }
    return json;
};


/**
 *
 * @param {string} rid the putative @rid value
 * @param {boolean} [requireHash=true] if true the hash must be present
 * @returns {boolean} true if the string follows the expected format for an @rid, false otherwise
 *
 * @example
 * >>> looksLikeRID('#4:10');
 * true
 * @example
 * >>> looksLikeRID('4:0');
 * false
 * @example
 * >>> looksLikeRID('#4:10', false);
 * true
 * @example
 * >>> looksLikeRID('4:0', false);
 * true
 */
const looksLikeRID = (rid, requireHash=true) => {
    try {
        const pattern = requireHash ? /^#\d+:\d+$/ : /^#?\d+:\d+$/;
        if (pattern.exec(rid.trim())) {
            return true;
        }
    } catch (err) {}  // eslint-disable-line no-empty
    return false;
};


module.exports = {validateParams, addResourceRoutes, InputValidationError, errorToJSON, looksLikeRID};
