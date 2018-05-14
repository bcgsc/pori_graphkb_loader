const jc = require('json-cycle');

const {addResourceRoutes} = require('./util');
const {cacheVocabulary} = require('./../repo/base');
const {addStatement} = require('./statement');
const {addVariantRoutes} = require('./variant');
const {addParserRoutes} = require('./parser');


const addRoutes = (opt) => {
    const {router, schema, db, verbose} = opt;
    // main route (useful to be able to ping)
    router.route('/')
        .get((req, res) => {
            res.send('welcome to the knowledgebase api');
        });
    // returns a json representing the current schema
    router.route('/schema')
        .get((req, res) => {
            res.json(jc.decycle(schema));
        });
    addResourceRoutes({
        router: router,
        model: schema.User,
        db: db,
        optQueryParams: ['name'],
        verbose: verbose
    });

    // vocabulary routes
    addResourceRoutes({
        router: router,
        route: '/vocabulary',
        model: schema.Vocabulary,
        db: db,
        cacheUpdate: cacheVocabulary,
        verbose: verbose
    });

    // disease routes
    addResourceRoutes({
        router: router,
        model: schema.Disease,
        db: db,
        verbose: verbose
    });

    addResourceRoutes({
        router: router,
        model: schema.AnatomicalEntity,
        db: db,
        verbose: verbose
    });

    addResourceRoutes({
        router: router,
        model: schema.IndependantFeature,
        db: db,
        verbose: verbose
    });

    addResourceRoutes({
        router: router,
        model: schema.AliasOf,
        db: db,
        optQueryParams: ['to', 'from'],
        verbose: verbose
    });

    addResourceRoutes({
        router: router,
        model: schema.DeprecatedBy,
        db: db,
        optQueryParams: ['to', 'from'],
        verbose: verbose
    });

    addResourceRoutes({
        router: router,
        model: schema.SubClassOf,
        db: db,
        optQueryParams: ['to', 'from'],
        verbose: verbose
    });

    addResourceRoutes({
        router: router,
        model: schema.Publication,
        db: db,
        verbose: verbose
    });

    addResourceRoutes({
        router: router,
        model: schema.CategoryVariant,
        db: db,
        verbose: verbose
    });

    addResourceRoutes({
        router: router,
        model: schema.PositionalVariant,
        db: db,
        verbose: verbose
    });

    addStatement({
        router: router,
        schema: schema,
        db: db,
        verbose: verbose
    });

    addVariantRoutes({
        router: router,
        schema: schema,
        db: db,
        verbose: verbose
    });

    addParserRoutes(router);
};

module.exports = addRoutes;
