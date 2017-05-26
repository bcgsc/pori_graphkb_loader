'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {Base, History, KBVertex, Record, KBEdge} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');


class MockVertexClass extends KBVertex { // simple non-abstract class for tests
    static createClass(db) {
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname})
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


describe('base module', () => {
    let db, server;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        connectServer(conf)
            .then((s) => {
                server = s;
                return createDB({server: s, name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
            }).then((result) => {
                db = result;
                done();
            }).catch((error) => {
                console.log('error in connecting to the server or creating the database', error);
                done(error);
            });
    });
    it('KBVertex.createClass', () => {
        return KBVertex.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version']);
                expect(cls.constructor.clsname).to.equal('kbvertex');
                expect(cls.constructor.createType).to.equal('vertex');
            });
    });
    it('History.createClass', () => {
        return History.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['comment']);
                expect(cls.constructor.clsname).to.equal('history');
                expect(cls.constructor.createType).to.equal('edge');
            });
    });
    it('KBEdge.createClass', () => {
        return KBEdge.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version']);
                expect(cls.constructor.clsname).to.equal('kbedge');
                expect(cls.constructor.createType).to.equal('edge');
            });
    });

    describe('MockVertexClass (instance)', () => {
        let mockRecord;
        beforeEach((done) => {
            Promise.all([
                KBVertex.createClass(db),
                History.createClass(db)
            ]).then(() => {
                return MockVertexClass.createClass(db);
            }).then(() => {
                return db.models.MockVertexClass.createRecord();
            }).then((record) => {
                mockRecord = record;
                done();
            }).catch((error) => {
                done(error);
            });
        });
        it('properties: retrieve inherited properties');
        it('superClasses: retrieve inherited classes', () => {
            const supers = db.models.MockVertexClass.superClasses;
            expect(supers).to.include('kbvertex', 'V');
        });
        it('isAbstract: status as db class', () => {
            expect(db.models.MockVertexClass.isAbstract).to.be.false;
        });
        it('propertyNames: returns names only', () => {
            const names = db.models.MockVertexClass.propertyNames;
            expect(names).to.include('uuid', 'created_at', 'deleted_at', 'version');
        });
        describe('isOrHasAncestor', () => {
            it('true for V', () => {
                expect(db.models.MockVertexClass.isOrHasAncestor('V')).to.be.true;
            });
            it('true for mock_vertex_class', () => {
                expect(db.models.MockVertexClass.isOrHasAncestor('mock_vertex_class')).to.be.true;
            });
            it('false for E', () => {
                expect(db.models.MockVertexClass.isOrHasAncestor('E')).to.be.false;
            });
        });
        it('updateRecord', () => {
            const uuid = mockRecord.content.uuid;
            const version = mockRecord.content.version;
            return db.models.MockVertexClass.updateRecord(mockRecord.content, null, true)
                .then((record) => {
                    expect(record.content.uuid).to.equal(uuid);
                    expect(record.content.version).to.equal(version + 1);
                    expect(record.content['@class']).to.equal(MockVertexClass.clsname);
                });
        });
        describe('createRecord', () => {
            it('errors on duplicate uuid + version', () => {
                return db.models.MockVertexClass.createRecord({uuid: mockRecord.content.uuid, version: mockRecord.content.version})
                    .then(() => {
                        expect.fail('violated constraint should have thrown error');
                    }, (error) => {
                        oError.expectDuplicateKeyError(error);
                    });
            });
            it('errors on duplicate uuid + deleted_at', () => {
                return db.models.MockVertexClass.createRecord({uuid: mockRecord.content.uuid, version: mockRecord.content.version + 1})
                    .then(() => {
                        expect.fail('violated constraint should have thrown error');
                    }, (error) => {
                        oError.expectDuplicateKeyError(error);
                    });
            });
        });
    });
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
    });
});


describe('static', () => {
    let cls;
    beforeEach(function(done) {
        cls = new MockVertexClass();
        done();
    });
    it('clsname', () => {
        expect(cls.constructor.clsname).to.equal('mock_vertex_class');
    });
});
