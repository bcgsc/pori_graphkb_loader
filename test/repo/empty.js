

const {
    expect
} = require('chai');
const uuidV4 = require('uuid/v4');

const {
    create,
    update,
    remove,
    select,
    modifyEdgeTx
} = require('./../../app/repo/base');
const {
    setUpEmptyDB
} = require('./../util');

const emptyConf = Object.assign({}, require('./../config/empty'));

emptyConf.db = Object.assign({}, emptyConf.db);
emptyConf.verbose = true;
emptyConf.db.name = `test_${uuidV4()}`;


describe('schema', () => {
    let db,
        schema,
        admin,
        doSource,
        otherVertex,
        server;
    before(async () => {
        ({
            db,
            schema,
            admin,
            server
        } = await setUpEmptyDB(emptyConf));
        if (process.env.VERBOSE === '1') {
            console.log('finished DB setup');
        }
    });
    beforeEach(async () => {
        // create the source
        doSource = await create(db, {
            model: schema.Source,
            content: {
                name: 'disease ontology'
            },
            user: admin
        });
        otherVertex = await create(db, {
            model: schema.Source,
            content: {
                name: 'some other source'
            },
            user: admin
        });
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
                    source: doSource
                },
                user: admin
            });
            expect(record).to.have.property('sourceId', 'cancer');
            expect(record.source).to.eql(doSource['@rid']);
        });
    });
    it('update vertex', async () => {
        // make the initial node
        const content = {
            sourceId: 'cancer',
            source: doSource['@rid'].toString()
        };
        const record = await create(db, {
            model: schema.Disease,
            content,
            user: admin
        });
        expect(record).to.have.property('sourceId', 'cancer');
        expect(record.source).to.eql(doSource['@rid']);
        // change the name
        const updated = await update(db, {
            schema,
            changes: {
                sourceId: 'new name'
            },
            model: schema.Disease,
            user: admin,
            where: Object.assign({}, content)
        });
        // check that a history link has been added to the node
        expect(updated).to.have.property('sourceId', 'new name');
        expect(record.source).to.eql(doSource['@rid']);
        // check that the 'old'/copy node has the original details
        expect(updated['@rid']).to.eql(record['@rid']);
        // select the original node
        let originalNode = await select(db, {
            schema,
            where: content,
            activeOnly: false,
            exactlyN: 1,
            model: schema.Disease,
            fetchPlan: '*:1'
        });
        originalNode = originalNode[0];
        expect(updated.history).to.eql(originalNode['@rid']);
        expect(originalNode.deletedBy['@rid']).to.eql(admin['@rid']);
        expect(updated.createdBy).to.eql(admin['@rid']);
    });
    it('"delete" edge', async () => {
        // create the initial edge
        const original = await create(db, {
            model: schema.AliasOf,
            content: {
                out: doSource['@rid'],
                in: otherVertex['@rid'],
                comment: 'some original comment',
                source: doSource['@rid']
            },
            user: admin
        });
        // now update the edge, both src and target node should have history after
        const result = await remove(db, {
            where: {'@rid': original['@rid'].toString(), createdAt: original.createdAt},
            user: admin,
            model: schema.AliasOf,
            schema
        });
        expect(result).to.have.property('deletedBy');
        expect(result.createdBy).to.eql(admin['@rid']);
        expect(result).to.have.property('deletedAt');
        expect(result.deletedAt).to.not.be.null;
        expect(result.out).to.not.eql(doSource['@rid']);
        expect(result.in).to.not.eql(otherVertex['@rid']);
        [otherVertex, doSource] = await db.record.get([otherVertex['@rid'], doSource['@rid']]);
        expect(result.out).to.eql(doSource.history);
        expect(result.in).to.eql(otherVertex.history);
    });
    it('error on delete deleted vertex');
    it('error on delete deleted edge');
    it('"delete" vertex (and connected edges)', async () => {
        // create an edge
        const edge = await create(db, {
            model: schema.AliasOf,
            content: {
                out: doSource['@rid'],
                in: otherVertex['@rid'],
                comment: 'some original comment',
                source: doSource['@rid']
            },
            user: admin
        });
        const result = await remove(db, {
            where: {'@rid': doSource['@rid'].toString(), createdAt: doSource.createdAt},
            user: admin,
            model: schema.Source,
            schema
        });
        expect(result).to.have.property('deletedAt');
        expect(result).to.have.property('deletedBy');
        expect(result.deletedBy).to.eql(admin['@rid']);
        const updatedEdge = await db.record.get(edge['@rid']);
        expect(updatedEdge.in).to.not.eql(otherVertex['@rid']);
        expect(updatedEdge.deletedBy).to.eql(admin['@rid']);
    });
    describe('select', () => {
        let cancer,
            carcinoma;
        beforeEach(async () => {
            cancer = await create(db, {
                model: schema.Disease,
                content: {
                    sourceId: 'cancer',
                    source: doSource
                },
                user: admin
            });
            carcinoma = await create(db, {
                model: schema.Disease,
                content: {
                    sourceId: 'disease of cellular proliferation',
                    source: doSource
                },
                user: admin
            });
            await create(db, {
                model: schema.AliasOf,
                content: {
                    source: doSource,
                    out: carcinoma['@rid'],
                    in: cancer['@rid']
                },
                user: admin
            });
        });
        it('get by name', async () => {
            const records = await select(db, {
                schema,
                model: schema.Disease,
                where: {
                    sourceId: 'cancer',
                    fuzzyMatch: 3
                },
                user: admin
            });
            expect(records).to.have.property('length', 2);
        });
        it('limit 1', async () => {
            const records = await select(db, {
                schema,
                model: schema.Disease,
                limit: 1,
                user: admin
            });
            expect(records).to.have.property('length', 1);
            expect(records[0]).to.have.property('sourceId', 'cancer');
        });
        it('limit 1, skip 1', async () => {
            const records = await select(db, {
                schema,
                model: schema.Disease,
                skip: 1,
                limit: 1,
                user: admin
            });
            expect(records).to.have.property('length', 1);
            expect(records[0]).to.have.property('sourceId', 'disease of cellular proliferation');
        });
    });
    afterEach(async () => {
        // clear all V/E records
        await db.query('delete edge e');
        await db.query('delete vertex v');
    });
    after(async () => {
        await server.drop({name: emptyConf.db.name});
        await server.close();
    });
});
