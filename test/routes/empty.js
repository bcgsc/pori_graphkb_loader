

const {
    expect
} = require('chai');
const chai = require('chai');
const chaiHttp = require('chai-http');
const HTTP_STATUS = require('http-status-codes');

const {
    setUpEmptyDB, clearDB
} = require('./../util');
const createConfig = require('./../../config/config.js');
const {generateToken} = require('./../../app/routes/auth');

chai.use(chaiHttp);

const REALLY_LONG_TIME = 10000000000;


describe('API', () => {
    let db,
        admin,
        app,
        mockToken,
        server,
        conf;
    before(async () => {
        ({
            db,
            admin,
            server,
            conf
        } = await setUpEmptyDB({
            ...createConfig(),
            verbose: true,
            privateKey: 'testKey',
            disableAuth: true
        }));

        const {AppServer} = require('./../../app'); // eslint-disable-line global-require
        delete conf.app.port;
        conf.db.create = false; // already created
        app = new AppServer(conf, false);

        await app.listen();
        mockToken = await generateToken(db, admin.name, conf.privateKey, REALLY_LONG_TIME);
    });

    describe('GET /stats', () => {
        it('gathers table stats', async () => {
            const res = await chai.request(app.app)
                .get(`${app.prefix}/stats`)
                .type('json')
                .set('Authorization', mockToken);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.have.property('result');
            expect(res.body.result).to.have.property('User', 1);
            expect(res.body.result).to.not.have.property('ProteinPosition'); // ignore embedded
            expect(res.body.result).to.not.have.property('Variant'); // ignore abstract
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
            it('aggregates the count', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/users?count=true`)
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.eql([{count: 1}]);
            });
        });
        describe('POST /users/search', () => {
            it('name', async () => {
                const res = await chai.request(app.app)
                    .post(`${app.prefix}/users/search`)
                    .set('Authorization', mockToken)
                    .type('json')
                    .send({
                        where: [
                            {attr: 'name', value: 'admin'}
                        ],
                        neighbors: 1,
                        limit: 10
                    });
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('array');
                expect(res.body.result.length).to.equal(1);
                expect(res.body.result[0].name).to.equal('admin');
            });
            it('BAD REQUEST for query params', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/users/search?neighbors=1`)
                        .set('Authorization', mockToken)
                        .type('json')
                        .send({
                            where: [
                                {attr: 'name', value: 'admin'}
                            ],
                            neighbors: 1,
                            limit: 10
                        });
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('name', 'ValidationError');
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
                expect(res).to.have.status(HTTP_STATUS.CREATED);
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
                expect(res.response.body).to.have.property('name', 'ValidationError');
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
        describe('PATCH /users/{rid}', () => {
            let readyOnly,
                adminGroup,
                user;
            beforeEach(async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/usergroups`)
                    .type('json')
                    .set('Authorization', mockToken);
                for (const group of res.body.result) {
                    if (group.name === 'readonly') {
                        readyOnly = group;
                    } else if (group.name === 'admin') {
                        adminGroup = group;
                    }
                }
                if (!readyOnly || !adminGroup) {
                    throw new Error('failed to find the readonly and admin user groups');
                }
                user = (await chai.request(app.app)
                    .post(`${app.prefix}/users`)
                    .type('json')
                    .send({
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    })
                    .set('Authorization', mockToken)
                ).body.result;
            });
            it('modify the group associated with a user', async () => {
                const updatedUser = (await chai.request(app.app)
                    .patch(`${app.prefix}/users/${user['@rid'].slice(1)}`)
                    .type('json')
                    .send({groups: [adminGroup['@rid']]})
                    .set('Authorization', mockToken)
                ).body.result;
                expect(updatedUser).to.have.property('groups');
                expect(updatedUser.groups).to.have.property('length', 1);
                expect(updatedUser.groups[0]).to.equal(adminGroup['@rid']);
                expect(updatedUser).to.have.property('name', 'alice');
            });
            it('rename the user', async () => {
                const updatedUser = (await chai.request(app.app)
                    .patch(`${app.prefix}/users/${user['@rid'].slice(1)}`)
                    .type('json')
                    .send({name: 'bob'})
                    .set('Authorization', mockToken)
                ).body.result;
                expect(updatedUser).to.have.property('groups');
                expect(updatedUser.groups).to.have.property('length', 1);
                expect(updatedUser.groups[0]).to.equal(readyOnly['@rid']);
                expect(updatedUser).to.have.property('name', 'bob');
            });
        });
        describe('DELETE /users/{rid}', () => {
            let readyOnly,
                adminGroup,
                user;
            beforeEach(async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/usergroups`)
                    .type('json')
                    .set('Authorization', mockToken);
                for (const group of res.body.result) {
                    if (group.name === 'readonly') {
                        readyOnly = group;
                    } else if (group.name === 'admin') {
                        adminGroup = group;
                    }
                }
                if (!readyOnly || !adminGroup) {
                    throw new Error('failed to find the readonly and admin user groups');
                }
                user = (await chai.request(app.app)
                    .post(`${app.prefix}/users`)
                    .type('json')
                    .send({
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    })
                    .set('Authorization', mockToken)
                ).body.result;
            });
            it('delete the current user', async () => {
                const updatedUser = (await chai.request(app.app)
                    .delete(`${app.prefix}/users/${user['@rid'].slice(1)}`)
                    .type('json')
                    .set('Authorization', mockToken)
                ).body.result;
                expect(updatedUser).to.have.property('deletedAt');
                expect(updatedUser.deletedBy).to.equal(admin['@rid'].toString());
            });
        });
        it('POST /usergroups', async () => {
            const group = (await chai.request(app.app)
                .post(`${app.prefix}/usergroups`)
                .type('json')
                .send({
                    name: 'wonderland',
                    permissions: {V: 15}
                })
                .set('Authorization', mockToken)
            ).body.result;
            expect(group).to.have.property('createdAt');
            expect(group).to.have.property('@class', 'UserGroup');
            expect(group.permissions).to.have.property('@class', 'Permissions');
        });
        describe('PATCH /usergroups/{rid}', () => {
            let group;
            beforeEach(async () => {
                group = (await chai.request(app.app)
                    .post(`${app.prefix}/usergroups`)
                    .type('json')
                    .send({
                        name: 'wonderland',
                        permissions: {V: 15}
                    })
                    .set('Authorization', mockToken)
                ).body.result;
            });
            it('modify permissions', async () => {
                const updated = (await chai.request(app.app)
                    .patch(`${app.prefix}/usergroups/${group['@rid'].toString().slice(1)}`)
                    .type('json')
                    .send({
                        permissions: {V: 15, E: 15}
                    })
                    .set('Authorization', mockToken)
                ).body.result;
                expect(updated).to.have.property('@rid', group['@rid'].toString());
                expect(updated).to.have.property('history');
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
                expect(res.response.body).to.have.property('name', 'ValidationError');
            });
            it('BAD REQUEST on invalid special query param', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .get(`${app.prefix}/features?neighbors=-1`)
                        .type('json')
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('name', 'ValidationError');
            });
            it('aggregates on count', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/features?count=t`)
                    .type('json')
                    .set('Authorization', mockToken);
                expect(res.body.result).to.eql([{count: 0}]);
            });
        });
        describe('GET /features/{rid}', () => {
            it('BAD REQUEST on invalid rid', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .get(`${app.prefix}/features/kme`)
                        .type('json')
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('name', 'ValidationError');
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
                expect(res).to.have.status(HTTP_STATUS.CREATED);
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
                expect(res.response.body).to.have.property('name', 'ValidationError');
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
                expect(res.response.body).to.have.property('name', 'ValidationError');
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
                expect(res).to.have.status(HTTP_STATUS.CREATED);
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
                expect(res).to.have.status(HTTP_STATUS.CREATED);
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
            it('neighborhood query returns both', async () => {
                const res = await chai.request(app.app)
                    .post(`${app.prefix}/diseases/search`)
                    .set('Authorization', mockToken)
                    .type('json')
                    .send({
                        type: 'neighborhood',
                        where: {attr: 'sourceId', value: 'cancer'},
                        neighbors: 2
                    });
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
        describe('GET /ontologies', () => {
            beforeEach(async () => {
                await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: '2',
                        name: 'liver cancer',
                        source,
                        subsets: ['A', 'B', 'C', 'd']
                    })
                    .set('Authorization', mockToken);
            });
            it('Does not throw permissions error', async () => {
                const resp = await chai.request(app.app)
                    .get(`${app.prefix}/ontologies`)
                    .type('json')
                    .set('Authorization', mockToken);
                expect(resp.body).to.have.property('result');
                expect(resp.body.result).to.have.property('length', 1);
            });
            it('query by subset single term', async () => {
                const resp = await chai.request(app.app)
                    .get(`${app.prefix}/ontologies`)
                    .type('json')
                    .query({subsets: 'a'})
                    .set('Authorization', mockToken);
                expect(resp.body).to.have.property('result');
                expect(resp.body.result).to.have.property('length', 1);
            });
        });
        describe('Query FULLTEXT index', () => {
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

        describe('/api/search?keyword', () => {
            let liverCancer,
                breastCancer,
                liverAngiosarc,
                publication,
                vocab,
                feature;
            beforeEach(async () => {
                liverCancer = (await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: '2',
                        name: 'liver cancer',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                breastCancer = (await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: '3',
                        name: 'breast cancer',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                liverAngiosarc = (await chai.request(app.app)
                    .post(`${app.prefix}/diseases`)
                    .type('json')
                    .send({
                        sourceId: '1',
                        name: 'liver angiosarcoma',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                publication = (await chai.request(app.app)
                    .post(`${app.prefix}/publications`)
                    .type('json')
                    .send({
                        sourceId: 'article',
                        name: 'article',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                vocab = (await chai.request(app.app)
                    .post(`${app.prefix}/vocabulary`)
                    .type('json')
                    .send({
                        sourceId: 'vocab',
                        name: 'vocab',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                feature = (await chai.request(app.app)
                    .post(`${app.prefix}/features`)
                    .type('json')
                    .send({
                        sourceId: 'gene',
                        name: 'gene',
                        source,
                        biotype: 'gene'
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                // now create the statements
                await chai.request(app.app)
                    .post(`${app.prefix}/statements`)
                    .type('json')
                    .send({
                        appliesTo: feature,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}],
                        supportedBy: [{target: publication}]
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.app)
                    .post(`${app.prefix}/statements`)
                    .type('json')
                    .send({
                        appliesTo: feature,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}, {target: liverCancer}],
                        supportedBy: [{target: publication}]
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.app)
                    .post(`${app.prefix}/statements`)
                    .type('json')
                    .send({
                        appliesTo: breastCancer,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}],
                        supportedBy: [{target: publication}]
                    })
                    .set('Authorization', mockToken);
            });
            it('retrieves by appliesTo', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/search`)
                    .type('json')
                    .query({keyword: 'breast cancer', limit: 10, neighbors: 0})
                    .set('Authorization', mockToken);
                expect(res.body.result).to.have.property('length', 1);
            });
            it('retrieves by impliedBy', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/search`)
                    .type('json')
                    .query({keyword: 'liver cancer', limit: 10, neighbors: 0})
                    .set('Authorization', mockToken);
                expect(res.body.result).to.have.property('length', 1);
            });
            it('Ignores supportedBy', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/search`)
                    .type('json')
                    .query({keyword: 'article', limit: 10, neighbors: 0})
                    .set('Authorization', mockToken);
                expect(res.body.result).to.have.property('length', 0);
            });
            it('retrieves by relevance', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/search`)
                    .type('json')
                    .query({keyword: 'vocab', limit: 10, neighbors: 0})
                    .set('Authorization', mockToken);
                expect(res.body.result).to.have.property('length', 3);
            });
            it('retrieves by either', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/search`)
                    .type('json')
                    .query({keyword: 'cancer'})
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 2);
            });
            it('with skip', async () => {
                const res = await chai.request(app.app)
                    .get(`${app.prefix}/search`)
                    .type('json')
                    .query({keyword: 'cancer', skip: 1})
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 1);
            });
        });
        describe('POST /statement', () => {
            let disease1,
                disease2,
                publication1,
                relevance1;
            beforeEach(async () => {
                [
                    disease1,
                    disease2,
                    publication1,,
                    relevance1

                ] = await Promise.all(Array.from([
                    {content: {name: 'disease1', sourceId: 'disease1'}, route: 'diseases'},
                    {content: {name: 'disease2', sourceId: 'disease2'}, route: 'diseases'},
                    {content: {name: 'publication1', sourceId: 'publication1'}, route: 'publications'},
                    {content: {name: 'publication2', sourceId: 'publication2'}, route: 'publications'},
                    {content: {name: 'relevance1', sourceId: 'relevance1'}, route: 'vocabulary'},
                    {content: {name: 'relevance2', sourceId: 'relevance2'}, route: 'vocabulary'}
                ], async (opt) => {
                    const res = await chai.request(app.app)
                        .post(`${app.prefix}/${opt.route}`)
                        .type('json')
                        .set('Authorization', mockToken)
                        .send(Object.assign({source}, opt.content));
                    return res.body.result;
                }));
            });
            it('BAD REQUEST error on supportedBy undefined', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('must include an array property supportedBy');
            });
            it('BAD REQUEST error on supportedBy empty array', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            supportedBy: [],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('must include an array property supportedBy');
            });
            it('BAD REQUEST error on supportedBy bad RID format', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            supportedBy: [{target: 'not an rid'}],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('does not look like a valid RID');
            });
            it('BAD REQUEST error on impliedBy undefined', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('must include an array property impliedBy');
            });
            it('BAD REQUEST error on impliedBy empty array', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            impliedBy: [],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('must include an array property impliedBy');
            });
            it('BAD REQUEST error on impliedBy bad RID format', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            impliedBy: [{target: 'not an rid'}],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('does not look like a valid RID');
            });
            it('BAD REQUEST error in finding one of the dependencies', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            appliesTo: '#448989898:0',
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('error in retrieving one or more of the dependencies');
            });
            it('BAD REQUEST error on missing relevance', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            appliesTo: disease1,
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}]
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('must have the relevance property');
            });
            it('BAD REQUEST error on missing appliesTo', async () => {
                let res;
                try {
                    res = await chai.request(app.app)
                        .post(`${app.prefix}/statements`)
                        .type('json')
                        .send({
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err;
                }
                expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
                expect(res.response.body).to.have.property('message');
                expect(res.response.body.message).to.include('must have the appliesTo property');
            });
            it('creates statement', async () => {
                const res = await chai.request(app.app)
                    .post(`${app.prefix}/statements`)
                    .type('json')
                    .send({
                        appliesTo: disease1,
                        impliedBy: [{target: disease2}],
                        supportedBy: [{target: publication1}],
                        relevance: relevance1
                    })
                    .set('Authorization', mockToken);
                expect(res).to.have.status(HTTP_STATUS.CREATED);
            });
        });
        afterEach(async () => {
            // clear all V/E records
            await clearDB(db, admin);
        });
    });
    after(async () => {
        if (server) {
            await server.drop({name: conf.db.name});
            await server.close();
        }
    });
});
