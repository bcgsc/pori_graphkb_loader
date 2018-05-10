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
    describe('create', () => {

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
    describe('remove', () => {
        it('an existing node', async () => {
            const record = await create(db,
                {
                    model: schema.Disease,
                    content: {name: 'cancer', source: 'disease ontology'},
                    user: admin
                });
            const deleted = await remove(db,
                {
                    model: schema.Disease,
                    where: {name: 'cancer', uuid: record.uuid},
                    user: admin
                });
            console.log(deleted);
            expect(deleted.deletedBy.toString()).to.equal(admin['@rid'].toString());
        });
        it('errors on no existing node', async () => {
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
    //describe('select');
    describe('update', () => {
        it('change a node name', async () => {
            // make the initial node
            const content = {name: 'cancer', source: 'disease ontology'};
            const record = await create(db,
                {
                    model: schema.Disease,
                    content: content,
                    user: admin
                });
            expect(record).to.have.property('name', 'cancer');
            expect(record).to.have.property('source', 'disease ontology');
            // change the name
            const updated = await update(db,
                {
                    content: {name: 'new name'},
                    model: schema.Disease,
                    user: admin,
                    where: Object.assign({}, content)
                });
            // check that a history link has been added to the node
            expect(updated).to.have.property('name', 'new name');
            expect(updated).to.have.property('source', 'disease ontology');
            // check that the 'old'/copy node has the original details
            expect(updated['@rid'].toString()).to.equal(record['@rid'].toString());
            // select the original node
            let originalNode = await select(db,
                {
                    where: content,
                    activeOnly: false,
                    exactlyN: 1,
                    model: schema.Disease
                });
            originalNode = originalNode[0];
            expect(updated['history'].toString()).to.equal(originalNode['@rid'].toString());
            expect(originalNode['deletedBy']['@rid'].toString()).to.equal(admin['@rid'].toString());
            expect(updated['createdBy'].toString()).to.equal(admin['@rid'].toString());
        });
    });
    describe('select', () => {
        let cancer, carcinoma;
        before(async () => {
            cancer = await create(db,
                {
                    model: schema.Disease,
                    content: {name: 'cancer', source: 'disease ontology'},
                    user: admin
                });
            carcinoma = await create(db,
                {
                    model: schema.Disease,
                    content: {name: 'carcinoma', source: 'disease ontology'},
                    user: admin
                });
            await create(db, {
                model: schema.SubClassOf,
                content: {from: carcinoma['@rid'], to: cancer['@rid']},
                user: admin
            });
        });
        it('get by name');
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
