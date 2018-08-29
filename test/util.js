

const OrientDB = require('orientjs');
const shell = require('shelljs');

const {createSchema, loadSchema} = require('./../app/repo/schema');
const {createUser} = require('./../app/repo/base');
const {VERBOSE} = require('./../app/repo/util');
const emptyConf = require('./../config/config');
// connect to the orientdb server
// connect to the db server

const setUpEmptyDB = async (conf = emptyConf) => {
    if (VERBOSE) {
        console.log(`connecting to the database server:${conf.server.host}${conf.server.port}`);
    }
    // set up the database server
    const server = OrientDB({
        host: conf.server.host,
        HTTPport: conf.server.port,
        username: conf.server.user,
        password: conf.server.pass
    });
    const exists = await server.exists({name: conf.db.name});
    if (VERBOSE) {
        console.log('db exists', exists, conf.db.name);
    }
    if (exists) {
        if (VERBOSE) {
            console.log('dropping the existing db');
        }
        await server.drop({name: conf.db.name});
    }
    if (VERBOSE) {
        console.log('creating the db', conf.db.name);
    }
    const db = await server.create({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
    try {
        await db.query('alter database custom standardElementConstraints=false');
        if (VERBOSE) {
            console.log('create the schema');
        }
        await createSchema(db);
        const schema = await loadSchema(db);
        // create the admin user
        if (VERBOSE) {
            console.log('creating the admin user');
        }
        const [user] = (await createUser(db, {
            schema, model: schema.User, userName: 'admin', groupNames: ['admin']
        }));
        if (VERBOSE) {
            console.log('created the user:', user);
        }
        return {
            server, db, schema, admin: user
        };
    } catch (err) {
        // drop the new database
        await server.drop({name: conf.db.name});
        await server.close();
        throw err;
    }
};


module.exports = {setUpEmptyDB};
