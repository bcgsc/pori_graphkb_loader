'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer} = require('./../../app/repo/connect');
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
    it('create KBVertex', () => {
        return KBVertex.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version']);
                expect(cls.constructor.clsname).to.equal('kbvertex');
                expect(cls.constructor.createType).to.equal('vertex');
            });
    });
    it('create History', () => {
        return History.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['comment']);
                expect(cls.constructor.clsname).to.equal('history');
                expect(cls.constructor.createType).to.equal('edge');
            });
    });
    it('create KBEdge', () => {
        return KBEdge.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version']);
                expect(cls.constructor.clsname).to.equal('kbedge');
                expect(cls.constructor.createType).to.equal('edge');
            });
    });

    describe('MockClass', () => {
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
            const uuid = mockRecord.content.uuid;
            const version = mockRecord.content.version;
            return mockClass.updateRecord(mockRecord.content, null, true)
                .then((record) => {
                    expect(record.content.uuid).to.equal(uuid);
                    expect(record.content.version).to.equal(version + 1);
                    expect(record.content['@class']).to.equal(MockVertexClass.clsname);
                });
        });
        it('duplicate uuid + version violates unique constraint', () => {
            return mockClass.createRecord({uuid: mockRecord.content.uuid, version: mockRecord.content.version})
                .then(() => {
                    expect.fail('violated constraint should have thrown error');
                }, (error) => {
                    oError.expectDuplicateKeyError(error);
                });
        });
        it('duplicate uuid + deleted_at violates unique constraint', () => {
            return mockClass.createRecord({uuid: mockRecord.content.uuid, version: mockRecord.content.version + 1})
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


describe('MockClass static', () => {
    let cls;
    beforeEach(function(done) {
        cls = new MockVertexClass();
        done();
    });
    it('clsname', () => {
        expect(cls.constructor.clsname).to.equal('mock_vertex_class');
    });
});
