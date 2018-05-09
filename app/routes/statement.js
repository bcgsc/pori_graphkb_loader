const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');
const {errorToJSON, looksLikeRID} = require('./util');
const {AttributeError} = require('./../repo/error');
const {create} = require('./../repo/base');


const addStatement = (opt) => {
    const {router, schema, db} = opt;
    const model = schema.Statement;

    router.post('/statements',
        async (req, res) => {
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type', params: req.query});
                return;
            }
            // ensure the dependencies exist before attempting to create the statement
            if (! req.body.implies || req.body.implies.length === 0) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement requires an implies relationship', params: req.body});
                return;
            }

            if (! req.body.supportedby || req.body.supportedby.length === 0) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement requires an supportedby relationship', params: req.body});
                return;
            }
            let dependencies = _.concat(req.body.implies, req.body.supportedby);
            for (let dep of dependencies) {
                if (! looksLikeRID(dep)) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement dependency does not look like a valid record ID', value: dep});
                    return;
                }
            }

            try {
                // ensure that the dependency records are valid
                dependencies = await Promise.all(Array.from(dependencies, async (rid) => {
                    return await db.record.get(rid);
                }));
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                return;
            }
            const edges = [];
            for (let record of dependencies) {
                const rid = record['@rid'].toString();
                if (req.body.implies.includes(rid)) {
                    edges.push({model: schema.Implies, out: rid});
                }
                if (req.body.supportedby.includes(rid)) {
                    edges.push({model: schema.SupportedBy, in: rid});
                }
            }
            delete req.body.implies;
            delete req.body.supportedby;

            // create the main statement node
            let statement;
            try {
                statement = await create(db, {model: model, content: req.body, user: req.user});
            } catch (err) {
                if (err instanceof AttributeError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                    return;
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                    return;
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
                    return await create(db, {model: edge.model, content: {out: edge.out, in: edge.in}, user: req.user});
                }));
            } catch (err) {
                res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                return;
            }
            res.json(jc.decycle(statement));
        }
    );
};

module.exports = {addStatement};
