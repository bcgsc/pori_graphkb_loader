'use strict';
const {expect} = require('chai');

const {create, update, remove, select} = require('./../app/repo/base');
const {PERMISSIONS} = require('./../app/repo/constants');

const {setUpSampleDB, tearDownSampleDB} = require('./util');

describe('sample', () => {
    let server, db, schema, adminUser;
    before(async () => {
        ({server, db, schema} = await setUpSampleDB(true));
        adminUser = await db.select().from('User').where({name: 'admin'}).all();
        expect(adminUser).to.have.property('length', 1);
        adminUser = adminUser[0];
    });
    it('select disease cancer');
    after(async () => {
        await tearDownSampleDB(server);
    });
});
