"use strict";
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');
const _ = require('lodash');
const {DependencyError, AttributeError} = require('./../../app/repo/error');
const {Base, History, KBVertex, KBEdge} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');
const {Evidence, Study, Publication, ExternalDB} = require('./../../app/repo/evidence');



describe('Evidence schema tests:', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        serverConnect(conf)
            .then((result) => {
                // create the empty database
                server = result;
                return server.create({name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
            }).then((result) => {
                db = result;
                return Promise.all([
                    KBVertex.createClass(db),
                    History.createClass(db),
                    KBEdge.createClass(db)
                ]);
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });
    it('test creating the evidence class', () => {
        return Evidence.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(Evidence);
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.true;
                expect(result.dbClass.superClass).to.equal('kbvertex');
            });
    });
    it('create an evidence record (should error)', () => {
        return Evidence.createClass(db)
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
    
    describe('evidence subclasses', () => {
        beforeEach(function(done) {
            Evidence.createClass(db)
                .then(() => {
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('create publication class', () => {
            return Publication.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Publication);
                    expect(result).to.have.property('dbClass');
                    expect(result.propertyNames).to.include('pubmed_id', 'title', 'journal', 'year');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the study class', () => {
            return Study.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Study);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });
        it.skip('create the ExternalDB class', () => {
            // TODO
            return ExternalDB.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(ExternalDB);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('publication constraints', () => {
            let pub = null;
            beforeEach(function(done) {
                Publication.createClass(db)
                    .then((result) => {
                        pub = result;
                        done();
                    }).catch((error) => {
                        done(error);
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
                        expect.fail('violated null constraint should have thrown error');
                    }).catch((error) => {
                        return oError.expectNullConstraintError(error);
                    });
            });
            it('pubmed duplicate error', () => {
                // TODO: account for versioning in index
                return pub.createRecord({title: 'title', pubmed_id: 1})
                    .then((result) => {
                        return pub.createRecord({title: 'title2', pubmed_id: 1});
                    }).then((result) => {
                        expect.fail('violated constraint should have thrown error');
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return pub.createRecord({title: 'title', pubmed_id: 1, invalid_attribute: 2})
                    .then((result) => {
                        expect.fail('invalid attribute. should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
        });
        // TODO: tests for study constraints
        // TODO: tests for externalDB constraints
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
    })
});
