

const {
    expect
} = require('chai');
const chai = require('chai');
const chaiHttp = require('chai-http');
const uuidV4 = require('uuid/v4');
const HTTP_STATUS = require('http-status-codes');
const {
    setUpEmptyDB
} = require('./../util');
const conf = require('./../config/empty');
const auth = require('./../../app/middleware/auth');

chai.use(chaiHttp);

const REALLY_LONG_TIME = 10000000000;
conf.disableCats = true;
conf.db = Object.assign({}, conf.db);
conf.verbose = true;
conf.db.name = `test_${uuidV4()}`;


describe('API', () => {
    let db,
        admin,
        app,
        mockToken,
        server;
    before(async () => {
        conf.verbose = true;
        ({
            db,
            admin,
            server
        } = await setUpEmptyDB(conf));

        const {AppServer} = require('./../../app');
        delete conf.app.port;
        app = new AppServer(conf, false);

        await app.listen();
        mockToken = await auth.generateToken(db, admin.name, REALLY_LONG_TIME);
    });

    describe('parser', () => {
        it('parses a variant', async () => {
            const res = await chai.request(app.app)
                .post(`${app.prefix}/parser/variant`)
                .type('json')
                .send({
                    content: 'p.R12K'
                });
            expect(res.body).to.have.property('result');
            expect(res.body.result).to.eql({
                break1Start: {'@class': 'ProteinPosition', pos: 12, refAA: 'R'},
                untemplatedSeq: 'K',
                untemplatedSeqSize: 1,
                refSeq: 'R',
                type: 'substitution',
                break1Repr: 'p.R12'
            });
        });
    });
    describe('database', () => {
        let source;
        beforeEach(async () => {
            const res = await chai.request(app.app)
                .post(`${app.prefix}/sources`)
                .type('json')
                .send({
                    name: 'bcgsc',
                    version: '2018'
                })
                .set('Authorization', mockToken);
            source = res.body.result;
        });
        describe('GET /users', () => {
            it('name', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/users?name=admin`)
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('array');
                expect(res.body.result.length).to.equal(1);
                expect(res.body.result[0].name).to.equal('admin');
            });
        });
        describe('GET /features', () => {
            it('BAD REQUEST on invalid biotype', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .get(`${app.prefix}/features?biotype=blargh`)
                        .type('json')
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('name', 'AttributeError');
            });
        });
        describe('POST /users', () => {
            it('OK', async () => {
                const res = await chai.request(app.app)
                    .post(`${app.prefix}/users`)
                    .type('json')
                    .send({
                        name: 'blargh monkeys'
                    })
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result.name).to.equal('blargh monkeys');
            });
            it('BAD REQUEST', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/users`)
                        .type('json')
                        .send({
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('name', 'AttributeError');
            });
            it('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/users`)
                        .type('json')
                        .send({
                            name: 'blargh monkeys'
                        });
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.UNAUTHORIZED);
            });
            it('CONFLICT', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/users`)
                        .type('json')
                        .set('Authorization', mockToken)
                        .send({
                            name: 'admin'
                        });
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.CONFLICT);
            });
        });
        describe('POST /diseases', () => {
            it('OK', async () => {
                const res = await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result).to.have.property('sourceId', 'cancer');
                expect(res.body.result.source).to.eql(source['@rid']);
            });
            it('BAD REQUEST (no source given)', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/diseases`)
                        .type('json')
                        .send({
                            sourceId: 'cancer'
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('name', 'AttributeError');
            });
            it('BAD REQUEST (no sourceId given)', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/diseases`)
                        .type('json')
                        .send({
                            source
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('name', 'AttributeError');
            });
            it('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/diseases`)
                        .type('json')
                        .send({
                            sourceId: 'cancer',
                            source
                        });
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.UNAUTHORIZED);
            });
            it('CONFLICT', async () => {
                let res;
                res = await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/diseases`)
                        .type('json')
                        .send({
                            sourceId: 'cancer',
                            source
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.CONFLICT);
            });
        });
        describe('PATCH /diseases', () => {
            let disease,
                diseaseId;
            beforeEach(async () => {
                const res = await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                disease = res.body.result;
                diseaseId = disease['@rid'].replace('#', '');
            });
            it('OK', async () => {
                const res = await chai.request(app.app)
                    .patch(`${app.prefix}/diseases/${diseaseId}`)
                    .type('json')
                    .send({
                        sourceId: 'carcinoma'
                    })
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result).to.have.property('sourceId', 'carcinoma');
                expect(res.body.result).to.have.property('source', disease.source);
                expect(res.body.result).to.have.property('@rid', disease['@rid']);
                expect(res.body.result).to.have.property('history');
                expect(res.body.result.history).to.not.equal(disease['@rid']);
            });
            it('NOT FOUND', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .patch(`${app.prefix}/diseases/456:0`)
                        .type('json')
                        .send({
                            sourceId: 'cancer'
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.NOT_FOUND);
                expect(res.response.body).to.have.property('name', 'NoRecordFoundError');
            });
            it('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .patch(`${app.prefix}/diseases/${diseaseId}`)
                        .type('json')
                        .send({
                            sourceId: 'cancer',
                            source
                        });
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.UNAUTHORIZED);
            });
            it('CONFLICT', async () => {
                let res;
                res = await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: 'carcinoma',
                        source
                    })
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                try {
                    res = await chai.request(app.app)
                        .patch(`${app.prefix}/diseases/${diseaseId}`)
                        .type('json')
                        .send({
                            sourceId: 'carcinoma'
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.CONFLICT);
            });
        });
        describe('DELETE /diseases', () => {
            let disease,
                diseaseId;
            beforeEach(async () => {
                const res = await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                disease = res.body.result;
                diseaseId = res.body.result['@rid'].replace('#', '');
            });
            it('OK', async () => {
                const res = await chai.request(app.app)
                    .delete(`${app.prefix}/diseases/${diseaseId}`)
                    .type('json')
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result).to.have.property('sourceId', disease.sourceId);
                expect(res.body.result).to.have.property('source', disease.source);
                expect(res.body.result).to.have.property('@rid', disease['@rid']);
                expect(res.body.result).to.have.property('deletedAt');
                expect(res.body.result.deletedAt).to.be.a.number;
                expect(res.body.result).to.have.property('deletedBy', admin['@rid'].toString());
            });
            it('NOT FOUND', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .delete(`${app.prefix}/diseases/456:0`)
                        .type('json')
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.NOT_FOUND);
                expect(res.response.body).to.have.property('name', 'NoRecordFoundError');
            });
            it('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .delete(`${app.prefix}/diseases/${diseaseId}`)
                        .type('json');
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.UNAUTHORIZED);
            });
        });
        // select neighbors that are not deleted
        describe('GET /diseases: propogating active record selection', () => {
            beforeEach(async () => {
                const res1 = await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                const res2 = await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: 'carcinoma',
                        source
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.app)
                    .post(`${app.prefix}/aliasof`)
                    .type('json')
                    .send({
                        out: res1.body.result['@rid'],
                        in: res2.body.result['@rid'],
                        source
                    })
                    .set('Authorization', mockToken);
                const res3 = await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: 'disease of cellular proliferation',
                        source
                    })
                    .set('Authorization', mockToken);
                const res4 = await chai.request(app.app)
                    .post(`${app.prefix}/aliasof`)
                    .type('json')
                    .send({
                        out: res1.body.result['@rid'],
                        in: res3.body.result['@rid'],
                        source
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.app)
                    .delete(`${app.prefix}/diseases/${res2.body.result['@rid'].slice(1)}`)
                    .set('Authorization', mockToken);
                await chai.request(app.app)
                    .delete(`${app.prefix}/aliasof/${res4.body.result['@rid'].slice(1)}`)
                    .set('Authorization', mockToken);
            });
            it('default limits to active records', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/diseases`)
                    .set('Authorization', mockToken)
                    .query({neighbors: 2});
                expect(res.body.result[0]).to.have.property('sourceId', 'cancer');
                expect(res.body.result[0]).to.have.property('out_AliasOf');
                expect(res.body.result[0].out_AliasOf).to.eql([]);
            });
            it('includes deleted when not limited to active', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/diseases`)
                    .set('Authorization', mockToken)
                    .query({neighbors: 2, activeOnly: false});
                expect(res.body.result).to.have.property('length', 6);
            });
        });
        describe('GET /diseases query FULLTEXT index', () => {
            beforeEach(async () => {
                await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: '2',
                        name: 'liver cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: '3',
                        name: 'breast cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: '1',
                        name: 'liver angiosarcoma',
                        source
                    })
                    .set('Authorization', mockToken);
            });
            it('requires all terms', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/diseases`)
                    .type('json')
                    .query({name: '~liver cancer'})
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 1);
                expect(res.body.result[0]).to.have.property('name', 'liver cancer');
            });
            it('ignores case (due to cast)', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/diseases`)
                    .type('json')
                    .query({name: '~CAncer'})
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 2);
            });
        });
        afterEach(async () => {
            // clear all V/E records
            await db.query('delete edge e');
            await db.query('delete vertex v');
        });
    });
    after(async () => {
        if (server) {
            await server.drop({name: conf.db.name});
            await server.close();
        }
    });
});
