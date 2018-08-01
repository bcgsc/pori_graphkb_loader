const {addResourceRoutes} = require('./util');
const {addStatement} = require('./statement');


const addRoutes = (opt) => {
    const {router, schema, db} = opt;
    addResourceRoutes({
        router,
        model: schema.User,
        db,
        optQueryParams: ['name']
    });
    addStatement({router, schema, db});

    // simple routes
    for (const model of Object.values(schema)) {
        if (!model.expose) { // do not set up routes for abstract classes
            continue;
        }
        if (process.env.VERBOSE === '1') {
            console.log(`route: ${model.name} as ${model.routeName}`);
        }
        addResourceRoutes({
            router, model, db, schema
        });
    }
};

module.exports = addRoutes;
