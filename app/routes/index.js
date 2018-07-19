const jc = require('json-cycle');

const {addResourceRoutes} = require('./util');
const {addStatement} = require('./statement');



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
    addStatement({router, schema, db});

    // simple routes
    for (let model of Object.values(schema)) {
        if (! model.expose) {  // do not set up routes for abstract classes
            continue;
        }
        if (process.env.VERBOSE === '1') {
            console.log(`route: ${model.name} as ${model.routeName}`);
        }
        addResourceRoutes({router, model, db});
    }
};

module.exports = addRoutes;
