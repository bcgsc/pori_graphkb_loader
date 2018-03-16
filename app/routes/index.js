const jc = require('json-cycle');
const _ = require('lodash');
const HTTP_STATUS = require('http-status-codes');

const {add_resource_routes} = require('./util');
const auth = require('./../middleware/auth');


const add_routes = (opt) => {
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
    // create a token
    router.route('/token')
        .get((req, res, next) => {
            // validate user first
            const token = auth.generateToken({name: 'admin'})      
            res.send(token);
        });
    // get a particular user
    router.route('/user')
        .get(async (req, res, next) => {
            res.send({message: 'you passed auth'});
        });
    // vocabulary routes
    const vocabOpt = _.concat(schema.Vocabulary._required, schema.Vocabulary._optional);
    add_resource_routes({
        router: router,
        route: '/vocabulary',
        model: schema.Vocabulary, 
        db: db, 
        optQueryParams: vocabOpt
    });
    // ontology routes
    // event routes
    // evidence routes
    // matching/statement routes
};

module.exports = add_routes;
