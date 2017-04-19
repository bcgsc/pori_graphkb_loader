"use strict";
const {expect} = require('chai');
const conf = require('./../config/db');
const {models, createSchema, loadSchema, serverConnect, ORIENT_DB_TIME_FORMAT} = require('./../../app/repo');
const _ = require('lodash');
const {DependencyError, AttributeError} = require('./../../app/repo/error');
const {Base, History, KBVertex, KBEdge} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');


class MockVertexClass extends Base { // simple non-abstract class for tests
    static createClass(db) {
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}


describe('Versioning/History Tracking tests', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        serverConnect(conf)
            .then((result) => {
                server = result;
                return server.create({name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
            }).then((result) => {
                db = result;
                done();
            }).catch((error) => {
                console.log('error in connecting to the server or creating the database', error);
                done(error);
            });
    });
    it('create KBVertex class', () => {
        return KBVertex.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version']);
                expect(KBVertex.clsname).to.equal('kbvertex');
                expect(KBVertex.createType).to.equal('vertex');
            });
    });
    it('create History class', () => {
        return History.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['comment']);
                expect(History.clsname).to.equal('history');
                expect(History.createType).to.equal('edge');
            });
    });
    it('create the KBEdge class');

    describe('MockClass tests', () => {
        let mockRecord, mockClass;
        beforeEach((done) => {
            Promise.all([
                KBVertex.createClass(db),
                History.createClass(db)
            ]).then(() => {
                return MockVertexClass.createClass(db);
            }).then(() => {
                return MockVertexClass.loadClass(db);
            }).then((cls) => {
                mockClass = cls;
                return cls.createRecord();
            }).then((record) => {
                mockRecord = record;
                done();
            }).catch((error) => {
                done(error);
            });
        });
        it('update a mock record', () => {
            const uuid = mockRecord.uuid;
            const version = mockRecord.version;
            return mockClass.updateRecord(mockRecord, null, true)
                .then((record) => {
                    expect(record.uuid).to.equal(uuid);
                    expect(record.version).to.equal(version + 1);
                    expect(record['@class']).to.equal(MockVertexClass.clsname);
                });
        });
        it('constraint: duplicate uuid + version', () => {
            return mockClass.createRecord({uuid: mockRecord.uuid, version: mockRecord.version})
                .then((record) => {
                    expect.fail('violated constraint should have thrown error');
                }, (error) => {
                    oError.expectDuplicateKeyError(error);
                });
        });
        it('constraint: duplicate uuid + deleted_at', () => {
            return mockClass.createRecord({uuid: mockRecord.uuid, version: mockRecord.version + 1})
                .then((record) => {
                    expect.fail('violated constraint should have thrown error');
                }, (error) => {
                    oError.expectDuplicateKeyError(error);
                });
        });
    });
    /*
    describe('KBVertex dependent:', () => {
        beforeEach((done) => {
            KBVertex.createClass(db)
                .then((cls) => {
                    done();
                }).catch((error) => {
                    done(error);
                });
        });

        it('create the context schema model', () => {
            return models.Context.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(models.Context);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.true;
                });
        });
        it('create the context-evaluation model', () => {
            return models.Context.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return models.Evaluation.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Evaluation);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                    expect(result.propertyNames).to.include('consequence');
                });
        });
        it('create the context-evaluation-comparison model', () => {
            return models.Context.createClass(db)
                .then(() => {
                    return models.Evaluation.createClass(db);
                }).catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return models.Comparison.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Comparison);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                    expect(result.propertyNames).to.include('consequence');
                });
        });
        it('create the context-feature model');
        it('create the context-disease model', () => {
            return models.Context.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return models.Disease.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Disease);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                    expect(result.propertyNames).to.include('name');
                });
        });
        it('create the context-therapy model', () => {
            return models.Context.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return models.Therapy.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Therapy);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                    expect(result.propertyNames).to.include('name');
                });
        });
        it('create the context-event model');
        it('create the context-event-vocab model');
        it('create the context-event-positional model');
        it('create the range model');
        it('create the position model');
        it('create the position-genomic model');
        it('create the position-cds model');
        it('create the position-protein model');
        it('create the position-cytoband model');
        it('create the position-exon model');
        it.skip('create the full schema', () => {
            return createSchema(db)
                .then((result) => {
                    console.log('result', Object.keys(result));
                    // check the abstract classes exist
                    expect(result).to.have.all.keys([
                        'evidence', 'context', 'publication', 'feature', 'disease', 'therapy'
                    ]);
                    // check the evidence and subclasses
                    expect(result.evidence).to.have.property('properties');
                    expect(result.evidence.properties).to.have.members([]);
                });
        });
    });*/
    afterEach((done) => {
        /* disconnect from the database */
        server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                return server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error closing the server', error);
                done(error);
            });
    })
});


describe('Mock Class', () => {
    let cls;
    beforeEach(function(done) {
        cls = new MockVertexClass();
        done();
    });
    it('clsname', () => {
        expect(cls.constructor.clsname).to.equal('mock_vertex_class');
    });
});
