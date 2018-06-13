'use strict';
const {
    expect
} = require('chai');
const {
    setUpEmptyDB,
} = require('./../util');
const chai = require('chai');
const chaiHttp = require('chai-http');

const HTTP_STATUS = require('http-status-codes');
const conf = require('./../config/empty');
const auth = require('./../../app/middleware/auth');


chai.use(chaiHttp);

const REALLY_LONG_TIME = 10000000000;


describe('schema', () => {
    let db, admin, app, mockToken;
    before(async () => {
        conf.verbose = true;
        ({
            db,
            admin
        } = await setUpEmptyDB(conf));

        const {AppServer} = require('./../../app');
        delete conf.app.port;
        app = new AppServer(conf, false);

        await app.listen();
        mockToken = await auth.generateToken(admin, REALLY_LONG_TIME);
    });
    let source;
    beforeEach(async () => {
        const res = await chai.request(app.app)
            .post('/api/sources')
            .type('json')
            .send({
                name: 'bcgsc',
                version: '2018'
            })
            .set('Authorization', mockToken);
        source = res.body;
    });
    describe('GET /users', () => {
        it('name', async () => {
            const res = await chai.request(app.app)
                .get('/api/users?name=admin')
                .set('Authorization', mockToken);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(1);
            expect(res.body[0].name).to.equal('admin');
        });
    });
    describe('POST /users', () => {
        it('OK', async () => {
            const res = await chai.request(app.app)
                .post('/api/users')
                .type('json')
                .send({
                    name: 'blargh monkeys'
                })
                .set('Authorization', mockToken);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('object');
            expect(res.body.name).to.equal('blargh monkeys');
        });
        it('BAD REQUEST', async () => {
            let res;
            try {
                res = await chai.request(app.app)
                    .post('/api/users')
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
                    .post('/api/users')
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
                    .post('/api/users')
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
                .post('/api/diseases')
                .type('json')
                .send({
                    sourceId: 'cancer',
                    source: source
                })
                .set('Authorization', mockToken);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('object');
            expect(res.body).to.have.property('sourceId', 'cancer');
            expect(res.body.source).to.eql(source['@rid']);
        });
        it('BAD REQUEST (no source given)', async () => {
            let res;
            try {
                res = await chai.request(app.app)
                    .post('/api/diseases')
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
                    .post('/api/diseases')
                    .type('json')
                    .send({
                        source: source
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
                    .post('/api/diseases')
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source: source
                    });
            } catch (err) {
                res = err;
            }
            expect(res).to.have.status(HTTP_STATUS.UNAUTHORIZED);
        });
        it('CONFLICT', async () => {
            let res;
            res = await chai.request(app.app)
                .post('/api/diseases')
                .type('json')
                .send({
                    sourceId: 'cancer',
                    source: source
                })
                .set('Authorization', mockToken);
            expect(res).to.have.status(HTTP_STATUS.OK);
            try {
                res = await chai.request(app.app)
                    .post('/api/diseases')
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source: source
                    })
                    .set('Authorization', mockToken);
            } catch (err) {
                res = err;
            }
            expect(res).to.have.status(HTTP_STATUS.CONFLICT);
        });
    });
    describe('PATCH /diseases', () => {
        let disease, diseaseId;
        beforeEach(async () => {
            const res = await chai.request(app.app)
                .post('/api/diseases')
                .type('json')
                .send({
                    sourceId: 'cancer',
                    source: source
                })
                .set('Authorization', mockToken);
            disease = res.body;
            diseaseId = res.body['@rid'].replace('#', '');
        });
        it('OK', async () => {
            const res = await chai.request(app.app)
                .patch(`/api/diseases/${diseaseId}`)
                .type('json')
                .send({
                    sourceId: 'carcinoma'
                })
                .set('Authorization', mockToken);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('object');
            expect(res.body).to.have.property('sourceId', 'carcinoma');
            expect(res.body).to.have.property('source', disease.source);
            expect(res.body).to.have.property('@rid', disease['@rid']);
            expect(res.body).to.have.property('history');
            expect(res.body.history).to.not.equal(disease['@rid']);
        });
        it('NOT FOUND', async () => {
            let res;
            try {
                res = await chai.request(app.app)
                    .patch('/api/diseases/456:0')
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
                    .patch(`/api/diseases/${diseaseId}`)
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source: source
                    });
            } catch (err) {
                res = err;
            }
            expect(res).to.have.status(HTTP_STATUS.UNAUTHORIZED);
        });
        it('CONFLICT', async () => {
            let res;
            res = await chai.request(app.app)
                .post('/api/diseases')
                .type('json')
                .send({
                    sourceId: 'carcinoma',
                    source: source
                })
                .set('Authorization', mockToken);
            expect(res).to.have.status(HTTP_STATUS.OK);
            try {
                res = await chai.request(app.app)
                    .patch(`/api/diseases/${diseaseId}`)
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
        let disease, diseaseId;
        beforeEach(async () => {
            const res = await chai.request(app.app)
                .post('/api/diseases')
                .type('json')
                .send({
                    sourceId: 'cancer',
                    source: source
                })
                .set('Authorization', mockToken);
            disease = res.body;
            diseaseId = res.body['@rid'].replace('#', '');
        });
        it('OK', async () => {
            const res = await chai.request(app.app)
                .delete(`/api/diseases/${diseaseId}`)
                .type('json')
                .set('Authorization', mockToken);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('object');
            expect(res.body).to.have.property('sourceId', disease.sourceId);
            expect(res.body).to.have.property('source', disease.source);
            expect(res.body).to.have.property('@rid', disease['@rid']);
            expect(res.body).to.have.property('deletedAt');
            expect(res.body.deletedAt).to.be.a.number;
            expect(res.body).to.have.property('deletedBy', admin['@rid'].toString());
        });
        it('NOT FOUND', async () => {
            let res;
            try {
                res = await chai.request(app.app)
                    .delete('/api/diseases/456:0')
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
                    .delete(`/api/diseases/${diseaseId}`)
                    .type('json');
            } catch (err) {
                res = err;
            }
            expect(res).to.have.status(HTTP_STATUS.UNAUTHORIZED);
        });
    });
    // select neighbors that are not deleted
    describe('propogating active record selection', () => {
        let disease;
        beforeEach(async () => {
            const res1 = await chai.request(app.app)
                .post('/api/diseases')
                .type('json')
                .send({
                    sourceId: 'cancer',
                    source: source
                })
                .set('Authorization', mockToken);
            disease = res1.body;
            const res2 = await chai.request(app.app)
                .post('/api/diseases')
                .type('json')
                .send({
                    sourceId: 'carcinoma',
                    source: source
                })
                .set('Authorization', mockToken);
            await chai.request(app.app)
                .post('/api/aliasof')
                .type('json')
                .send({
                    out: res1.body['@rid'],
                    in: res2.body['@rid'],
                    source: source
                })
                .set('Authorization', mockToken);
            let res3 = await chai.request(app.app)
                .post('/api/diseases')
                .type('json')
                .send({
                    sourceId: 'disease of cellular proliferation',
                    source: source
                })
                .set('Authorization', mockToken);
            const res4 = await chai.request(app.app)
                .post('/api/aliasof')
                .type('json')
                .send({
                    out: res1.body['@rid'],
                    in: res3.body['@rid'],
                    source: source
                })
                .set('Authorization', mockToken);
            await chai.request(app.app)
                .delete(`/api/diseases/${res2.body['@rid'].slice(1)}`)
                .set('Authorization', mockToken);
            await chai.request(app.app)
                .delete(`/api/aliasof/${res4.body['@rid'].slice(1)}`)
                .set('Authorization', mockToken);
        });
        it('default limits to active records', async () => {
            const res = await chai.request(app.app)
                .get(`/api/diseases/${disease['@rid'].slice(1)}`)
                .set('Authorization', mockToken)
                .query({neighbors: 2});
            expect(res.body).to.have.property('sourceId', 'cancer');
            expect(res.body).to.have.property('out_AliasOf');
            expect(res.body.out_AliasOf).to.eql([]);
        });
        it('includes deleted when not limited to active', async () => {
            const res = await chai.request(app.app)
                .get(`/api/diseases/${disease['@rid'].slice(1)}`)
                .set('Authorization', mockToken)
                .query({neighbors: 2, activeOnly: false});
            expect(res.body).to.have.property('sourceId', 'cancer');
            expect(res.body).to.have.property('out_AliasOf');
            expect(res.body.out_AliasOf).to.have.property('length', 2);
        });
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