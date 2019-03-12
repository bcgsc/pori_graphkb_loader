

const OrientDB = require('orientjs');

const {createSchema, loadSchema} = require('./../app/repo/schema');
const {createUser} = require('./../app/repo/commands');

const VERBOSE = process.env.VERBOSE === '1';
const emptyConf = require('./../config/config');
// connect to the orientdb server
// connect to the db server

const setUpEmptyDB = async (conf = emptyConf, createDB = true) => {
    if (VERBOSE) {
        console.log(`connecting to the database server:${conf.server.host}${conf.server.port}`);
    }
    // set up the database server
    const server = OrientDB({
        host: conf.server.host,
        port: conf.server.port,
        username: conf.server.user,
        password: conf.server.pass
    });
    const exists = await server.exists({name: conf.db.name});
    if (VERBOSE) {
        console.log('db exists', exists, conf.db.name);
    }
    let db,
        schema,
        user;
    if (createDB) {
        if (exists) {
            if (VERBOSE) {
                console.log('dropping the existing db');
            }
            await server.drop({name: conf.db.name});
        }
        if (VERBOSE) {
            console.log('creating the db', conf.db.name);
        }
        db = await server.create({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
        try {
            await db.query('alter database custom standardElementConstraints=false');
            if (VERBOSE) {
                console.log('create the schema');
            }
            await createSchema(db);
            schema = await loadSchema(db);
            // create the admin user
            if (VERBOSE) {
                console.log('creating the admin user');
            }
            user = (await createUser(db, {
                schema, model: schema.User, userName: 'admin', groupNames: ['admin']
            }));
            if (VERBOSE) {
                console.log('created the user:', user);
            }
        } catch (err) {
            // drop the new database
            await server.drop({name: conf.db.name});
            await server.close();
            throw err;
        }
    } else if (!exists) {
        throw new Error(`could not connect to database. Database ${conf.db.name} does not exist`);
    } else {
        db = await server.use({name: conf.db.name});
        schema = await loadSchema(db);
        const username = process.env.KB_USER || process.env.USER;
        [user] = await db.query('SELECT * FROM user WHERE name = :name', {params: {name: username}});
    }
    return {
        server, db, schema, admin: user
    };
};


const clearDB = async (db, admin) => {
    // clear all V/E records
    await db.query('delete edge e');
    await db.query('delete vertex v');
    await db.query(`delete from user where name != '${admin.name}'`);
    await db.query('delete from usergroup where name != \'readonly\' and name != \'admin\' and name != \'regular\'');
};


module.exports = {setUpEmptyDB, clearDB};
