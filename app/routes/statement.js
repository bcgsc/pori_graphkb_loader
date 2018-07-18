const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');
const {castToRID} = require('./../repo/util');
const {AttributeError} = require('./../repo/error');
const {create} = require('./../repo/base');


/**
 * Add the statement-based routes to the router
 */
const addStatement = (opt) => {
    const {router, schema, db} = opt;
    const model = schema.Statement;

    router.post('/statements',
        async (req, res) => {
            if (! _.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type', params: req.query});
            }
            // ensure the dependencies exist before attempting to create the statement
            if (! req.body.impliedBy || req.body.impliedBy.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement requires at minimum a single impliedBy relationship', params: req.body});
            }

            if (! req.body.supportedBy || req.body.supportedBy.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement requires at minimum a single supportedBy relationship', params: req.body});
            }
            let dependencies = [];
            // ensure the RIDs look valid for the support
            let edges = [];
            for (let edge of req.body.supportedBy) {
                if (edge.target === undefined) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'expected supportedBy edge object to have target attribute'});
                }
                let rid = edge.target;
                delete edge.target;
                try {
                    rid = castToRID(rid);
                } catch (err) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({message: `the supportedBy dependency does not look like a valid RID: ${rid}`});
                }
                dependencies.push(rid);
                edges.push(Object.assign(edge, {'@class': 'SupportedBy', in: rid}));
            }
            // ensure the RIDs look valid for the impliedBy
            for (let edge of req.body.impliedBy) {
                if (edge.target === undefined) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'expected impliedBy edge object to have target attribute'});
                }
                let rid = edge.target;
                delete edge.target;
                try {
                    rid = castToRID(rid);
                } catch (err) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({message: `the impliedBy dependency does not look like a valid RID: ${rid}`});
                }
                dependencies.push(rid);
                edges.push(Object.assign(edge, {'@class': 'Implies', out: rid}));
            }

            if (req.body.appliesTo === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement must have the appliesTo property'});
            }
            try {
                if (req.body.appliesTo !== null) {
                    req.body.appliesTo = castToRID(req.body.appliesTo);
                    dependencies.push(req.body.appliesTo);
                }
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: `statement appliesTo record ID does not look like a valid record ID: ${req.body.appliesTo}`});
            }
            if (req.body.relevance === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement must have the relevance property'});
            }
            try {
                req.body.relevance = castToRID(req.body.relevance);
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: `statement relevance record ID does not look like a valid record ID: ${req.body.relevance}`});
            }

            // check the DB to ensure all dependencies already exist
            dependencies.push(req.body.relevance);
            try {
                // ensure that the dependency records are valid
                dependencies = await Promise.all(Array.from(dependencies, async (rid) => {
                    return await db.record.get(rid);
                }));
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'error in retrieving one or more of the dependencies',
                    dependencies
                });
            }
            delete req.body.impliedBy;
            delete req.body.supportedBy;

            // create the main statement node
            let statement;
            try {
                statement = await create(db, {model: model, content: req.body, user: req.user});
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } else {
                    console.error(err)
                    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({message: err.message, type: typeof err});
                }
            }
            try {
                // link to the dependencies
                await Promise.all(Array.from(edges, async (edge) => {
                    if (edge.out === undefined) {
                        edge.out = statement['@rid'];
                    } else {
                        edge.in = statement['@rid'];
                    }
                    return await create(db, {model: schema[edge['@class']], content: _.omit(edge, '@class'), user: req.user});
                }));
            } catch (err) {
                console.error(err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({message: err.message, type: typeof err});
            }
            res.status(HTTP_STATUS.CREATED).json(jc.decycle({result: statement}));
        }
    );
};

module.exports = {addStatement};
