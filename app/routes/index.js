const {addResourceRoutes} = require('./util');
const {addStatement} = require('./statement');


const addRoutes = (opt) => {
    const {router, schema, db} = opt;
    addStatement({router, schema, db});

    // simple routes
    for (const model of Object.values(schema)) {
        addResourceRoutes({
            router, model, db, schema
        });
    }
};

module.exports = addRoutes;
