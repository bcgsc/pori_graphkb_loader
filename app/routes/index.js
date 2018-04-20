const _ = require('lodash');

const {addResourceRoutes, addResourceByIdRoutes} = require('./util');
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
    const users = {
        router: router,
        route: '/users',
        model: schema.User,
        db: db,
        optQueryParams: ['name']
    };
    addResourceRoutes(users);
    addResourceByIdRoutes(users);

    // vocabulary routes
    const vocabOpt = _.concat(schema.Vocabulary._required, schema.Vocabulary._optional);
    const vocab = {
        router: router,
        route: '/vocabulary',
        model: schema.Vocabulary, 
        db: db, 
        optQueryParams: vocabOpt,
        cacheUpdate: cacheVocabulary 
    };
    addResourceRoutes(vocab);
    addResourceByIdRoutes(vocab);

    // disease routes
    const disease = {
        router: router,
        route: '/diseases',
        model: schema.Disease,
        db: db,
        optQueryParams: _.concat(schema.Disease._required, schema.Disease._optional)
    }
    addResourceRoutes(disease);
    addResourceByIdRoutes(disease);
    // ontology routes
    // event routes
    // evidence routes
    // matching/statement routes
};

module.exports = addRoutes;
