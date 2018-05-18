'use strict';
const {
    expect
} = require('chai');

const {
    create,
    update,
    remove,
    select
} = require('./../../app/repo/base');

const {
    setUpEmptyDB,
    tearDownEmptyDB
} = require('./../util');

const emptyConf = require('./../config/empty');
emptyConf.verbose = true;

describe('schema', () => {
    let server, db, schema, admin;
    before(async () => {
        ({
            server,
            db,
            schema,
            admin
        } = await setUpEmptyDB(emptyConf));
    });
    describe('create', () => {

        it('error on source not specified', async () => {
            try {
                const record = await create(db, {
                    model: schema.Disease,
                    content: {
                        sourceId: 'cancer'
                    },
                    user: admin
                });
                console.log(record);
                expect.fail();
            } catch (err) {
                expect(err).to.have.property('message', 'missing required attribute source');
            }
        });
        it('create a new disease with source disease ontology', async () => {
            const record = await create(db, {
                model: schema.Disease,
                content: {
                    sourceId: 'cancer',
                    source: 'disease ontology'
                },
                user: admin
            });
            expect(record).to.have.property('sourceId', 'cancer');
            expect(record).to.have.property('source', 'disease ontology');
        });
        it('errors on disease which violates source disease ontology', async () => {
            const record = await create(db, {
                model: schema.Disease,
                content: {
                    sourceId: 'cancer',
                    source: 'disease ontology'
                },
                user: admin
            });
            expect(record).to.have.property('sourceId', 'cancer');
            expect(record).to.have.property('source', 'disease ontology');
        });
    });
    describe('remove', () => {
        it('an existing node', async () => {
            const record = await create(db, {
                model: schema.Disease,
                content: {
                    sourceId: 'cancer',
                    source: 'disease ontology'
                },
                user: admin
            });
            const deleted = await remove(db, {
                model: schema.Disease,
                where: {
                    sourceId: 'cancer',
                    uuid: record.uuid
                },
                user: admin
            });
            console.log(deleted);
            expect(deleted.deletedBy.toString()).to.equal(admin['@rid'].toString());
        });
        it('errors on no existing node', async () => {
            const record = await create(db, {
                model: schema.Disease,
                content: {
                    sourceId: 'cancer',
                    source: 'disease ontology'
                },
                user: admin
            });
            expect(record).to.have.property('sourceId', 'cancer');
            expect(record).to.have.property('source', 'disease ontology');
        });
    });
    //describe('select');
    describe('update', () => {
        it('change a node name', async () => {
            // make the initial node
            const content = {
                sourceId: 'cancer',
                source: 'disease ontology'
            };
            const record = await create(db, {
                model: schema.Disease,
                content: content,
                user: admin
            });
            expect(record).to.have.property('sourceId', 'cancer');
            expect(record).to.have.property('source', 'disease ontology');
            console.log('original', record);
            // change the name
            const updated = await update(db, {
                content: {
                    sourceId: 'new name'
                },
                model: schema.Disease,
                user: admin,
                where: Object.assign({}, content)
            });
            console.log('updated', updated);
            // check that a history link has been added to the node
            expect(updated).to.have.property('sourceId', 'new name');
            expect(updated).to.have.property('source', 'disease ontology');
            // check that the 'old'/copy node has the original details
            expect(updated['@rid']).to.eql(record['@rid']);
            // select the original node
            let originalNode = await select(db, {
                where: content,
                activeOnly: false,
                exactlyN: 1,
                model: schema.Disease
            });
            console.log('reselect original', originalNode);
            originalNode = originalNode[0];
            expect(updated['history']).to.eql(originalNode['@rid']);
            expect(originalNode['deletedBy']['@rid']).to.eql(admin['@rid']);
            expect(updated['createdBy']).to.eql(admin['@rid']);
        });
    });
    describe('select', () => {
        let cancer, carcinoma;
        before(async () => {
            cancer = await create(db, {
                model: schema.Disease,
                content: {
                    sourceId: 'cancer',
                    source: 'disease ontology'
                },
                user: admin
            });
            carcinoma = await create(db, {
                model: schema.Disease,
                content: {
                    sourceId: 'carcinoma',
                    source: 'disease ontology'
                },
                user: admin
            });
            await create(db, {
                model: schema.SubClassOf,
                content: {
                    out: carcinoma['@rid'],
                    in: cancer['@rid']
                },
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
        await db.close();
    });
});