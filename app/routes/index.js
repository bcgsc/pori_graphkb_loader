const jc = require('json-cycle');

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
            res.json(jc.decycle(schema));
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

    // simple routes
    for (let cls of Object.keys(schema)) {
        if (schema[cls].isAbstract) {  // do not set up routes for abstract classes
            continue;
        }
        if (['User', 'UserGroup', 'V', 'E', 'Vocabulary', 'Statement', 'Permissions'].includes(cls)) {
            continue;
        }
        if (process.env.VERBOSE === '1') {
            console.log(`route: ${cls} as ${schema[cls].routeName}`);
        }
        addResourceRoutes({router: router, model: schema[cls], db: db});
    }
    console.log('stack', Array.from(router.stack, (layer) => { return layer.route; }));
    //addParserRoutes(router);
};

module.exports = addRoutes;
