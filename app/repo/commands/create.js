const _ = require('lodash');

const {util: {castToRID}, error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');

const {logger} = require('../logging');
const {
    Query, Comparison, Clause, Traversal, constants: {TRAVERSAL_TYPE, OPERATORS}
} = require('../query');
const {SCHEMA_DEFN} = require('../schema');
const {
    RecordExistsError
} = require('../error');
const {select, getUserByName} = require('./select');
const {wrapIfTypeError, omitDBAttributes} = require('./util');

/**
 * Create new User record
 *
 * @param {orientjs.Db} db the orientjs database connection
 * @param {Object} opt options
 * @param {string} opt.userName the name of the new user
 * @param {Array.<string>} opt.groupNames the list of group names for which to add the new user to
 */
const createUser = async (db, opt) => {
    const {
        userName, groupNames
    } = opt;
    const userGroups = await db.select().from('UserGroup').all();
    const groupIds = Array.from(userGroups.filter(
        group => groupNames.includes(group.name)
    ), group => group['@rid']);
    const record = SCHEMA_DEFN.User.formatRecord({
        name: userName,
        groups: groupIds
    }, {dropExtra: false, addDefaults: true});
    await db.insert().into(SCHEMA_DEFN.User.name)
        .set(record)
        .one();
    try {
        return await getUserByName(db, userName);
    } catch (err) {
        logger.log('debug', err);
        throw wrapIfTypeError(err);
    }
};

/**
 * create new edge record in the database
 *
 * @param {orientjs.Db} db the orientjs database connection
 * @param {Object} opt options
 * @param {Object} opt.content the contents of the new record
 * @param {string} opt.content.out the @rid of the source node
 * @param {string} opt.content.in the @rid of the target node
 * @param {ClassModel} opt.model the model for the table/class to insert the new record into
 * @param {Object} opt.user the user creating the new record
 */
const createEdge = async (db, opt) => {
    const {content, model, user} = opt;
    content.createdBy = user['@rid'];
    const record = model.formatRecord(content, {dropExtra: false, addDefaults: true});
    const from = record.out;
    const to = record.in;
    delete record.out;
    delete record.in;
    try {
        return await db.create('EDGE', model.name).from(from).to(to).set(record)
            .one();
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};

/**
 * Create statement record and its linking required edges. The array of edge objects should be an
 * array of objects with a target property for the node connected to the statement and any other
 * properties to add to the new edge
 *
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt options
 * @param {Object} opt.content the content of the statement
 * @param {Array} opt.content.impliedBy conditions which imply the current statement
 * @param {Array} opt.content.supportedBy evidence used to support the statement
 * @param {ClassModel} opt.model the statement class model
 * @param {Object} opt.user the user record
 * @param {Object.<string,ClassModel>} opt.schema the object mapping class names to models for all db classes
 *
 * @example
 * > createStatement({record: {
 *      impliedBy: [{target: '#33:0', comment: 'some comment on the edge'}],
 *      supportedBy: [{target: '44:0'}],
 *      relevance: '#45:1',
 *      appliesTo: '#87:0'
 *  } ...})
 */
const createStatement = async (db, opt) => {
    const {
        content, model, schema, user
    } = opt;
    content.impliedBy = content.impliedBy || [];
    content.supportedBy = content.supportedBy || [];
    const query = new Query(model.name, new Clause('AND', []), {activeOnly: true});

    // Enusre the edge multiple plicity is as expected
    query.where.push(new Comparison(
        new Traversal({
            type: TRAVERSAL_TYPE.EDGE, edges: ['SupportedBy'], direction: 'out', child: 'size()'
        }),
        content.supportedBy.length
    ));
    query.where.push(new Comparison(
        new Traversal({
            type: TRAVERSAL_TYPE.EDGE, edges: ['ImpliedBy'], direction: 'out', child: 'size()'
        }),
        content.impliedBy.length
    ));

    let dependencies = [];
    // ensure the RIDs look valid for the support
    const edges = [];
    if (content.supportedBy.length === 0) {
        throw new AttributeError('statement must include an array property supportedBy with 1 or more elements');
    }
    if (content.impliedBy.length === 0) {
        throw new AttributeError('statement must include an array property impliedBy with 1 or more elements');
    }

    const suppTraversal = new Traversal({
        type: TRAVERSAL_TYPE.EDGE, edges: ['SupportedBy'], direction: 'out', child: 'inV()'
    });
    for (const edge of content.supportedBy) {
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
        query.where.push(new Comparison(suppTraversal, rid, OPERATORS.CONTAINS));
    }

    // ensure the RIDs look valid for the impliedBy
    const impTraversal = new Traversal({
        type: TRAVERSAL_TYPE.EDGE, edges: ['ImpliedBy'], direction: 'out', child: 'inV()'
    });
    for (const edge of content.impliedBy) {
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
        edges.push(Object.assign(edge, {'@class': 'ImpliedBy', in: rid}));
        query.where.push(new Comparison(impTraversal, rid, OPERATORS.CONTAINS));
    }

    if (content.appliesTo === undefined) {
        throw new AttributeError('statement must have the appliesTo property');
    }
    try {
        if (content.appliesTo !== null) {
            content.appliesTo = castToRID(content.appliesTo);
            dependencies.push(content.appliesTo);
        }
        query.where.push(new Comparison('appliesTo', content.appliesTo || null));
    } catch (err) {
        throw new AttributeError(
            `statement appliesTo record ID does not look like a valid record ID: ${content.appliesTo}`
        );
    }
    if (content.relevance === undefined) {
        throw new AttributeError('statement must have the relevance property');
    }
    try {
        content.relevance = castToRID(content.relevance);
        dependencies.push(content.relevance);
        query.where.push(new Comparison('relevance', content.relevance));
    } catch (err) {
        throw new AttributeError(
            `statement relevance record ID does not look like a valid record ID: ${content.relevance}`
        );
    }
    if (content.source) {
        content.source = castToRID(content.source);
        dependencies.push(content.source);
    }
    query.where.push(Comparison.parse(schema, schema.Statement, {attr: 'source', value: content.source || null}));
    query.where.push(Comparison.parse(schema, schema.Statement, {attr: 'sourceId', value: content.sourceId || null}));
    // check the DB to ensure all dependencies already exist (and are not deleted)
    try {
        // ensure that the dependency records are valid
        dependencies = Array.from(dependencies, rid => ({'@rid': rid, deletedAt: null}));
        dependencies = await db.record.get(dependencies);
    } catch (err) {
        throw new AttributeError({
            message: 'error in retrieving one or more of the dependencies',
            dependencies,
            suberror: err
        });
    }
    const userRID = castToRID(user);
    // try to select the statement to see if it exists
    const records = await select(db, query, {
        fetchPlan: '*:2'
    });
    if (records.length !== 0) {
        throw new RecordExistsError({
            current: records,
            message: 'Statement cannot be created. A similar statement already exists'
        });
    }
    // create the main statement node
    const commit = db
        .let('statement', tx => tx.create('VERTEX', model.name)
            .set(omitDBAttributes(model.formatRecord(
                Object.assign({createdBy: userRID}, _.omit(content, ['impliedBy', 'supportedBy'])),
                {addDefaults: true}
            ))));
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
            .set(omitDBAttributes(_.omit(eRecord, ['out', 'in'])))
            .from(eRecord.out)
            .to(eRecord.in));
    }
    commit
        .let('result', tx => tx.select().from('$statement'))
        .commit();
    logger.log('debug', commit.buildStatement());
    try {
        const result = await commit.return('$result').one();
        if (!result) {
            throw new Error('Failed to create the statement');
        }
        return result;
    } catch (err) {
        err.sql = commit.buildStatement();
        throw wrapIfTypeError(err);
    }
};


/**
 * create new record in the database
 *
 * @param {orientjs.Db} db the orientjs database connection
 * @param {Object} opt options
 * @param {Object} opt.content the contents of the new record
 * @param {ClassModel} opt.model the model for the table/class to insert the new record into
 * @param {Object} opt.user the user creating the new record
 * @param {Object.<string,ClassModel>} [schema] only required for creating statements
 */
const create = async (db, opt) => {
    const {
        content, model, user
    } = opt;
    if (model.isEdge) {
        return createEdge(db, opt);
    } if (model.name === 'Statement') {
        return createStatement(db, opt);
    }
    const record = model.formatRecord(
        Object.assign({}, content, {createdBy: user['@rid']}),
        {dropExtra: false, addDefaults: true},
    );
    try {
        return await db.insert().into(model.name).set(omitDBAttributes(record)).one();
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};


module.exports = {create, createUser};
