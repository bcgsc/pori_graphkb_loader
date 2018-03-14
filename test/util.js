'use strict';
const OrientDB  = require('orientjs');
const {createSchema, loadSchema} = require('./../app/repo/schema');
const {PERMISSIONS} = require('./../app/repo/constants');
const emptyConf = require('./config/empty');
const sampleConf = require('./config/sample');
const shell = require('shelljs');
// connect to the orientdb server
// connect to the db server

const setUpEmptyDB = async (verbose=false) => {
    // set up the database server
    const server = OrientDB({
        host: emptyConf.server.host,
        HTTPport: emptyConf.server.port,
        username: emptyConf.server.user,
        password: emptyConf.server.pass
    });
    const exists = await server.exists({name: emptyConf.db.name});
    if (verbose) {
        console.log('db exists', exists, emptyConf.db.name);
    }
    let db;
    if (exists) {
        if (verbose) {
            console.log('dropping the existing db');
        }
        await server.drop({name: emptyConf.db.name});
    }
    if (verbose) {
        console.log('creating the db', emptyConf.db.name);
    }
    db = await server.create({name: emptyConf.db.name, username: emptyConf.db.user, password: emptyConf.db.pass});
    await db.query('alter database custom standardElementConstraints=false');
    if (verbose) {
        console.log('create the schema');
    }
    await createSchema(db, verbose);
    // create the admin user
    const user = await db.insert().into('User').set({name: 'admin', permissions: {'V': PERMISSIONS.ALL, 'E': PERMISSIONS.ALL, 'User': PERMISSIONS.ALL}}).one();
    if (verbose) {
        console.log('created the user:', user);
    }
    const schema = await loadSchema(db, verbose);
    return {server, db, schema};
};


const tearDownEmptyDB = async (server) => {
    //await server.drop({name: emptyConf.db.name});
    await server.close();
}

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
        console.log('db exists', exists, sampleConf.db.name);
    }
    let db;
    if (exists) {
        if (verbose) {
            console.log('dropping the existing db');
        }
        await server.drop({name: sampleConf.db.name});
    }
    if (verbose) {
        console.log('creating the db', sampleConf.db.name);
    }
    db = await server.create({name: sampleConf.db.name, username: sampleConf.db.user, password: sampleConf.db.pass});
    await db.query('alter database custom standardElementConstraints=false');
    //await db.query(`import database ${sampleConf.db.export} -preserveClusterIDs=TRUE`);
    const code = await shell.exec('$ORIENTDB_HOME/bin/console.sh "CONNECT remote:/home/creisle/applications/orientdb-community-2.2.17/databases/test_sample admin admin; SELECT FROM V; import database /home/creisle/git/knowledgebase/test/config/../data/sample_db.gz -preserveClusterIDs=TRUE"', {silent:true}).code;
    if (code !== 0) {
        throw new Error(`exit code ${code}, expected 0`);
    }
    const schema = await loadSchema(db, verbose);
    return {server, db, schema};
};


const tearDownSampleDB = async (server) => {
    //await server.drop({name: sampleConf.db.name});
    await server.close();
}

module.exports = {setUpEmptyDB, tearDownEmptyDB, setUpSampleDB, tearDownSampleDB};
