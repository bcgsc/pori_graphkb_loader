

const OrientDB = require('orientjs');
const shell = require('shelljs');

const {createSchema, loadSchema} = require('./../app/repo/schema');
const {createUser} = require('./../app/repo/base');
const {VERBOSE} = require('./../app/repo/util');
const emptyConf = require('./config/empty');
const sampleConf = require('./config/sample');
// connect to the orientdb server
// connect to the db server

const setUpEmptyDB = async (conf = emptyConf) => {
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


const setUpSampleDB = async () => {
    // set up the database server
    const server = OrientDB({
        host: sampleConf.server.host,
        HTTPport: sampleConf.server.port,
        username: sampleConf.server.user,
        password: sampleConf.server.pass
    });
    const exists = await server.exists({name: sampleConf.db.name});
    if (VERBOSE) {
        console.log('db exists. will drop', exists, sampleConf.db.name);
    }
    if (exists) {
        await server.drop({name: sampleConf.db.name});
    }
    if (VERBOSE) {
        console.log('creating the db', sampleConf.db.name);
    }
    const db = await server.create({name: sampleConf.db.name, username: sampleConf.db.user, password: sampleConf.db.pass});
    await db.query('alter database custom standardElementConstraints=false');
    // await db.query(`import database ${sampleConf.db.export} -preserveClusterIDs=TRUE`);
    const command = `${process.env.ORIENTDB_HOME}/bin/console.sh "CONNECT remote:${process.env.ORIENTDB_HOME}/databases/test_sample admin admin; SELECT FROM V; import database ${sampleConf.db.export} -preserveClusterIDs=TRUE"`;
    if (VERBOSE) {
        console.log('executing shell command');
        console.log(command);
    }
    const code = await shell.exec(command, {silent: true}).code;
    if (code !== 0) {
        throw new Error(`exit code ${code}, expected 0`);
    }
    const schema = await loadSchema(db);
    return {server, db, schema};
};


const tearDownSampleDB = async (server) => {
    // await server.drop({name: sampleConf.db.name});
    await server.close();
};

module.exports = {setUpEmptyDB, setUpSampleDB, tearDownSampleDB};
