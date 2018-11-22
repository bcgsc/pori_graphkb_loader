/**
 * @module app/routes/util
 */
const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');

const {util: {looksLikeRID, castToRID}, error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');


const {
    NoRecordFoundError, RecordExistsError
} = require('./../repo/error');
const {logger} = require('./../repo/logging');
const {
    select, create, update, remove
} = require('./../repo/base');
const {checkClassPermissions} = require('./../middleware/auth');
const {
    Query
} = require('./../repo/query');

const {parse: parseQueryLanguage} = require('./query');


const activeRidQuery = (schema, model, rid) => {
    const query = Query.parse(schema, model, {
        where: [
            {attr: {attr: '@rid', cast: castToRID}, value: rid}
        ],
        activeOnly: true
    });
    console.log(query);
    query.validate();
    return query;
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
            let query;
            try {
                query = Query.parse(schema, model, parseQueryLanguage(req.query));
                query.validate();
                // console.log(query.where.comparisons[0]);
            } catch (err) {
                logger.log('debug', err);
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
            try {
                const result = await select(db, query, {user: req.user});
                return res.json(jc.decycle({result}));
            } catch (err) {
                logger.log('debug', err);
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
};

/**
 * Complex query endpoint for searching via POST
 *
 * @param {Object} opt
 * @param {orientjs.Db} opt.db the database connection
 * @param {express.Router} opt.router the router to ad the route to
 * @param {ClassModel} opt.model the model the route is being built for
 * @param {Object.<string,ClassModel>} opt.schema the mapping of class names to models
 *
 */
const searchRoute = (opt) => {
    const {
        router, model, db, schema
    } = opt;
    logger.log('verbose', `NEW ROUTE [SEARCH] ${model.routeName}/search`);

    router.post(`${model.routeName}/search`,
        async (req, res) => {
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: 'No query parameters are allowed for this query type', params: req.query}
                ));
            }
            let query;
            try {
                query = Query.parse(schema, model, req.body);
                query.validate();
            } catch (err) {
                logger.log('debug', err);
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
            try {
                const result = await select(db, query, {user: req.user});
                return res.json(jc.decycle({result}));
            } catch (err) {
                logger.log('debug', err);
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
            if (!looksLikeRID(req.params.rid, false)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: `rid does not look like a valid record ID: ${req.params.rid}`}
                ));
            }
            req.params.rid = `#${req.params.rid.replace(/^#/, '')}`;

            let query;
            try {
                query = parseQueryLanguage(req.query);
                query = Query.parse(schema, model, Object.assign(query, {
                    where: [{attr: {attr: '@rid', cast: castToRID}, value: req.params.rid}]
                }));
                query.validate();
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }

            try {
                const result = await select(db, query, {
                    exactlyN: 1,
                    user: req.user
                });
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
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: 'No query parameters are allowed for this query type', params: req.query}
                ));
            }
            try {
                const result = await create(db, {
                    model, content: req.body, user: req.user, schema
                });
                return res.status(HTTP_STATUS.CREATED).json(jc.decycle({result}));
            } catch (err) {
                logger.log('debug', err.toString());
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
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: `ID does not look like a valid record ID: ${req.params.rid}`}
                ));
            }
            req.params.rid = `#${req.params.rid.replace(/^#/, '')}`;
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: 'Query parameters are allowed for this query type', params: req.query}
                ));
            }
            try {
                const result = await update(db, {
                    model,
                    changes: req.body,
                    query: activeRidQuery(schema, model, req.params.rid),
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
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: `ID does not look like a valid record ID: ${req.params.rid}`}
                ));
            }
            req.params.rid = `#${req.params.rid.replace(/^#/, '')}`;
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: 'No query parameters are allowed for this query type'}
                ));
            }

            try {
                const query = activeRidQuery(schema, model, req.params.rid);
                const result = await remove(
                    db, {
                        query, user: req.user, model
                    }
                );
                return res.json(jc.decycle({result}));
            } catch (err) {
                logger.log('debug', err);
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
        searchRoute(opt);
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
    addResourceRoutes
};
