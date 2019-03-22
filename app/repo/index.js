const OrientDB = require('orientjs');

const {logger} = require('./logging');
const {loadSchema, createSchema} = require('./schema');
const {migrate} = require('./migrate');
const {createUser} = require('./commands');
const {RecordExistsError} = require('./error');


const connectDB = async (conf) => {
    // set up the database server
    const server = OrientDB({
        host: conf.server.host,
        port: conf.server.port,
        username: conf.server.user,
        password: conf.server.pass
    });
    const exists = await server.exists({name: conf.db.name});
    logger.log('info', `The database ${conf.db.name} ${exists
        ? 'exists'
        : 'does not exist'}`);

    let db;
    if (conf.db.create) {
        if (!exists) {
            // the db does not exist, create it
            try {
                logger.log('info', `creating the database: ${conf.db.name}`);
                db = await server.create({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
            } catch (err) {
                server.close();
                throw err;
            }
            // now create the schema
            try {
                await createSchema(db);
            } catch (err) {
                // drop the newly created db
                await server.drop({name: conf.db.name});
                server.close();
                throw err;
            }
        } else {
            throw new Error(`Cannot create the database ${conf.db.name} it already exists`);
        }
    }

    if (!db) {
        logger.log('info', `connecting to the database (${conf.db.name}) as ${conf.db.user}`);
        try {
            db = await server.use({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
        } catch (err) {
            server.close();
            throw err;
        }
    }

    if (conf.createUser && process.env.USER) {
        try {
            logger.log('info', `create the current user (${process.env.USER}) as admin`);
            await createUser(db, {
                userName: process.env.USER,
                groupNames: ['admin'],
                existsOk: true
            });
        } catch (err) {
            if (!(err instanceof RecordExistsError)) {
                logger.log('error', `Error in creating the current user ${err}`);
            }
        }
    }

    // check if migration is required
    try {
        await migrate(db, {checkOnly: !conf.db.migrate});
    } catch (err) {
        logger.error(err);
        server.close();
        throw err;
    }

    let schema;
    try {
        schema = await loadSchema(db);
    } catch (err) {
        db.close();
        throw err;
    }
    // create the admin user
    return {server, db, schema};
};


module.exports = {connectDB};
