'use strict';
const {expect} = require('chai');
const conf = require('./../config/empty');
const {admin, analyst, bioinfo} = require('./../../config/roles');
const {Context} = require('./../../app/repo/context');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {PermissionError, AuthenticationError, NoResultFoundError} = require('./../../app/repo/error');
const {Base, History, KBVertex, KBEdge, KBUser, KBRole} = require('./../../app/repo/base');
const {Ontology, Disease, OntologyAliasOf} = require('./../../app/repo/ontology');


// a non-abstract kbvertex class for testing purposes
class MockVertexClass extends KBVertex { 
    static createClass(db) {
        return Base.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname})
            .then(() => {
                return this.loadClass(db);
            });
    }
}


describe('KBUser & KBRole', () => {
    let db, server;
    beforeEach(function(done) { 
        connectServer(conf.server)
            .then((s) => {
                server = s;
                return createDB(Object.assign({server: s}, conf.db));
            }).then((result) => {
                db = result;
                done();
            }).catch((error) => {
                console.log('error in connecting to the server or creating the database', error);
                done(error);
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
            .then(() => {
                return KBUser.createClass(db)
                    .then((userCls) => {
                        expect(userCls.propertyNames).to.have.members(['active' ,'role' ,'username']);
                        expect(userCls.constructor.clsname).to.equal('kbuser');
                    });
            });
    });

    describe('instance tests', () => {
        let kbuserClass, kbroleClass;
        beforeEach(async () => {
            [kbroleClass, kbuserClass] = await Promise.all([
                KBRole.createClass(db),
                KBUser.createClass(db)
            ]);
            await Promise.all([
                kbroleClass.createRecord({name: 'admin', mode: 0, rules: admin}),
                kbroleClass.createRecord({name: 'analyst', mode: 0, rules: analyst}),
                kbroleClass.createRecord({name: 'bioinfo', mode: 0, rules: bioinfo}),
            ]);
            await Promise.all([
                kbuserClass.createRecord({username: 'admin', role: 'admin'}),
                kbuserClass.createRecord({username: 'Martin', role: 'analyst'}),
                kbuserClass.createRecord({username: 'Wei', role: 'bioinfo'}),
                kbuserClass.createRecord({username: 'Simon', role: 'analyst', active: false})
            ]);
            await Promise.all([
                KBVertex.createClass(db),
                KBEdge.createClass(db),
                History.createClass(db)
            ]);
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

        it('KBVertex.updateRecord (Ontology)', async () => {
            const disease = {name: 'name1', doid: 123};
            await Context.createClass(db)
            await Promise.all([
                Ontology.createClass(db),
                Disease.createClass(db),
            ]);
            const diseaseRec = db.models.Disease.createRecord(disease, 'admin');
            const uuid = diseaseRec.content.uuid;
            const version = diseaseRec.content.version;
            diseaseRec.content.name = 'updatedName';
            const updatedRec = await db.models.Disease.updateRecord(diseaseRec, 'admin')
            expect(updatedRec.content.uuid).to.equal(uuid);
            expect(updatedRec.content.version).to.equal(version + 1);
            expect(updatedRec.content).to.include.keys('created_by');
        });

        it('KBVertex.deleteRecord (Ontology updated record)', () => {
            const disease = {name: 'name1', doid: 123};
            return Context.createClass(db)
                .then(() => {
                    return Promise.all([
                        Ontology.createClass(db),
                        Disease.createClass(db),
                    ]);
                }).then(([ontologyClass, db.models.Disease]) => {
                    let uuid, version;
                    return db.models.Disease.createRecord(disease, 'admin')
                        .then((diseaseRec) => {
                            uuid = diseaseRec.content.uuid;
                            version = diseaseRec.content.version;
                            diseaseRec.content.name = 'updatedName';
                            return db.models.Disease.updateRecord(diseaseRec, 'admin');
                        }).then((updatedRec) => {
                            expect(updatedRec.content.uuid).to.equal(uuid);
                            expect(updatedRec.content.version).to.equal(version + 1);
                            expect(updatedRec.content).to.include.keys('created_by');
                            return db.models.Disease.deleteRecord(disease, 'admin');
                        }).then((record) => {
                            console.log('found: ', record);
                            expect.fail('expected NoResultFoundError');
                        }).catch((error) => {
                            if (! (error instanceof NoResultFoundError)) {
                                throw error;
                            }
                        });
                });
        });


        it('KBEdge.createRecord (Ontology)', () => {
            const entry_disease = {name: 'name1', doid: 123};
            const secondEntry_disease = {name: 'name2', doid: 123};
            return Promise.all([
                Context.createClass(db),
                Ontology.createClass(db),
                OntologyAliasOf.createClass(db),
                Disease.createClass(db),
            ]).then((clsList) => {
                db.models.Disease = clsList[3];
                db.models.OntologyAliasOf = clsList[2];
                return Promise.all([
                    db.models.Disease.createRecord(entry_disease, 'admin'),
                    db.models.Disease.createRecord(secondEntry_disease, 'admin')
                ]).then((recList) => {
                    return db.models.OntologyAliasOf.createRecord({in: recList[0], out: recList[1]}, 'admin');
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
                });
        });

        it('KBVertex.updateRecord (Ontology) (insufficient permissions)', () => {
            const disease = {name: 'name1', doid: 123};
            return Promise.all([
                Context.createClass(db),
                Ontology.createClass(db),
                Disease.createClass(db),
            ]).then((clsList) => {
                db.models.Disease = clsList[2];
                return db.models.Disease.createRecord(disease, 'Wei')
                    .then((diseaseRec) => {
                        const uuid = diseaseRec.content.uuid;
                        const version = diseaseRec.content.version;
                        diseaseRec.content.name = 'updatedName';
                        return db.models.Disease.updateRecord(diseaseRec, 'Wei')
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
            const entry_disease = {name: 'name1', doid: 123};
            const secondEntry_disease = {name: 'name2', doid: 123};
            return Promise.all([
                Context.createClass(db),
                Ontology.createClass(db),
                OntologyAliasOf.createClass(db),
                Disease.createClass(db),
            ]).then((clsList) => {
                db.models.Disease = clsList[3];
                db.models.OntologyAliasOf = clsList[2];
                return Promise.all([
                    db.models.Disease.createRecord(entry_disease, 'Wei'),
                    db.models.Disease.createRecord(secondEntry_disease, 'Wei')
                ]).then((recList) => {
                    return db.models.OntologyAliasOf.createRecord({in: recList[0], out: recList[1]}, 'admin');
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
            const disease = {name: 'name1', doid: 123};
            return Promise.all([
                Context.createClass(db),
                Ontology.createClass(db),
                Disease.createClass(db),
            ]).then((clsList) => {
                db.models.Disease = clsList[2];
                return db.models.Disease.createRecord(disease, 'Martin')
                        .then((diseaseRec) => {
                            const uuid = diseaseRec.content.uuid;
                            const version = diseaseRec.content.version;
                            diseaseRec.content.name = 'updatedName';
                            return db.models.Disease.updateRecord(diseaseRec, 'Martin')
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
            const entry_disease = {name: 'name1', doid: 123};
            const secondEntry_disease = {name: 'name2', doid: 123};
            return Promise.all([
                Context.createClass(db),
                Ontology.createClass(db),
                OntologyAliasOf.createClass(db),
                Disease.createClass(db),
            ]).then((clsList) => {
                return Promise.all([
                    db.models.Disease.createRecord(entry_disease,'Martin'),
                    db.models.Disease.createRecord(secondEntry_disease, 'Martin')
                ]).then((recList) => {
                    return db.models.OntologyAliasOf.createRecord({in: recList[0], out: recList[1]}, 'admin');
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
        server.drop({name: conf.db.name})
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
