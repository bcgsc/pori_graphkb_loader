'use strict';
const {expect} = require('chai');

const {create, update, remove, select} = require('./../app/repo/base');
const {PERMISSIONS} = require('./../app/repo/constants');

const {setUpEmptyDB, tearDownEmptyDB} = require('./util');

describe('schema', () => {
    let server, db, schema, adminUser;
    before(async () => {
        ({server, db, schema} = await setUpEmptyDB(false));
        adminUser = await select(db, {from: 'User', where: {name: 'admin'}, exactlyN: 1});
        expect(adminUser).to.have.property('length', 1);
        adminUser = adminUser[0];
        console.log('adminUser', adminUser);
        
    });
    describe('disease', () => {
        
        it('error on source not specified', async () => {
            try {
                const record = await create(db, 
                {
                    model: schema.Disease, 
                    content: {name: 'cancer'},
                    user: adminUser
                })
                console.log(record);
                expect.fail();
            } catch (err) {
                expect(err).to.have.property('message', 'missing required attribute source');
            }
        });
        it('create a new disease with source disease ontology', async () => {
            const record = await create(db, 
                {
                    model: schema.Disease, 
                    content: {name: 'cancer', source: 'disease ontology'},
                    user: adminUser
                });
            expect(record).to.have.property('name', 'cancer');
            expect(record).to.have.property('source', 'disease ontology');
        });
        it('errors on disease which violates source disease ontology', async () => {
            const record = await create(db, 
                {
                    model: schema.Disease, 
                    content: {name: 'cancer', source: 'disease ontology'},
                    user: adminUser
                });
            expect(record).to.have.property('name', 'cancer');
            expect(record).to.have.property('source', 'disease ontology');
        });
    });
    afterEach(async () => {
        // clear all V/E records 
        await db.query('delete edge e');
        await db.query('delete vertex v');
    });
    after(async () => {
        await tearDownEmptyDB(server);
    });
});
