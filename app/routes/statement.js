const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');

const {AttributeError} = require('./../repo/error');
const {createStatement} = require('./../repo/base');


/**
 * Add the statement-based routes to the router
 */
const addStatement = (opt) => {
    const {router, schema, db} = opt;
    const model = schema.Statement;

    router.post(model.routeName,
        async (req, res) => {
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'No query parameters are allowed for this query type',
                    params: req.query
                });
            }
            // ensure the dependencies exist before attempting to create the statement
            if (!req.body.impliedBy || req.body.impliedBy.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'statement requires at minimum a single impliedBy relationship',
                    params: req.body
                });
            }

            if (!req.body.supportedBy || req.body.supportedBy.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'statement requires at minimum a single supportedBy relationship',
                    params: req.body
                });
            }
            let statement;
            try {
                statement = await createStatement({
                    model, schema, db, record: req.body, user: req.user
                });
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                console.error(err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                    message:
                    err.message,
                    type: typeof err
                });
            }
            return res.status(HTTP_STATUS.CREATED).json(jc.decycle({result: statement}));
        });
};

module.exports = {addStatement, createStatement};
