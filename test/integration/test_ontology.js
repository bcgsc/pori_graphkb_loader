'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./../../app/repo/base');
const {AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const Promise = require('bluebird');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDeprecatedBy} = require('./../../app/repo/ontology');
const {PERMISSIONS} = require('./../../app/repo/constants');


describe('Ontology schema tests:', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        connectServer(conf)
            .then((result) => {
                // create the empty database
                server = result;
                return createDB({
                    name: conf.emptyDbName, 
                    username: conf.dbUsername,
                    password: conf.dbPassword,
                    server: server,
                    heirarchy: [
                        [KBRole, History],
                        [KBUser],
                        [KBVertex, KBEdge],
                        [Context]
                    ]
                });
            }).then((result) => {
                db = result;
            }).then(() => {
                return db.models.KBRole.createRecord({name: 'admin', rules: {'kbvertex': PERMISSIONS.ALL, 'kbedge': PERMISSIONS.ALL}});
            }).then(() => {
                return db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });

    it('create the "Ontology" class', () => {
        return Ontology.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(Ontology);
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at');
                expect(result.isAbstract).to.be.true;
            });
    });
    it('errors adding a record to the abstract ontology class', () => {
        Ontology.createClass(db)
            .then(() => {
                expect.fail('expected an error');
            }).catch((error) => {
                console.log(error);
            });
    });

    describe('Ontology subclasses', () => {
        beforeEach(function(done) {
            Ontology.createClass(db)
                .then(() => {
                    done();
                }).catch((error) => {
                    done(error);
                });
        });

        it('create the "Disease" class', () => {
            return Disease.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('name', 'xref', 'definition', 'url', 'uuid', 'created_at', 'deleted_at', 'version');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "Therapy" class', () => {
            return Therapy.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('name', 'uuid', 'created_at', 'deleted_at', 'version');
                    expect(result.isAbstract).to.be.false;
                });
        });    

        it('create the "OntologySubClassOf" class', () => {
            return OntologySubClassOf.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "OntologyAliasOf" class', () => {
            return OntologyAliasOf.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "OntologyRelatedTo" class', () => {
            return OntologyRelatedTo.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "OntologyDeprecatedBy" class', () => {
            return OntologyDeprecatedBy.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('disease indices', () => {
            let currClass;
            beforeEach((done) => {
                Disease.createClass(db)
                    .then((cls) => {
                        currClass = cls;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });

            it('errors on disease active name not unique', () => {
                const entry = {name: 'name', doid: 123};
                return currClass.createRecord(entry, 'me')
                    .then(() => {
                        return currClass.createRecord(entry, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then(() => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
                    });
            });

            it('allows disease ontology duplicates', () => {
                const entry = {name: 'name1', doid: 123};
                const secondEntry = {name: 'name2', doid: 123};
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                        return currClass.createRecord(secondEntry, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                    });
            });

            it('allows name duplicates when one node is modified', () => {
                const entry = {name: 'name1', doid: 123};
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                        record.content.doid = 1234;
                        return currClass.updateRecord(record, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                    });
            });
        });

        describe('therapy indices', () => {
            let currClass;
            beforeEach((done) => {
                Therapy.createClass(db)
                    .then((cls) => {
                        currClass = cls;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });

            it('errors on therapy active name not unique', () => {
                const entry = {name: 'name'};
                return currClass.createRecord(entry, 'me')
                    .then(() => {
                        return currClass.createRecord(entry, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then(() => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
                    });
            });

            it('allows therapy nodes with different names', () => {
                const entry = {name: 'name1'};
                const secondEntry = {name: 'name2'};
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'uuid', 'deleted_at', 'created_at');
                        return currClass.createRecord(secondEntry, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'uuid', 'deleted_at', 'created_at');
                    });
            });

            it('allows therapy name duplicates when one node is modified', () => {
                const entry = {name: 'name1'};
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'uuid', 'deleted_at', 'created_at');
                        record.content.doid = 1234;
                        return currClass.updateRecord(record, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'uuid', 'deleted_at', 'created_at');
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
                done(error);
            });
    });
});

describe('Ontology Edges (Therapy & Disease)', () => {
    let server, db, ontologyAliasOfClass, ontologySubClassOfClass, ontologyRelatedToClass, ontologyDeprecatedByClass, diseaseClass, therapyClass;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        connectServer(conf)
            .then((result) => {
                // create the empty database
                server = result;
                return createDB({
                    name: conf.emptyDbName, 
                    username: conf.dbUsername,
                    password: conf.dbPassword,
                    server: server,
                    heirarchy: [
                        [KBRole, History],
                        [KBUser],
                        [KBVertex, KBEdge],
                        [Context]
                    ]
                });
            }).then((result) => {
                db = result;
            }).then(() => {
                return db.models.KBRole.createRecord({name: 'admin', rules: {'kbvertex': PERMISSIONS.ALL, 'kbedge': PERMISSIONS.ALL}});
            }).then(() => {
                return db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
            }).then(() => {
                return Ontology.createClass(db)
                .then(() => {
                    return Promise.all([                    
                        OntologyAliasOf.createClass(db),
                        OntologySubClassOf.createClass(db),
                        OntologyRelatedTo.createClass(db),
                        OntologyDeprecatedBy.createClass(db),
                        Disease.createClass(db),
                        Therapy.createClass(db)
                    ]).then((clsList) => {
                        [ontologyAliasOfClass, ontologySubClassOfClass, ontologyRelatedToClass, ontologyDeprecatedByClass, diseaseClass, therapyClass] = clsList;
                        done();
                    });
                });
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });

    it('allows an Ontology AliasOf between disease nodes with different doids', () => {
        const entry_disease = {name: 'name1', doid: 123};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('errors when creating an OntologyAliasOf edge between disease nodes with different doids', () => {
        const entry_therapy = {name: 'name1', doid: 123};
        const secondEntry_therapy = {name: 'name2', doid: 12345};
        return Promise.all([
            diseaseClass.createRecord(entry_therapy, 'me'),
            diseaseClass.createRecord(secondEntry_therapy, 'me')
        ]).then((recList) => {
            return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then(() => {
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('allows an OntologySubClassOf edge between disease nodes', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        });
    });
    
    it('allows an OntologySubClassOf edge between therapy nodes', () => {
        const entry_disease = {name: 'name1'};
        const secondEntry_disease = {name: 'name2'};
        return Promise.all([
            therapyClass.createRecord(entry_disease, 'me'),
            therapyClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        });
    });

    it('errors when creating an OntologySubClassOf edge between disease nodes with identical doids', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 1234};
        return Promise.all([
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((record) => {
            console.log('record:', record);
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('errors when creating an OntologySubClassOf edge between therapy nodes with identical names', () => {
        const entry_disease = {name: 'name1'};
        return therapyClass.createRecord(entry_disease, 'me')
            .then((rec) => {
                return ontologySubClassOfClass.createRecord({in: rec, out: rec}, 'me');
            }).then(() => {
                expect.fail('should not have been able to create the record');
            }, (error) => {
                expect(error).to.be.instanceof(AttributeError);
            });
    });

    it('allows an OntologyRelatedTo edge between disease nodes', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyRelatedToClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    it('allows an OntologyRelatedTo edge between therapy nodes', () => {
        const entry_disease = {name: 'name1'};
        const secondEntry_disease = {name: 'name2'};
        return Promise.all([
            therapyClass.createRecord(entry_disease, 'me'),
            therapyClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyRelatedToClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('errors when creating an OntologyRelatedTo edge between disease nodes with identical doids', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 1234};
        return Promise.all([
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyRelatedToClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then(() => {
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    it('allows an OntologyDeprecatedBy edge between disease nodes', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyDeprecatedByClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    it('allows an OntologyDeprecatedBy edge between therapy nodes', () => {
        const entry_disease = {name: 'name1'};
        const secondEntry_disease = {name: 'name2'};
        return Promise.all([
            therapyClass.createRecord(entry_disease, 'me'),
            therapyClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyDeprecatedByClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('allows an OntologyDeprecatedBy edge between disease nodes with identical doids', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 1234};
        return Promise.all([
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyDeprecatedByClass.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    afterEach((done) => {
        /* disconnect from the database */
        db.server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                return db.server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                done(error);
            });
    });
});
