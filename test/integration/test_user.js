'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {admin, analyst, bioinfo} = require('./../../config/roles');
const {Context} = require('./../../app/repo/context');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {AttributeError, PermissionError, AuthenticationError, NoResultFoundError} = require('./../../app/repo/error');
const {Base, History, KBVertex, Record, KBEdge, KBUser, KBRole} = require('./../../app/repo/base');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDepricatedBy} = require('./../../app/repo/ontology');

const oError = require('./orientdb_errors');

// a non-abstract kbvertex class for testing purposes
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

// a non-abstract kbedge class for testing purposes
class MockEdgeClass extends KBEdge { 
    static createClass(db) {
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname})
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
        return KBRole.createClass(db)
            .then((roleCls) => {
            return roleCls.createRecord({name: 'admin', mode: 0, rules: admin})
             .then(() => {
                return KBUser.createClass(db)
                .then((userCls) => {
                    return userCls.createRecord({username: 'admin', role: 'admin'})
                    .then(() => {
                    return KBVertex.createClass(db)
                        .then((cls) => {
                            expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version','created_by', 'deleted_by']);
                            expect(cls.constructor.clsname).to.equal('kbvertex');
                            expect(cls.constructor.createType).to.equal('vertex');
                        });
                    });
                });
             });
        });
    });

    it('KBEdge.createClass', () => {
        return KBRole.createClass(db)
            .then((roleCls) => {
            return roleCls.createRecord({name: 'admin', mode: 0, rules: admin})
             .then(() => {
                return KBUser.createClass(db)
                .then((userCls) => {
                    return userCls.createRecord({username: 'admin', role: 'admin'})
                    .then(() => {
                    return KBEdge.createClass(db)
                        .then((cls) => {
                            expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version','created_by', 'deleted_by']);
                            expect(cls.constructor.clsname).to.equal('kbedge');
                            expect(cls.constructor.createType).to.equal('edge');
                        });
                    });
                });
             });
        });
    });

    it('KBRole.createClass', () => {
        return KBRole.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['name' ,'rules', 'mode']);
                expect(cls.constructor.clsname).to.equal('kbrole');
            });
    });

    it('KBUser.createClass', () => {
        return KBRole.createClass(db)
            .then((roleCls) => {
                return KBUser.createClass(db)
                    .then((userCls) => {
                        expect(userCls.propertyNames).to.have.members(['status' ,'role' ,'username']);
                        expect(userCls.constructor.clsname).to.equal('kbuser');
                    });
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

    describe('KBVertex & KBEdge Classes', () => {
    let mockRecord, kbvertexClass, kbedgeClass, kbuserClass, kbroleClass;
    let adminRec, analystRec, bioinfoRec;
    beforeEach((done) => {
        Promise.all([
            KBRole.createClass(db),
            KBUser.createClass(db)
        ]).then((clsList) => {
            [kbroleClass, kbuserClass] = clsList;
            Promise.all([
                kbroleClass.createRecord({name: 'admin', mode: 0, rules: admin}),
                kbroleClass.createRecord({name: 'analyst', mode: 0, rules: analyst}),
                kbroleClass.createRecord({name: 'bioinfo', mode: 0, rules: bioinfo}),
                ]).then(() => {
                    Promise.all([
                        kbuserClass.createRecord({username: 'admin', role: 'admin'}),
                        kbuserClass.createRecord({username: 'Martin', role: 'analyst'}),
                        kbuserClass.createRecord({username: 'Wei', role: 'bioinfo'}),
                        kbuserClass.createRecord({username: 'Simon', role: 'analyst', status: 'SUSPENDED'})
                        ]).then((userRecList) => {
                            [adminRec, analystRec, bioinfoRec] = userRecList;
                            Promise.all([
                                KBVertex.createClass(db),
                                KBEdge.createClass(db),
                                History.createClass(db)
                                ]).then(() => {
                                    done();
                                }).catch((error) => {
                                        done(error);
                                });
                                           
                            });
                        });
                });
    });
        it('KBVertex.createRecord', () => {
            return MockVertexClass.createClass(db)
                .then((mockClass) => {
                    return mockClass.createRecord(null, 'admin');                
                        }).then((mockRecord) => {
                            expect(mockRecord.content.created_by.username).to.equal('admin');
                        }).catch((error) => {
                            console.log(error);
                        });
        });

        it('KBVertex.updateRecord (Ontology)', () => {
            let ontologyClass, diseaseClass;
            const disease = {name: 'name1', doid: 123};
            return Context.createClass(db)
                .then((contextClass) => {
                return Promise.all([
                        Ontology.createClass(db),
                        Disease.createClass(db),
                    ]).then((clsList) => {
                        [ontologyClass, diseaseClass] = clsList;
                    }).then(() => {
                        return diseaseClass.createRecord(disease, 'admin')
                            .then((diseaseRec) => {
                                const uuid = diseaseRec.content.uuid;
                                const version = diseaseRec.content.version;
                                diseaseRec.content.name = 'updatedName'
                                return diseaseClass.updateRecord(diseaseRec.content, 'admin')
                                    .then((updatedRec) => {
                                        expect(updatedRec.content.uuid).to.equal(uuid);
                                        expect(updatedRec.content.version).to.equal(version + 1);
                                        expect(updatedRec.content).to.include.keys('created_by');
                                    });
                            });
                    });
                });
        });

        it('KBVertex.deleteRecord (Ontology updated record)', () => {
            let ontologyClass, diseaseClass;
            const disease = {name: 'name1', doid: 123};
            return Context.createClass(db)
                .then((contextClass) => {
                return Promise.all([
                        Ontology.createClass(db),
                        Disease.createClass(db),
                    ]).then((clsList) => {
                        [ontologyClass, diseaseClass] = clsList;
                    }).then(() => {
                        return diseaseClass.createRecord(disease, 'admin')
                            .then((diseaseRec) => {
                                const uuid = diseaseRec.content.uuid;
                                const version = diseaseRec.content.version;
                                diseaseRec.content.name = 'updatedName'
                                return diseaseClass.updateRecord(diseaseRec.content, 'admin')
                                    .then((updatedRec) => {
                                        expect(updatedRec.content.uuid).to.equal(uuid);
                                        expect(updatedRec.content.version).to.equal(version + 1);
                                        expect(updatedRec.content).to.include.keys('created_by');
                                    });
                            }).then(() => {
                                return diseaseClass.deleteRecord(disease, 'admin')
                                    .then(() => {
                                        expect.fail('NoResultFoundError');
                                    }).catch(NoResultFoundError, () => {});
                                });
                    });
                });
        });


        it('KBEdge.createRecord (Ontology)', () => {
            let contextClass, ontologyClass, ontologyAliasOfClass, diseaseClass;
            const entry_disease = {name: 'name1', doid: 123};
            const secondEntry_disease = {name: 'name2', doid: 123};
            return Promise.all([
                    Context.createClass(db),
                    Ontology.createClass(db),
                    OntologyAliasOf.createClass(db),
                    Disease.createClass(db),
                ]).then((clsList) => {
                    [contextClass, ontologyClass, ontologyAliasOfClass, diseaseClass] = clsList;
                }).then(() => {
                    return Promise.all([
                        diseaseClass.createRecord(entry_disease, 'admin'),
                        diseaseClass.createRecord(secondEntry_disease, 'admin')
                    ]).then((recList) => {
                        return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]}, 'admin');
                    }).then((edge) => {
                        expect(edge.content.created_by).to.include.keys('username', 'role');
                    }, (error) => {
                        console.log(error);
                    });
                });
        });

        it('KBVertex.createRecord (insufficient permissions)', () => {
            return MockVertexClass.createClass(db)
                .then((mockClass) => {
                    return mockClass.createRecord(null, 'Wei');                
                        }).then((mockRecord) => {
                            expect(mockRecord.content.created_by.username).to.equal('Wei');
                        }).catch((error) => {
                            expect(error).to.be.an.instanceof(PermissionError);
                        });
        });

        it('KBVertex.deleteRecord (insufficient permissions)', () => {
            return MockVertexClass.createClass(db)
                .then((mockClass) => {
                    return mockClass.createRecord(null, 'Martin')                
                        .then((mockRecord) => {
                            expect(mockRecord.content.created_by.username).to.equal('Martin');
                                return mockClass.deleteRecord(mockRecord, 'Wei')
                                    .then(() => {
                                        expect.fail('PermissionError');
                                    }).catch(PermissionError, () => {});
                        });
                })
        });

        it('KBVertex.updateRecord (Ontology) (insufficient permissions)', () => {
            let contextClass, ontologyClass, diseaseClass;
            const disease = {name: 'name1', doid: 123};
            return Promise.all([
                    Context.createClass(db),
                    Ontology.createClass(db),
                    Disease.createClass(db),
                ]).then((clsList) => {
                    [contextClass, ontologyClass, diseaseClass] = clsList;
                }).then(() => {
                    return diseaseClass.createRecord(disease, 'Wei')
                        .then((diseaseRec) => {
                            const uuid = diseaseRec.content.uuid;
                            const version = diseaseRec.content.version;
                            diseaseRec.content.name = 'updatedName'
                            return diseaseClass.updateRecord(diseaseRec.content, 'Wei')
                                .then((updatedRec) => {
                                    expect(updatedRec.content.uuid).to.equal(uuid);
                                    expect(updatedRec.content.version).to.equal(version + 1);
                                    expect(updatedRec.content).to.include.keys('created_by');
                                }).catch((error) => {
                                    expect(error).to.be.an.instanceof(PermissionError);
                                });
                    }).catch((error) => {
                                expect(error).to.be.an.instanceof(PermissionError);
                    });
                });
        });

        it('KBEdge.createRecord (Ontology) (insufficient permissions)', () => {
            let contextClass, ontologyClass, ontologyAliasOfClass, diseaseClass;
            const entry_disease = {name: 'name1', doid: 123};
            const secondEntry_disease = {name: 'name2', doid: 123};
            return Promise.all([
                    Context.createClass(db),
                    Ontology.createClass(db),
                    OntologyAliasOf.createClass(db),
                    Disease.createClass(db),
                ]).then((clsList) => {
                    [contextClass, ontologyClass, ontologyAliasOfClass, diseaseClass] = clsList;
                }).then(() => {
                    return Promise.all([
                        diseaseClass.createRecord(entry_disease, 'Wei'),
                        diseaseClass.createRecord(secondEntry_disease, 'Wei')
                    ]).then((recList) => {
                        return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]}, 'admin');
                    }).then((edge) => {
                        expect(edge.content.created_by).to.include.keys('username', 'role');
                    }).catch((error) => {
                       expect(error).to.be.an.instanceof(PermissionError); 
                    });
                });
        });

        it('KBVertex.createRecord (Analyst with no ontology access)', () => {
            return MockVertexClass.createClass(db)
                .then((mockClass) => {
                    return mockClass.createRecord(null, 'Martin');                
                        }).then((mockRecord) => {
                            expect(mockRecord.content.created_by.username).to.equal('Martin');
                        });
        });

        it('KBVertex.updateRecord (Ontology) (Analyst with no ontology access)', () => {
            let contextClass, ontologyClass, diseaseClass;
            const disease = {name: 'name1', doid: 123};
            return Promise.all([
                    Context.createClass(db),
                    Ontology.createClass(db),
                    Disease.createClass(db),
                ]).then((clsList) => {
                    [contextClass, ontologyClass, diseaseClass] = clsList;
                }).then(() => {
                    return diseaseClass.createRecord(disease, 'Martin')
                        .then((diseaseRec) => {
                            const uuid = diseaseRec.content.uuid;
                            const version = diseaseRec.content.version;
                            diseaseRec.content.name = 'updatedName'
                            return diseaseClass.updateRecord(diseaseRec.content, 'Martin')
                                .then((updatedRec) => {
                                    expect(updatedRec.content.uuid).to.equal(uuid);
                                    expect(updatedRec.content.version).to.equal(version + 1);
                                    expect(updatedRec.content).to.include.keys('created_by');
                                }).catch((error) => {
                                    expect(error).to.be.an.instanceof(PermissionError);
                                });
                    });
                });
        });

        it('KBEdge.createRecord (ontology) (Analyst with no ontology access)', () => {
            let contextClass, ontologyClass, ontologyAliasOfClass, diseaseClass;
            const entry_disease = {name: 'name1', doid: 123};
            const secondEntry_disease = {name: 'name2', doid: 123};
            return Promise.all([
                    Context.createClass(db),
                    Ontology.createClass(db),
                    OntologyAliasOf.createClass(db),
                    Disease.createClass(db),
                ]).then((clsList) => {
                    [contextClass, ontologyClass, ontologyAliasOfClass, diseaseClass] = clsList;
                }).then(() => {
                    return Promise.all([
                        diseaseClass.createRecord(entry_disease,'Martin'),
                        diseaseClass.createRecord(secondEntry_disease, 'Martin')
                    ]).then((recList) => {
                        return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]}, 'admin');
                    }).then((edge) => {
                        expect(edge.content.created_by).to.include.keys('username', 'role');
                    }).catch((error) => {
                       expect(error).to.be.an.instanceof(PermissionError); 
                    });
                });
        });

        it('KBVertex.createRecord (suspended analyst with no ontology access)', () => {
            return MockVertexClass.createClass(db)
                .then((mockClass) => {
                    return mockClass.createRecord(null, 'Simon');                
                        }).then((mockRecord) => {
                            expect(mockRecord.content.created_by.username).to.equal('Simon');
                        }).catch((error) => {
                            expect(error).to.be.an.instanceof(AuthenticationError);
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
})