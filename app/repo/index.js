const OrientDB = require('orientjs');

const {logger} = require('./logging');
const {loadSchema, createSchema} = require('./schema');
const {migrate} = require('./migrate');
const {createUser} = require('./commands');
const {RecordExistsError} = require('./error');


const connectDB = async ({
    GKB_DB_CREATE,
    GKB_DB_HOST,
    GKB_DB_MIGRATE,
    GKB_DB_NAME,
    GKB_DB_PASS,
    GKB_DB_PORT,
    GKB_DB_USER,
    GKB_DBS_PASS,
    GKB_DBS_USER,
    GKB_USER_CREATE
}) => {
    // set up the database server
    const server = OrientDB({
        host: GKB_DB_HOST,
        port: GKB_DB_PORT,
        username: GKB_DBS_USER,
        password: GKB_DBS_PASS
    });
    const exists = await server.exists({name: GKB_DB_NAME});
    logger.log('info', `The database ${GKB_DB_NAME} ${exists
        ? 'exists'
        : 'does not exist'}`);

    let db;
    if (GKB_DB_CREATE) {
        if (!exists) {
            // the db does not exist, create it
            try {
                logger.log('info', `creating the database: ${GKB_DB_NAME}`);
                db = await server.create({name: GKB_DB_NAME, username: GKB_DB_USER, password: GKB_DB_PASS});
            } catch (err) {
                server.close();
                throw err;
            }
            // now create the schema
            try {
                await createSchema(db);
            } catch (err) {
                // drop the newly created db
                await server.drop({name: GKB_DB_NAME});
                server.close();
                throw err;
            }
        } else {
            throw new Error(`Cannot create the database ${GKB_DB_NAME} it already exists`);
        }
    }

    if (!db) {
        logger.log('info', `connecting to the database (${GKB_DB_NAME}) as ${GKB_DB_USER}`);
        try {
            db = await server.use({name: GKB_DB_NAME, username: GKB_DB_USER, password: GKB_DB_PASS});
        } catch (err) {
            server.close();
            throw err;
        }
    }

    if (GKB_USER_CREATE && process.env.USER) {
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
        await migrate(db, {checkOnly: !GKB_DB_MIGRATE});
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
