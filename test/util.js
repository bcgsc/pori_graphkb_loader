

const uuidV4 = require('uuid/v4');

const {createUser} = require('../app/repo/commands');
const {connectDB} = require('../app/repo');

const VERBOSE = process.env.VERBOSE === '1';


const setUpEmptyDB = async (conf) => {
    if (VERBOSE) {
        console.log(`connecting to the database server:${conf.server.host}${conf.server.port}`);
    }
    conf.db.name = `test_${uuidV4()}`;
    conf.db.create = true;

    console.log('setUpEmptyDB', conf);

    const {server, db, schema} = await connectDB(conf);

    const user = await createUser(db, {
        schema, model: schema.User, userName: 'admin', groupNames: ['admin']
    });

    return {
        server, db, schema, admin: user, conf
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
