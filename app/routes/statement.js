const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');

const {castToRID} = require('./../repo/util');
const {AttributeError} = require('./../repo/error');
const {wrapIfTypeError} = require('./../repo/base');

/**
 * Create statement record and its linking required edges. The array of edge objects should be an
 * array of objects with a target property for the node connected to the statement and any other
 * properties to add to the new edge
 *
 * @param {object} opt.record the content of the statement
 * @param {Array} opt.record.impliedBy conditions which imply the current statement
 * @param {Array} opt.record.supportedBy evidence used to support the statement
 * @param {ClassModel} opt.model the statement class model
 * @param {object} opt.user the user record
 * @param {object} opt.schema the object mapping class names to models for all db classes
 * @param {object} opt.db the database connection object
 *
 * @example
 * > createStatement({record: {
 *      impliedBy: [{target: '#33:0', comment: 'some comment on the edge'}],
 *      supportedBy: [{target: '44:0'}],
 *      relevance: '#45:1',
 *      appliesTo: '#87:0'
 *  } ...})
 */
const createStatement = async (opt) => {
    const {
        record, model, schema, user, db
    } = opt;
    let dependencies = [];
    // ensure the RIDs look valid for the support
    const edges = [];
    for (const edge of record.supportedBy) {
        if (edge.target === undefined) {
            throw new AttributeError('expected supportedBy edge object to have target attribute');
        }
        let rid = edge.target;
        delete edge.target;
        try {
            rid = castToRID(rid);
        } catch (err) {
            throw new AttributeError(`the supportedBy dependency does not look like a valid RID: ${rid}`);
        }
        dependencies.push(rid);
        edges.push(Object.assign(edge, {'@class': 'SupportedBy', in: rid}));
    }
    // ensure the RIDs look valid for the impliedBy
    for (const edge of record.impliedBy) {
        if (edge.target === undefined) {
            throw new AttributeError('expected impliedBy edge object to have target attribute');
        }
        let rid = edge.target;
        delete edge.target;
        try {
            rid = castToRID(rid);
        } catch (err) {
            throw new AttributeError(`the impliedBy dependency does not look like a valid RID: ${rid}`);
        }
        dependencies.push(rid);
        edges.push(Object.assign(edge, {'@class': 'Implies', out: rid}));
    }

    if (record.appliesTo === undefined) {
        throw new AttributeError('statement must have the appliesTo property');
    }
    try {
        if (record.appliesTo !== null) {
            record.appliesTo = castToRID(record.appliesTo);
            dependencies.push(record.appliesTo);
        }
    } catch (err) {
        throw new AttributeError(`statement appliesTo record ID does not look like a valid record ID: ${record.appliesTo}`);
    }
    if (record.relevance === undefined) {
        throw new AttributeError('statement must have the relevance property');
    }
    try {
        record.relevance = castToRID(record.relevance);
    } catch (err) {
        throw new AttributeError(`statement relevance record ID does not look like a valid record ID: ${record.relevance}`);
    }

    // check the DB to ensure all dependencies already exist
    dependencies.push(record.relevance);
    try {
        // ensure that the dependency records are valid
        dependencies = await Promise.all(Array.from(dependencies, async rid => db.record.get(rid)));
    } catch (err) {
        throw new AttributeError({
            message: 'error in retrieving one or more of the dependencies',
            dependencies
        });
    }
    delete record.impliedBy;
    delete record.supportedBy;
    const userRID = castToRID(user);
    // create the main statement node
    const commit = db
        .let('statement', tx => tx.create('VERTEX', model.name)
            .set(model.formatRecord(Object.assign({
                createdBy: userRID
            }, record), {addDefaults: true})));
    // link to the dependencies
    let edgeCount = 0;
    for (const edge of edges) {
        const eModel = schema[edge['@class']];
        const eRecord = eModel.formatRecord(Object.assign({
            createdBy: userRID
        }, edge), {dropExtra: true, addDefaults: true});
        if (edge.out === undefined) {
            eRecord.out = '$statement';
        } else {
            eRecord.in = '$statement';
        }
        commit.let(`edge${edgeCount++}`, tx => tx.create('EDGE', eModel.name)
            .set(_.omit(eRecord, ['out', 'in', '@class']))
            .from(eRecord.out)
            .to(eRecord.in));
    }
    commit
        .let('result', tx => tx.select().from('$statement'))
        .commit();
    try {
        const result = await commit.return('$result').one();
        if (!result) {
            console.error(commit.buildStatement());
            throw new Error('Failed to create the statement');
        }
        return result;
    } catch (err) {
        err.sql = commit.buildStatement();
        throw wrapIfTypeError(err);
    }
};

/**
 * Add the statement-based routes to the router
 */
const addStatement = (opt) => {
    const {router, schema, db} = opt;
    const model = schema.Statement;

    router.post(model.routeName,
        async (req, res) => {
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type', params: req.query});
            }
            // ensure the dependencies exist before attempting to create the statement
            if (!req.body.impliedBy || req.body.impliedBy.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement requires at minimum a single impliedBy relationship', params: req.body});
            }

            if (!req.body.supportedBy || req.body.supportedBy.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'statement requires at minimum a single supportedBy relationship', params: req.body});
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
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({message: err.message, type: typeof err});
            }
            return res.status(HTTP_STATUS.CREATED).json(jc.decycle({result: statement}));
        });
};

module.exports = {addStatement, createStatement};
