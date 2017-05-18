'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History, Record} = require('./../../app/repo/base');
const {ControlledVocabularyError, AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const Promise = require('bluebird');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDepricatedBy} = require('./../../app/repo/ontology');

describe('Ontology schema tests:', () => {
    let server, db, contextClass;
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
                    models: {KBVertex, KBEdge, History}
                });
            }).then((result) => {
                db = result.db;
                return Promise.all([
                    Context.createClass(db)
                ]);
            }).then((clsList) => {
                [contextClass] = clsList;
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
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at')
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.true;
                expect(result.dbClass.superClass).to.equal('context');
            });
    });
    it('create an ontology record (should fail)', () => {
        return Ontology.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then((result) => {
                return result.createRecord(); // test creating a record?
            }).then((result) => {
                expect.fail('violated constraint should have thrown error');
            }, (error) => {
                return oError.expectAbstractClassError(error);
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
                    expect(result.propertyNames).to.include('name', 'id', 'xref', 'definition', 'url', 'uuid', 'created_at', 'deleted_at', 'version');
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "Therapy" class', () => {
            return Therapy.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('name', 'id','uuid', 'created_at', 'deleted_at', 'version');
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });    

        it('create the "OntologySubClassOf" class', () => {
            return OntologySubClassOf.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "OntologyAliasOf" class', () => {
            return OntologyAliasOf.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "OntologyRelatedTo" class', () => {
            return OntologyRelatedTo.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "OntologyDepricatedBy" class', () => {
            return OntologyDepricatedBy.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(result).to.have.property('dbClass');
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
                return currClass.createRecord(entry)
                    .then((record) => {
                        return currClass.createRecord(entry);
                    }, (error) => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
                    });
            });

            it('allows disease ontology duplicates', () => {
                const entry = {name: 'name1', doid: 123};
                const secondEntry = {name: 'name2', doid: 123};
                return currClass.createRecord(entry)
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                        return currClass.createRecord(secondEntry);
                    }, (error) => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                    });
            });

            it('allows name duplicates when one node is deleted', () => {
                const entry = {name: 'name1', doid: 123};
                return currClass.createRecord(entry)
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                        record.content.doid = 1234;
                        return currClass.updateRecord(record.content);
                    }, (error) => {
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
                const entry = {name: 'name', id: 123};
                return currClass.createRecord(entry)
                    .then((record) => {
                        return currClass.createRecord(entry);
                    }, (error) => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
                    });
            });

            it('allows therapy ontology duplicates', () => {
                const entry = {name: 'name1', id: 123};
                const secondEntry = {name: 'name2', id: 123};
                return currClass.createRecord(entry)
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'id', 'uuid', 'deleted_at', 'created_at');
                        return currClass.createRecord(secondEntry);
                    }, (error) => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'id', 'uuid', 'deleted_at', 'created_at');
                    });
            });

            it('allows therapy name duplicates when one node is deleted', () => {
                const entry = {name: 'name1', id: 123};
                return currClass.createRecord(entry)
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'id', 'uuid', 'deleted_at', 'created_at');
                        record.content.doid = 1234;
                        return currClass.updateRecord(record.content);
                    }, (error) => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'id', 'uuid', 'deleted_at', 'created_at');
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

// test OntologyDeprecatedBy
describe('Ontology Edges (Therapy & Disease)', () => {
    let server, db, contextClass, ontologyClass, ontologyAliasOfClass, ontologySubClassOfClass, ontologyRelatedToClass, ontologyDepricatedByClass, diseaseClass, therapyClass;
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
                    models: {KBVertex, KBEdge, History}
                });
            }).then((result) => {
                db = result.db;
                return Promise.all([
                    Context.createClass(db),
                    Ontology.createClass(db),
                    OntologyAliasOf.createClass(db),
                    OntologySubClassOf.createClass(db),
                    OntologyRelatedTo.createClass(db),
                    OntologyDepricatedBy.createClass(db),
                    Disease.createClass(db),
                    Therapy.createClass(db)
                ]);
            }).then((clsList) => {
                [contextClass, ontologyClass, ontologyAliasOfClass, ontologySubClassOfClass, ontologyRelatedToClass, ontologyDepricatedByClass, diseaseClass, therapyClass] = clsList;
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });

    it('allows an Ontology AliasOf between disease nodes with different doids', () => {
        const entry_disease = {name: 'name1', doid: 123};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease),
            diseaseClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    it('allows an OntologyAliasOf edge between therapy nodes with identical doids', () => {
        const entry_therapy = {name: 'name1', id: 123};
        const secondEntry_therapy = {name: 'name2', id: 123};
        return Promise.all([
            therapyClass.createRecord(entry_therapy),
            therapyClass.createRecord(secondEntry_therapy)
        ]).then((recList) => {
            return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]});
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
            diseaseClass.createRecord(entry_therapy),
            diseaseClass.createRecord(secondEntry_therapy)
        ]).then((recList) => {
            return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('errors when creating an OntologyAliasOf edge between therapy nodes with different ids', () => {
        const entry_therapy = {name: 'name1', id: 123};
        const secondEntry_therapy = {name: 'name2', id: 12345};
        return Promise.all([
            therapyClass.createRecord(entry_therapy),
            therapyClass.createRecord(secondEntry_therapy)
        ]).then((recList) => {
            return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('allows an OntologySubClassOf edge between disease nodes', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease),
            diseaseClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    it('allows an OntologySubClassOf edge between therapy nodes', () => {
        const entry_disease = {name: 'name1', id: 1234};
        const secondEntry_disease = {name: 'name2', id: 123};
        return Promise.all([
            therapyClass.createRecord(entry_disease),
            therapyClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('errors when creating an OntologySubClassOf edge between disease nodes with identical doids', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease),
            diseaseClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('errors when creating an OntologySubClassOf edge between therapy nodes with identical ids', () => {
        const entry_disease = {name: 'name1', id: 1234};
        const secondEntry_disease = {name: 'name2', id: 1234};
        return Promise.all([
            therapyClass.createRecord(entry_disease),
            therapyClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('allows an OntologyRelatedTo edge between disease nodes', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease),
            diseaseClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyRelatedToClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    it('allows an OntologyRelatedTo edge between therapy nodes', () => {
        const entry_disease = {name: 'name1', id: 1234};
        const secondEntry_disease = {name: 'name2', id: 123};
        return Promise.all([
            therapyClass.createRecord(entry_disease),
            therapyClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyRelatedToClass.createRecord({in: recList[0], out: recList[1]});
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
            diseaseClass.createRecord(entry_disease),
            diseaseClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyRelatedToClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    it('errors when creating an OntologyRelatedTo edge between therapy nodes with identical ids', () => {
        const entry_disease = {name: 'name1', id: 1234};
        const secondEntry_disease = {name: 'name2', id: 1234};
        return Promise.all([
            therapyClass.createRecord(entry_disease),
            therapyClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyRelatedToClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

        it('allows an OntologyDepricatedBy edge between disease nodes', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            diseaseClass.createRecord(entry_disease),
            diseaseClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyDepricatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    it('allows an OntologyDepricatedBy edge between therapy nodes', () => {
        const entry_disease = {name: 'name1', id: 1234};
        const secondEntry_disease = {name: 'name2', id: 123};
        return Promise.all([
            therapyClass.createRecord(entry_disease),
            therapyClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyDepricatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('allows an OntologyDepricatedBy edge between disease nodes with identical doids', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 1234};
        return Promise.all([
            diseaseClass.createRecord(entry_disease),
            diseaseClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyDepricatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    it('allows an OntologyDepricatedBy edge between therapy nodes with identical ids', () => {
        const entry_disease = {name: 'name1', id: 1234};
        const secondEntry_disease = {name: 'name2', id: 1234};
        return Promise.all([
            therapyClass.createRecord(entry_disease),
            therapyClass.createRecord(secondEntry_disease)
        ]).then((recList) => {
            return ontologyDepricatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
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