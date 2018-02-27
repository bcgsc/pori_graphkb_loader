'use strict';
const data = require('./../../app/repo/cached/data');
const {expect} = require('chai');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, Record, History, KBRole, KBUser} = require('./../../app/repo/base');
const {Statement, AppliesTo, AsComparedTo, Requires, STATEMENT_TYPE} = require('./../../app/repo/statement');
const {PERMISSIONS} = require('./../../app/repo/constants');
const conf = require('./../config/empty');


const setUpEmptyDB = async () => {
    const server = await connectServer(conf.server);
    const exists = await server.exists({name: conf.db.name});
    if (exists) {
        await server.drop({name: conf.db.name});
    }
    const db = await createDB({
        name: conf.db.name, 
        user: conf.db.user, 
        pass: conf.db.pass, 
        server: server,
        heirarchy: [
            [KBRole, History],
            [KBUser],
            [KBVertex, KBEdge]
        ]
    });
    await db.models.KBRole.createRecord({name: 'admin', rules: {'kbvertex': PERMISSIONS.ALL, 'kbedge': PERMISSIONS.ALL}});
    const user = await db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
    return Promise.resolve({server, db, user})
};


const tearDownEmptyDB = async (server) => {
    await server.drop({name: conf.db.name});
    await server.close();
}





module.exports = {setUpEmptyDB, tearDownEmptyDB};
