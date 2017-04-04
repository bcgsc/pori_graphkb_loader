"use strict";
const {expect} = require('chai');
const conf = require('./../config/db');
const {models, createSchema, loadSchema, serverConnect} = require('./../../app/repo');
const _ = require('lodash');
const {augmentWithVersioning} = require('./../../app/repo/versioning')
const {DependencyError, AttributeError} = require('./../../app/repo/error');


describe('database schema tests (empty db)', () => {
    var server, db = null;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        console.log('\nconnecting to the server');
        serverConnect(conf)
            .then((result) => {
                server = result;
                return server.create({name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
            }).then((result) => {
                db = result;
                return db.class.list();
            }).then((clsList) => {
                done();
            }).catch((error) => {
                console.log('error in connecting', error);
                done(error);
            });
    });
    it('add the versioning superclass', () => {
        return augmentWithVersioning(db);
    });
    it('check property inheritance of versioning', () => {
        return augmentWithVersioning(db)
            .catch((error) => {
                throw DependencyError(error.message);
            }).then(() => {
                return models.Evidence.createClass(db);
            }).catch((error) => {
                throw DependencyError(error.message);
            }).then((result) => {
                expect(result.propertyNames).to.have.members(['uuid', 'created_at', 'edit_version', 'deleted_at']);
            });
    });
    it('create the evidence schema model', () => {
        return models.Evidence.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(models.Evidence);
                expect(result).to.have.property('dbClass');
                expect(result.properties).to.be.empty;
                expect(result.isAbstract).to.be.true;
            });
    });
    it('create an evidence record (should error)', () => {
        return models.Evidence.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then((result) => {
                return result.createRecord(); // test creating a record?
            }).then((result) => {
                throw new Error('expected error. class is abstract');
            }).catch((error) => {
                expect(error.type).to.equal('com.orientechnologies.orient.core.exception.OSchemaException');
                expect(error.name).to.equal('OrientDB.RequestError');
                expect(error.message).to.include('abstract class');
            });
    });
    it('create the evidence-publication schema model', () => {
        return models.Evidence.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then(() => {
                return models.Publication.createClass(db);
            }).then((result) => {
                expect(result).to.be.an.instanceof(models.Publication);
                expect(result).to.have.property('dbClass');
                expect(result.propertyNames).to.have.members(['pubmed_id', 'title', 'journal', 'year']);
                expect(result.isAbstract).to.be.false;
            });
    });
    describe('create publication records', () => {
        var pub = null;
        beforeEach((done) => {
            console.log('setting up the publication class');
            models.Evidence.createClass(db)
                .then((result) => {
                    return models.Publication.createClass(db);
                }).then((result) => {
                    pub = result;
                    done();
                }).catch((error) => {
                    done(new DependencyError(error.message));
                });
        });
        it('title only', () => {
            return pub.createRecord({title: 'title'})
                .then((result) => {
                    expect(result).to.have.property('uuid');
                    expect(result).to.have.property('title');
                    expect(result.title).to.equal('title');
                    // should not have 
                    expect(result).to.not.have.property('journal');
                    expect(result).to.not.have.property('year');
                });
        });
        it('null title error', () => {
            return pub.createRecord({title: null})
                .then((result) => {
                    throw new Error('Expected error. Violated title != null constraint');
                }).catch((error) => {
                    expect(error.type).to.equal('com.orientechnologies.orient.core.exception.OValidationException');
                    expect(error.name).to.equal('OrientDB.RequestError');
                    expect(error.message).to.include('cannot be null');
                });
        });
        it('pubmed duplicate error', () => {
            return pub.createRecord({title: 'title', pubmed_id: 1})
                .then((result) => {
                    return pub.createRecord({title: 'title2', pubmed_id: 1});
                }).then((result) => {
                    throw new Error('Expected error. Violated pubmed unique index constraint');
                }).catch((error) => {
                    expect(error.type).to.equal('com.orientechnologies.orient.core.storage.ORecordDuplicatedException');
                    expect(error.name).to.equal('OrientDB.RequestError');
                    expect(error.message).to.include('duplicated key');
                });
        });
        it('invalid attribute', () => {
            return pub.createRecord({title: 'title', pubmed_id: 1, invalid_attribute: 2})
                .then((result) => {
                    throw new Error('Expected error. Invalid attribute');
                }).catch((error) => {
                    expect(error).to.be.an.instanceof(AttributeError);
                });
        });
    });
    it('create the evidence-study schema model', () => {
        return models.Evidence.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then(() => {
                return models.Study.createClass(db);
            }).then((result) => {
                expect(result).to.be.an.instanceof(models.Study);
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.false;
            });
    });
    it('create the evidence-external_db schema model', () => {
        return models.Evidence.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then(() => {
                return models.ExternalDB.createClass(db);
            }).then((result) => {
                expect(result).to.be.an.instanceof(models.ExternalDB);
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.false;
            });
    });

    it('create the context schema model', () => {
        return models.Context.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(models.Context);
                expect(result).to.have.property('dbClass');
                expect(result.properties).to.be.empty;
                expect(result.isAbstract).to.be.true;
            });
    });
    it('create the context-evaluation model', () => {
        return models.Context.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then((result) => {
                return models.Evaluation.createClass(db);
            }).then((result) => {
                expect(result).to.be.an.instanceof(models.Evaluation);
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.false;
                expect(result.propertyNames).to.have.members(['consequence']);
            });
    });
    it('create the context-evaluation-comparison model', () => {
        return models.Context.createClass(db)
            .then(() => {
                return models.Evaluation.createClass(db);
            }).catch((error) => {
                throw new DependencyError(error.message);
            }).then((result) => {
                return models.Comparison.createClass(db);
            }).then((result) => {
                expect(result).to.be.an.instanceof(models.Comparison);
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.false;
                expect(result.propertyNames).to.have.members(['consequence']);
            });
    });
    it('create the context-feature model');
    it('create the context-disease model', () => {
        return models.Context.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then((result) => {
                return models.Disease.createClass(db);
            }).then((result) => {
                expect(result).to.be.an.instanceof(models.Disease);
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.false;
                expect(result.propertyNames).to.have.members(['name']);
            });
    });
    it('create the context-therapy model', () => {
        return models.Context.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then((result) => {
                return models.Therapy.createClass(db);
            }).then((result) => {
                expect(result).to.be.an.instanceof(models.Therapy);
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.false;
                expect(result.propertyNames).to.have.members(['name']);
            });
    });
    it('create the context-event model');
    it('create the context-event-vocab model');
    it('create the context-event-positional model');
    it('create the range model');
    it('create the position model');
    it('create the position-genomic model');
    it('create the position-cds model');
    it('create the position-protein model');
    it('create the position-cytoband model');
    it('create the position-exon model');
    it.skip('create the full schema', () => {
        return createSchema(db)
            .then((result) => {
                console.log('result', Object.keys(result));
                // check the abstract classes exist
                expect(result).to.have.all.keys([
                    'evidence', 'context', 'publication', 'feature', 'disease', 'therapy'
                ]);
                // check the evidence and subclasses
                expect(result.evidence).to.have.property('properties');
                expect(result.evidence.properties).to.have.members([]);
            });
    });
    afterEach((done) => {
        /* disconnect from the database */
        console.log('dropping the test database');
        server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                console.log('closing the server server');
                return server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error closing the server', error);
                done(error);
            });
    })
});
