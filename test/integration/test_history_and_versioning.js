'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer} = require('./../../app/repo/connect');
const {Base, History, KBVertex} = require('./../../app/repo/base');
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


describe('Versioning/History Tracking tests', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        connectServer(conf)
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
                .then(() => {
                    expect.fail('violated constraint should have thrown error');
                }, (error) => {
                    oError.expectDuplicateKeyError(error);
                });
        });
        it('constraint: duplicate uuid + deleted_at', () => {
            return mockClass.createRecord({uuid: mockRecord.uuid, version: mockRecord.version + 1})
                .then(() => {
                    expect.fail('violated constraint should have thrown error');
                }, (error) => {
                    oError.expectDuplicateKeyError(error);
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
