'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./../../app/repo/base');
const {Vocab} = require('./../../app/repo/vocab');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const cache = require('./../../app/repo/cached/data');
const {ControlledVocabularyError, AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const Promise = require('bluebird');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDepricatedBy} = require('./../../app/repo/ontology');
const {PERMISSIONS} = require('./../../app/repo/constants');



describe('Ontology schema tests:', () => {
    let server, db, user;
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
            }).then((role) => {
                return db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
            }).then((result) => {
                user = result.content;
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
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at')
                expect(result.isAbstract).to.be.true;
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
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the "Therapy" class', () => {
            return Therapy.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('name', 'id','uuid', 'created_at', 'deleted_at', 'version');
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

        it('create the "OntologyDepricatedBy" class', () => {
            return OntologyDepricatedBy.createClass(db)
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
                    .then((record) => {
                        return currClass.createRecord(entry, 'me');
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
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                        return currClass.createRecord(secondEntry, 'me');
                    }, (error) => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                    });
            });

            it('allows name duplicates when one node is deleted', () => {
                const entry = {name: 'name1', doid: 123};
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                        record.content.doid = 1234;
                        return currClass.updateRecord(record.content, 'me');
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
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        return currClass.createRecord(entry, 'me');
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
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'id', 'uuid', 'deleted_at', 'created_at');
                        return currClass.createRecord(secondEntry, 'me');
                    }, (error) => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'id', 'uuid', 'deleted_at', 'created_at');
                    });
            });

            it('allows therapy name duplicates when one node is deleted', () => {
                const entry = {name: 'name1', id: 123};
                return currClass.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'id', 'uuid', 'deleted_at', 'created_at');
                        record.content.doid = 1234;
                        return currClass.updateRecord(record.content, 'me');
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

describe('Ontology Edges (Therapy & Disease)', () => {
    let server, db, user, ontologyClass, ontologyAliasOfClass, ontologySubClassOfClass, ontologyRelatedToClass, ontologyDepricatedByClass, diseaseClass, therapyClass;
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
            }).then((role) => {
                return db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
            }).then((result) => {
                user = result.content;
            }).then(() => {
                return Promise.all([                    
                    Ontology.createClass(db),
                    OntologyAliasOf.createClass(db),
                    OntologySubClassOf.createClass(db),
                    OntologyRelatedTo.createClass(db),
                    OntologyDepricatedBy.createClass(db),
                    Disease.createClass(db),
                    Therapy.createClass(db)
                    ]).then((clsList) => {
                        [ontologyClass, ontologyAliasOfClass, ontologySubClassOfClass, ontologyRelatedToClass, ontologyDepricatedByClass, diseaseClass, therapyClass] = clsList;
                        done();
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
    it('allows an OntologyAliasOf edge between therapy nodes with identical doids', () => {
        const entry_therapy = {name: 'name1', id: 123};
        const secondEntry_therapy = {name: 'name2', id: 123};
        return Promise.all([
            therapyClass.createRecord(entry_therapy, 'me'),
            therapyClass.createRecord(secondEntry_therapy, 'me')
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
            therapyClass.createRecord(entry_therapy, 'me'),
            therapyClass.createRecord(secondEntry_therapy, 'me')
        ]).then((recList) => {
            return ontologyAliasOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            therapyClass.createRecord(entry_disease, 'me'),
            therapyClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            therapyClass.createRecord(entry_disease, 'me'),
            therapyClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologySubClassOfClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
        const entry_disease = {name: 'name1', id: 1234};
        const secondEntry_disease = {name: 'name2', id: 123};
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
            therapyClass.createRecord(entry_disease, 'me'),
            therapyClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyRelatedToClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyDepricatedByClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            therapyClass.createRecord(entry_disease, 'me'),
            therapyClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyDepricatedByClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            diseaseClass.createRecord(entry_disease, 'me'),
            diseaseClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyDepricatedByClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            therapyClass.createRecord(entry_disease, 'me'),
            therapyClass.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return ontologyDepricatedByClass.createRecord({in: recList[0], out: recList[1]}, 'me');
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