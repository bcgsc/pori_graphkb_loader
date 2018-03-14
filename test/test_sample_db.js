'use strict';
const {expect} = require('chai');

const {create, update, remove, select} = require('./../app/repo/base');
const {PERMISSIONS} = require('./../app/repo/constants');

const {setUpSampleDB, tearDownSampleDB} = require('./util');

describe('sample', () => {
    let server, db, schema, adminUser;
    before(async () => {
        ({server, db, schema} = await setUpSampleDB(false));
        adminUser = await db.select().from('User').where({name: 'admin'}).all();
        expect(adminUser).to.have.property('length', 1);
        adminUser = adminUser[0];
    });
    it('select disease cancer', async () => {
        //const disease = await select({from: 'Disease', where: {'name': 'cancer'}});
        //expect(disease).to.have.property('name', 'cancer');
    });
    after(async () => {
        await tearDownSampleDB(server);
    });
});
