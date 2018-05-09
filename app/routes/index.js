const {addResourceRoutes} = require('./util');
const {cacheVocabulary} = require('./../repo/base');
const {addStatement} = require('./statement');
const {addVariantRoutes} = require('./variant');
const {addParserRoutes} = require('./parser');


const addRoutes = (opt) => {
    const {router, schema, db} = opt;
    // main route (useful to be able to ping)
    router.route('/')
        .get((req, res) => {
            res.send('welcome to the knowledgebase api');
        });
    // returns a json representing the current schema
    router.route('/schema')
        .get((req, res) => {
            res.json(schema);
        });
    addResourceRoutes({
        router: router,
        model: schema.User,
        db: db,
        optQueryParams: ['name']
    });

    // vocabulary routes
    addResourceRoutes({
        router: router,
        route: '/vocabulary',
        model: schema.Vocabulary,
        db: db,
        cacheUpdate: cacheVocabulary
    });

    // disease routes
    addResourceRoutes({
        router: router,
        model: schema.Disease,
        db: db
    });

    addResourceRoutes({
        router: router,
        model: schema.AnatomicalEntity,
        db: db
    });

    addResourceRoutes({
        router: router,
        model: schema.IndependantFeature,
        db: db
    });

    addResourceRoutes({
        router: router,
        model: schema.AliasOf,
        db: db,
        optQueryParams: ['to', 'from']
    });

    addResourceRoutes({
        router: router,
        model: schema.DeprecatedBy,
        db: db,
        optQueryParams: ['to', 'from']
    });

    addResourceRoutes({
        router: router,
        model: schema.SubClassOf,
        db: db,
        optQueryParams: ['to', 'from']
    });

    addResourceRoutes({
        router: router,
        model: schema.Publication,
        db: db
    });

    addResourceRoutes({
        router: router,
        model: schema.CategoryVariant,
        db: db
    });

    addResourceRoutes({
        router: router,
        model: schema.PositionalVariant,
        db: db
    });

    addStatement({
        router: router,
        schema: schema,
        db: db
    });

    addVariantRoutes({
        router: router,
        schema: schema,
        db: db
    });

    addParserRoutes(router);
};

module.exports = addRoutes;
