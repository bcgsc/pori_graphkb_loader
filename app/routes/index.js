const _ = require('lodash');

const {addResourceRoutes} = require('./util');
const {cacheVocabulary} = require('./../repo/base');


const addRoutes = (opt) => {
    const {router, schema, db, verbose} = opt;
    // main route (useful to be able to ping)
    router.route('/')
        .get((req, res, next) => {
            res.send('welcome to the knowledgebase api');
        });
    // returns a json representing the current schema
    router.route('/schema')
        .get((req, res, next) => {
            res.json(schema);
        });
    addResourceRoutes({
        router: router,
        route: '/users',
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
        optQueryParams: _.concat(schema.Vocabulary._required, schema.Vocabulary._optional),
        cacheUpdate: cacheVocabulary 
    });

    // disease routes
    addResourceRoutes({
        router: router,
        route: '/diseases',
        model: schema.Disease,
        db: db,
        optQueryParams: _.concat(schema.Disease._required, schema.Disease._optional)
    });
    
    addResourceRoutes({
        router: router,
        route: '/features',
        model: schema.IndependantFeature,
        db: db,
        optQueryParams: _.concat(schema.IndependantFeature._required, schema.IndependantFeature._optional)
    });

    addResourceRoutes({
        router: router,
        route: '/aliasof',
        model: schema.AliasOf,
        db: db,
        optQueryParams: ['to', 'from']
    });
    // ontology routes
    // event routes
    // evidence routes
    // matching/statement routes
};

module.exports = addRoutes;
