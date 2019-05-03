

const uuidV4 = require('uuid/v4');

const {getUserByName} = require('../app/repo/commands');
const {connectDB} = require('../app/repo');

const setUpEmptyDB = async (conf) => {
    conf.GKB_DB_NAME = `test_${uuidV4()}`;
    conf.GKB_DB_CREATE = true;
    conf.GKB_USER_CREATE = true;

    const {server, db, schema} = await connectDB(conf);

    const user = await getUserByName(db, process.env.USER || 'admin');

    return {
        server, db, schema, admin: user, conf, dbName: conf.GKB_DB_NAME
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
