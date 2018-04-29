'use strict';
const {expect} = require('chai');

const {create, update, remove, select} = require('./../app/repo/base');
const {PERMISSIONS} = require('./../app/repo/constants');

const {setUpEmptyDB, tearDownEmptyDB} = require('./util');

describe('schema', () => {
    let server, db, schema, admin;
    before(async () => {
        ({server, db, schema, admin} = await setUpEmptyDB(false));
    });
    describe('disease', () => {

        it('error on source not specified', async () => {
            try {
                const record = await create(db,
                {
                    model: schema.Disease,
                    content: {name: 'cancer'},
                    user: admin
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
                    user: admin
                });
            expect(record).to.have.property('name', 'cancer');
            expect(record).to.have.property('source', 'disease ontology');
        });
        it('errors on disease which violates source disease ontology', async () => {
            const record = await create(db,
                {
                    model: schema.Disease,
                    content: {name: 'cancer', source: 'disease ontology'},
                    user: admin
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
