

const {
    expect
} = require('chai');
const uuidV4 = require('uuid/v4');

const {
    create,
    update,
    remove,
    select
} = require('./../../app/repo/base');
const {
    RecordExistsError,
    AttributeError
} = require('./../../app/repo/error');
const {
    castToRID
} = require('./../../app/repo/util');
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
    describe('SelectionQuery', () => {
        it('select statements related to a particular publication pmid');
        // it('select statements related to a particular pmid', () => {
        // select * from statement where outE('supportedBy').inV().asSet() in (select @rid from (select * from evidence where sourceId in ["23578175"]))
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
            } catch (err) {
                expect(err.message).to.include('missing required attribute source');
                return;
            }
            expect.fail('did not throw the expected error');
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
                    name: 'other name',
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
        it('get by name OR sourceId', async () => {
            const records = await select(db, {
                schema,
                model: schema.Disease,
                where: {name: 'other name', sourceId: 'cancer', or: ['name', 'sourceId']},
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
    describe('statements', () => {
        let disease1,
            disease2,
            publication1,
            publication2,
            drug,
            relevance1,
            relevance2,
            level,
            source;
        beforeEach(async () => {
            source = doSource['@rid'];
            // add a disease and pubmed source
            [
                disease1,
                disease2,
                drug,
                relevance1,
                relevance2,
                level
            ] = await Promise.all(Array.from([{
                model: schema.Disease,
                user: admin,
                content: {source, name: 'cancer', sourceId: 'DOID:123'}
            },
            {
                model: schema.Disease,
                user: admin,
                content: {source, name: 'carcinoma', sourceId: 'DOID:124'}
            },
            {
                content: {name: 'drug', sourceId: 'drug', source},
                model: schema.Therapy,
                user: admin
            },
            {
                content: {name: 'sensitivity', sourceId: 'sensitivity', source},
                model: schema.Vocabulary,
                user: admin
            },
            {
                content: {name: 'resistance', sourceId: 'resistance', source},
                model: schema.Vocabulary,
                user: admin
            },
            {
                content: {name: '4a', sourceId: '4a', source},
                model: schema.EvidenceLevel,
                user: admin
            }], async x => create(db, x)));
            // add a publication
            [publication1, publication2] = await Promise.all(Array.from([
                {
                    name: 'some article name',
                    sourceId: '123456',
                    year: 2017,
                    source
                },
                {
                    name: 'second article',
                    sourceId: '1234567',
                    year: 2018,
                    source
                }], async content => create(db, {
                model: schema.Publication, schema, user: admin, content
            })));
        });
        it('inserts related edges', async () => {
            await create(db, {
                content: {
                    relevance: relevance1['@rid'],
                    appliesTo: drug['@rid'],
                    impliedBy: [{target: disease1['@rid']}],
                    supportedBy: [{target: publication1['@rid'], level}]
                },
                user: admin,
                model: schema.Statement,
                schema
            });
        });
        it('delete a statement', async () => {
            const stat = await create(db, {
                content: {
                    relevance: relevance1['@rid'],
                    appliesTo: drug['@rid'],
                    impliedBy: [{target: disease1['@rid']}],
                    supportedBy: [{target: publication1['@rid'], level}]
                },
                user: admin,
                model: schema.Statement,
                schema
            });
            await remove(db, {
                where: {'@rid': stat['@rid']},
                user: admin,
                model: schema.Statement
            });
            const statements = await select(db, {
                where: {'@rid': stat['@rid'], activeOnly: true},
                schema,
                model: schema.Statement
            });
            expect(statements).to.have.property('length', 0);
        });
        it('updating the review status also updates reviewedBy', async () => {
            const stat = await create(db, {
                content: {
                    relevance: relevance1['@rid'],
                    appliesTo: drug['@rid'],
                    impliedBy: [{target: disease1['@rid']}],
                    supportedBy: [{target: publication1['@rid'], level}]
                },
                user: admin,
                model: schema.Statement,
                schema
            });
            await update(db, {
                where: {'@rid': stat['@rid']},
                changes: {reviewStatus: 'passed'},
                user: admin,
                model: schema.Statement
            });
            const statements = await select(db, {
                where: {createdAt: stat.createdAt, activeOnly: true},
                schema,
                model: schema.Statement
            });
            expect(statements).to.have.property('length', 0);
        });
        it('error on existing statement', async () => {
            await create(db, {
                content: {
                    relevance: relevance1['@rid'],
                    appliesTo: drug['@rid'],
                    impliedBy: [{target: disease1['@rid']}],
                    supportedBy: [{target: publication1['@rid'], level}]
                },
                user: admin,
                model: schema.Statement,
                schema
            });
            try {
                await create(db, {
                    content: {
                        relevance: relevance1['@rid'],
                        appliesTo: drug['@rid'],
                        impliedBy: [{target: disease1['@rid']}],
                        supportedBy: [{target: publication1['@rid'], level}]
                    },
                    user: admin,
                    model: schema.Statement,
                    schema
                });
            } catch (err) {
                expect(err).to.be.an.instanceof(RecordExistsError);
                expect(err.message).to.include('already exists');
                return;
            }
            expect.fail('did not throw the expected error');
        });
        it('allows statement with only some shared edges', async () => {
            await create(db, {
                content: {
                    relevance: relevance1['@rid'],
                    appliesTo: drug['@rid'],
                    impliedBy: [{target: disease1['@rid']}],
                    supportedBy: [{target: publication1['@rid'], level}]
                },
                user: admin,
                model: schema.Statement,
                schema
            });
            await create(db, {
                content: {
                    relevance: relevance1['@rid'],
                    appliesTo: drug['@rid'],
                    impliedBy: [{target: disease1['@rid']}, {target: disease2['@rid']}],
                    supportedBy: [{target: publication1['@rid'], level}]
                },
                user: admin,
                model: schema.Statement,
                schema
            });
        });
        describe('query', () => {
            let statement1,
                statement2,
                relevance3;
            beforeEach(async () => {
                relevance3 = await create(db, {
                    model: schema.Vocabulary,
                    content: {
                        name: 'other',
                        sourceId: 'other',
                        source
                    },
                    user: admin
                });
                [, , statement1, statement2] = await Promise.all(Array.from([
                    {
                        model: schema.AliasOf,
                        content: {out: relevance1['@rid'], in: relevance2['@rid'], source}
                    },
                    {
                        model: schema.DeprecatedBy,
                        content: {out: publication1['@rid'], in: publication2['@rid'], source}
                    },
                    {
                        content: {
                            relevance: relevance1['@rid'],
                            appliesTo: drug['@rid'],
                            impliedBy: [{target: disease1['@rid']}],
                            supportedBy: [{target: publication1['@rid'], level}]
                        },
                        model: schema.Statement
                    },
                    {
                        content: {
                            relevance: relevance2['@rid'],
                            appliesTo: drug['@rid'],
                            impliedBy: [{target: disease1['@rid']}, {target: disease2['@rid']}],
                            supportedBy: [{target: publication1['@rid'], level}]
                        },
                        model: schema.Statement
                    },
                    {
                        content: {
                            relevance: relevance3['@rid'],
                            appliesTo: drug['@rid'],
                            impliedBy: [{target: disease1['@rid']}, {target: disease2['@rid']}],
                            supportedBy: [{target: publication2['@rid']}]
                        },
                        model: schema.Statement
                    }
                ], async opt => create(db, Object.assign({schema, user: admin}, opt))));
            });
            it('allows fuzzy matching statement properties', async () => {
                // should get relevance1 and relevance2 but not relevance3
                const recordList = await select(db, {
                    where: {
                        relevance: {fuzzyMatch: 3, name: relevance1.name}
                    },
                    model: schema.Statement,
                    schema
                });
                expect(recordList).to.have.property('length', 2);
                expect(Array.from(recordList, castToRID)).to.eql([statement1['@rid'], statement2['@rid']]);
            });
            it('allows fuzzy matching related vertices', async () => {
                const recordList = await select(db, {
                    where: {
                        supportedBy: {v: {fuzzyMatch: 3, name: publication2.name}}
                    },
                    model: schema.Statement,
                    schema
                });
                expect(recordList).to.have.property('length', 3);
            });
            it('select on related edge properties', async () => {
                const recordList = await select(db, {
                    where: {
                        supportedBy: {level: {name: level.name}}
                    },
                    model: schema.Statement,
                    schema
                });
                expect(recordList).to.have.property('length', 2);
            });
        });
    });
    afterEach(async () => {
        // clear all V/E records
        await db.query('delete edge e');
        await db.query('delete vertex v');
    });
    after(async () => {
        if (server) {
            await server.drop({name: emptyConf.db.name});
            await server.close();
        }
    });
});
