'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {Base, History, KBVertex, Record, KBEdge, KBUser, KBRole} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');

// a non-abstract class for testing purposes
class MockVertexClass extends KBVertex { 
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
    beforeEach(function(done) { 
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
    it('KBEdge.createClass', () => {
        return KBEdge.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version']);
                expect(cls.constructor.clsname).to.equal('kbedge');
                expect(cls.constructor.createType).to.equal('edge');
            });
    });

    it('KBUser.createClass', () => {
        return KBUser.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['status' ,'role' ,'username']);
                expect(cls.constructor.clsname).to.equal('kbuser');
            });
    });
    it('KBRole.createClass', () => {
        return KBRole.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['name' ,'rules', 'mode']);
                expect(cls.constructor.clsname).to.equal('kbrole');
            });
    });
    it('History.createClass', () => {
        return KBUser.createClass(db)
            .then(() => {
                return History.createClass(db)
                    .then((cls) => {
                        expect(cls.propertyNames).to.have.members(['comment','user']);
                        expect(cls.constructor.clsname).to.equal('history');
                        expect(cls.constructor.createType).to.equal('edge');
                    });
                });
    });    
    describe('MockVertexClass', () => {
    let mockRecord, kbvertexClass, kbedgeClass, kbuserClass, kbroleClass;
    beforeEach((done) => {
        Promise.all([
            KBVertex.createClass(db),
            KBEdge.createClass(db),
            KBRole.createClass(db),
            KBUser.createClass(db)
        ]).then((clsList) => {
            kbuserClass = clsList[3];
            kbroleClass = clsList[2];
                return History.createClass(db)
                    .then(() => {
                        return MockVertexClass.createClass(db)
                            .then(() => {
                                return db.models.MockVertexClass.createRecord();                
                                    }).then((record) => {
                                        mockRecord = record;
                                        done();
                                    }).catch((error) => {
                                        done(error);
                                    });
                            });           
            });
    });
        it('KBUser.createRecord', () => {
            return kbroleClass.createRecord({name: 'admin', mode: 0, rules: [{disease: ['read']}, {ontology: ['write']}]})
                .then(() => {
                    return kbuserClass.createRecord({username: 'azadeh', role: 'admin'})
                        .then((userRecord) => {
                            expect(userRecord.content).to.have.property('role');
                            console.log(userRecord.content.role);
                        }).catch((error) => {
                            console.log('error:', error);
                        });
                })
        });
        // it('KBVertex.updateRecord (including user in History edge)', () => {
        //     return kbuserClass.createRecord({username: conf.dbUsername, role: 'admin'})
        //         .then((userRecord) => {
        //             const mockUUID = mockRecord.content.uuid;
        //             const mockVersion = mockRecord.content.version;
        //             return db.models.MockVertexClass.updateRecord(mockRecord.content, null, true)
        //                 .then((record) => {
        //                     expect(record.content.uuid).to.equal(mockUUID);
        //                     expect(record.content.version).to.equal(mockVersion + 1);
        //                     expect(record.content['@class']).to.equal(MockVertexClass.clsname);
        //                     console.log(record);
        //                 });
        //         }).catch((error) => {
        //             console.log('error:', error);
        //         });;
        // });
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