const jc = require('json-cycle');

const {addResourceRoutes} = require('./util');
const {cacheVocabulary} = require('./../repo/base');



const printAllRoutes = (router) => {
    let count = 0;
    for (let layer of router.stack) {
        try {
            console.log(count, layer.route.path);
        } catch (err) {
            console.log(count, layer.handle);
        }
        count++;
    }
};


const addRoutes = (opt) => {
    const {router, schema, db} = opt;
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
    for (let model of Object.values(schema)) {
        if (model.isAbstract) {  // do not set up routes for abstract classes
            continue;
        }
        if (['User', 'V', 'E', 'Vocabulary', 'Statement', 'Permissions'].includes(model.name)) {
            continue;
        }
        if (process.env.VERBOSE === '1') {
            console.log(`route: ${model.name} as ${model.routeName}`);
        }
        addResourceRoutes({router, model, db});
    }
};

module.exports = addRoutes;
