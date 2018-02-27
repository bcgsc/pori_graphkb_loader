'use strict';
const {expect} = require('chai');
const {AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const Promise = require('bluebird');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDeprecatedBy} = require('./../../app/repo/ontology');
const {setUpEmptyDB, tearDownEmptyDB} = require('./util');


describe('Ontology schema tests:', () => {
    let server, db;
    beforeEach(async () => { 
        ({server, db, user} = await setUpEmptyDB());
        await Context.createClass(db);
    });

    it('create the "Ontology" class', () => {
        return Ontology.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(Ontology);
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at');
                expect(result.isAbstract).to.be.true;
            });
    });
    it('errors adding a record to the abstract ontology class', async () => {
        try {
            await Ontology.createClass(db);
        } catch (err) {
            return;
        }
        expect.fail();
    });

    describe('Ontology subclasses', () => {
        beforeEach(async function() {
            await Ontology.createClass(db);
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
            beforeEach(async () => {
                await Disease.createClass(db);
            });

            it('errors on disease active name not unique', () => {
                const entry = {name: 'name', doid: 123};
                return db.models.Disease.createRecord(entry, 'me')
                    .then(() => {
                        return db.models.Disease.createRecord(entry, 'me');
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
                return db.models.Disease.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                        return db.models.Disease.createRecord(secondEntry, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                    });
            });

            it('allows name duplicates when one node is modified', () => {
                const entry = {name: 'name1', doid: 123};
                return db.models.Disease.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                        record.content.doid = 1234;
                        return db.models.Disease.updateRecord(record, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'doid', 'uuid', 'deleted_at', 'created_at');
                    });
            });
        });

        describe('therapy indices', () => {
            beforeEach(async () => {
                await Therapy.createClass(db);
            });

            it('errors on therapy active name not unique', () => {
                const entry = {name: 'name'};
                return db.models.Therapy.createRecord(entry, 'me')
                    .then(() => {
                        return db.models.Therapy.createRecord(entry, 'me');
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
                return db.models.Therapy.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'uuid', 'deleted_at', 'created_at');
                        return db.models.Therapy.createRecord(secondEntry, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'uuid', 'deleted_at', 'created_at');
                    });
            });

            it('allows therapy name duplicates when one node is modified', () => {
                const entry = {name: 'name1'};
                return db.models.Therapy.createRecord(entry, 'me')
                    .then((record) => {
                        expect(record.content).to.include.keys('name', 'uuid', 'deleted_at', 'created_at');
                        record.content.doid = 1234;
                        return db.models.Therapy.updateRecord(record, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then((record2) => {
                        expect(record2.content).to.include.keys('name', 'uuid', 'deleted_at', 'created_at');
                    });
            });
        });
    });

    afterEach(async () => {
        /* disconnect from the database */
        await server.drop({name: conf.emptyDbName});
        await server.close();
    });
});

describe('Ontology Edges (Therapy & Disease)', () => {
    let server, db;
    beforeEach(async () => { /* build and connect to the empty database */
        // set up the database server
        server = await connectServer({host: conf.databaseHost, port: conf.databasePort, user: conf.databaseServerUser, pass: conf.databaseServerPass});
        const exists = await server.exists({name: conf.emptyDbName});
        if (exists) {
            await server.drop({name: conf.emptyDbName});
        }
        db = await createDB({
            name: conf.emptyDbName, 
            user: conf.databaseUser, 
            pass: conf.databasePass, 
            server: server,
            heirarchy: [
                [KBRole, History],
                [KBUser],
                [KBVertex, KBEdge],
                [Context],
                [Ontology],
                [OntologyAliasOf, OntologySubClassOf, OntologyRelatedTo, OntologyDeprecatedBy, Disease, Therapy]
            ]
        });
        await db.models.KBRole.createRecord({name: 'admin', rules: {'kbvertex': PERMISSIONS.ALL}});
        await db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
    });

    it('allows an Ontology AliasOf between disease nodes with different doids', () => {
        const entry_disease = {name: 'name1', doid: 123};
        const secondEntry_disease = {name: 'name2', doid: 123};
        return Promise.all([
            db.models.Disease.createRecord(entry_disease, 'me'),
            db.models.Disease.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologyAliasOf.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            db.models.Disease.createRecord(entry_therapy, 'me'),
            db.models.Disease.createRecord(secondEntry_therapy, 'me')
        ]).then((recList) => {
            return db.models.OntologyAliasOf.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            db.models.Disease.createRecord(entry_disease, 'me'),
            db.models.Disease.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologySubClassOf.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        });
    });
    
    it('allows an OntologySubClassOf edge between therapy nodes', () => {
        const entry_disease = {name: 'name1'};
        const secondEntry_disease = {name: 'name2'};
        return Promise.all([
            db.models.Therapy.createRecord(entry_disease, 'me'),
            db.models.Therapy.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologySubClassOf.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        });
    });

    it('errors when creating an OntologySubClassOf edge between disease nodes with identical doids', () => {
        const entry_disease = {name: 'name1', doid: 1234};
        const secondEntry_disease = {name: 'name2', doid: 1234};
        return Promise.all([
            db.models.Disease.createRecord(entry_disease, 'me'),
            db.models.Disease.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologySubClassOf.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((record) => {
            console.log('record:', record);
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });

    it('errors when creating an OntologySubClassOf edge between therapy nodes with identical names', () => {
        const entry_disease = {name: 'name1'};
        return db.models.Therapy.createRecord(entry_disease, 'me')
            .then((rec) => {
                return db.models.OntologySubClassOf.createRecord({in: rec, out: rec}, 'me');
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
            db.models.Disease.createRecord(entry_disease, 'me'),
            db.models.Disease.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologyRelatedTo.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            db.models.Therapy.createRecord(entry_disease, 'me'),
            db.models.Therapy.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologyRelatedTo.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            db.models.Disease.createRecord(entry_disease, 'me'),
            db.models.Disease.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologyRelatedTo.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            db.models.Disease.createRecord(entry_disease, 'me'),
            db.models.Disease.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologyDeprecatedBy.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            db.models.Therapy.createRecord(entry_disease, 'me'),
            db.models.Therapy.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologyDeprecatedBy.createRecord({in: recList[0], out: recList[1]}, 'me');
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
            db.models.Disease.createRecord(entry_disease, 'me'),
            db.models.Disease.createRecord(secondEntry_disease, 'me')
        ]).then((recList) => {
            return db.models.OntologyDeprecatedBy.createRecord({in: recList[0], out: recList[1]}, 'me');
        }).then((edge) => {
            expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    
    afterEach(async () => {
        tearDownEmptyDB(server);
    });
});
