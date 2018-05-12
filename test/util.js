'use strict';
const OrientDB  = require('orientjs');
const {createSchema, loadSchema} = require('./../app/repo/schema');
const {createUser} = require('./../app/repo/base');
const emptyConf = require('./config/empty');
const sampleConf = require('./config/sample');
const shell = require('shelljs');
// connect to the orientdb server
// connect to the db server

const setUpEmptyDB = async (conf=emptyConf) => {
    console.log(conf);
    const verbose = conf.verbose;
    // set up the database server
    const server = OrientDB({
        host: conf.server.host,
        HTTPport: conf.server.port,
        username: conf.server.user,
        password: conf.server.pass
    });
    const exists = await server.exists({name: conf.db.name});
    if (verbose) {
        console.log('db exists', exists, conf.db.name);
    }
    let db;
    if (exists) {
        if (verbose) {
            console.log('dropping the existing db');
        }
        await server.drop({name: conf.db.name});
    }
    if (verbose) {
        console.log('creating the db', conf.db.name);
    }
    db = await server.create({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
    await db.query('alter database custom standardElementConstraints=false');
    if (verbose) {
        console.log('create the schema');
    }
    await createSchema(db, verbose);
    const schema = await loadSchema(db, verbose);
    // create the admin user
    const user = await createUser(db, {model: schema.User, userName: 'admin', groupNames: ['admin']});
    if (verbose) {
        console.log('created the user:', user);
    }
    return {server, db, schema, admin: user[0]};
};


const tearDownEmptyDB = async (server) => {
    //await server.drop({name: emptyConf.db.name});
    await server.close();
};

const setUpSampleDB = async (verbose=false) => {
    // set up the database server
    const server = OrientDB({
        host: sampleConf.server.host,
        HTTPport: sampleConf.server.port,
        username: sampleConf.server.user,
        password: sampleConf.server.pass
    });
    const exists = await server.exists({name: sampleConf.db.name});
    if (verbose) {
        console.log('db exists. will drop', exists, sampleConf.db.name);
    }
    if (exists) {
        await server.drop({name: sampleConf.db.name});
    }
    let db;
    if (verbose) {
        console.log('creating the db', sampleConf.db.name);
    }
    db = await server.create({name: sampleConf.db.name, username: sampleConf.db.user, password: sampleConf.db.pass});
    await db.query('alter database custom standardElementConstraints=false');
    //await db.query(`import database ${sampleConf.db.export} -preserveClusterIDs=TRUE`);
    const command = `${process.env.ORIENTDB_HOME}/bin/console.sh "CONNECT remote:${process.env.ORIENTDB_HOME}/databases/test_sample admin admin; SELECT FROM V; import database ${sampleConf.db.export} -preserveClusterIDs=TRUE"`;
    if (verbose) {
        console.log('executing shell command');
        console.log(command);
    }
    const code = await shell.exec(command, {silent:true}).code;
    if (code !== 0) {
        throw new Error(`exit code ${code}, expected 0`);
    }
    const schema = await loadSchema(db, verbose);
    return {server, db, schema};
};


const tearDownSampleDB = async (server) => {
    //await server.drop({name: sampleConf.db.name});
    await server.close();
};

module.exports = {setUpEmptyDB, tearDownEmptyDB, setUpSampleDB, tearDownSampleDB};
