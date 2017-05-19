"use strict";
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');
const _ = require('lodash');
const {DependencyError, AttributeError} = require('./../../app/repo/error');
const {Base, History, KBVertex, KBEdge} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');
const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./../../app/repo/evidence');
const moment = require('moment');


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
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at')
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
                    expect(result.propertyNames).to.include('year', 'title', 'doi', 'pmid','version','created_at','deleted_at');
                    expect(result.isAbstract).to.be.false;
                });
        });
        it('create journal class', () => {
            return Journal.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Journal);
                    expect(result).to.have.property('dbClass');
                    expect(result.propertyNames).to.include('name','version','created_at','deleted_at');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create ExternalSource class', () => {
            return ExternalSource.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(ExternalSource);
                    expect(result).to.have.property('dbClass');
                    expect(result.propertyNames).to.include('title', 'extractionDate', 'url','version','created_at','deleted_at');
                    expect(result.isAbstract).to.be.false;
                });
        });
        it('create study class', () => {
            return Study.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Study);
                    expect(result).to.have.property('dbClass');
                    expect(result.propertyNames).to.include('title', 'year', 'sample_population', 'sample_population_size', 'method', 'url','version','created_at','deleted_at');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('study subclasses', () => {
            beforeEach(function(done) {
                Study.createClass(db)
                    .then(() => {
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });

            it('create clinicalTrial class', () => {
            return ClinicalTrial.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(ClinicalTrial);
                    expect(result).to.have.property('dbClass');
                    expect(result.propertyNames).to.include('sample_population','phase', 'trialID', 'officialTitle', 'summary','version','created_at','deleted_at');
                    expect(result.isAbstract).to.be.false;
                    expect(result.dbClass.superClass).to.equal('study')
                });
            });

        });

        describe('publication constraints', () => {
            let pubClass, journalClass;
            beforeEach(function(done) {
                Promise.all([
                    Publication.createClass(db),
                    Journal.createClass(db)
                    ]).then((results) => {
                        [pubClass, journalClass] = results;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('test null/undefined error', () => {
                return pubClass.createRecord({title: 'title', year: 2008}, journalClass)
                    .then((result) => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('test mandatory props', () => {
                return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}}, journalClass)
                    .then((result) => {
                        expect(result).to.have.property('journal');
                        expect(result).to.have.property('year');
                        expect(result).to.have.property('title');
                        // should not have
                        expect(result).not.to.have.property('doi');
                        expect(result).not.to.have.property('pmid');
                    });
            });
            it('test mandatory props with future pulication date', () => {
                return pubClass.createRecord({title: 'title', year: 2018, journal: {name: 'journal'}}, journalClass)
                    .then((result) => {
                        expect.fail('invalid attribute. should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('duplicate entries', () => {
                return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}}, journalClass)
                    .then((result) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}}, journalClass);
                    }).then(() => {
                        expect.fail('violated unqiue constraint. error expected');             
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return pubClass.createRecord({title: 'title', year: 'year',  journal: {name: 'journal'},  invalid_attribute: 2}, journalClass)
                    .then((result) => {
                        expect.fail('invalid attribute. should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
        });

        describe('study constraints', () => {
            let currClass = null;
            beforeEach(function(done) {
                Study.createClass(db)
                    .then((studyClass) => {
                        currClass = studyClass;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('test mandatory props', () => {
                return currClass.createRecord({title: 'title', year: 2008})
                    .then((record) => {
                        expect(record).to.have.property('title');
                        expect(record).to.have.property('year');
                        // should not have
                        expect(record).not.to.have.property('sample_population');
                        expect(record).not.to.have.property('sample_population_size');
                        expect(record).not.to.have.property('method');
                        expect(record).not.to.have.property('url'); 
                    });
            });
            it('null for mandatory porps error', () => {
                return currClass.createRecord({title: 'title'})
                    .then((result) => {
                        expect.fail('violated null constraint. expected error');
                    }).catch((error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('duplicate protocol', () => {
                return currClass.createRecord({title: 'title', year: 2008})
                    .then((result) => {
                        return currClass.createRecord({title: 'title', year: 2008});
                    }).then((result) => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('future study', () => {
                return currClass.createRecord({title: 'title', year: 2028})
                    .then((record) => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({title: 'title', year: 2008, invalid_attribute: 2})
                    .then((record) => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });

            describe('clinicalTrial constraints', () => {
                let mockClass = null;
                beforeEach(function(done) {
                    ClinicalTrial.createClass(db)
                        .then((clinicalClass) => {
                            mockClass = clinicalClass;
                            done();
                        }).catch((clinicalError) => {
                            done(clinicalError);
                        });
                });
                it('test mandatory props', () => {
                    return mockClass.createRecord({title: 'title', year: 2008})
                        .then((clinicalRecord) => {
                            expect(clinicalRecord).to.have.property('title');
                            expect(clinicalRecord ).to.have.property('year');
                            // should not have
                            expect(clinicalRecord).not.to.have.property('phase');
                            expect(clinicalRecord).not.to.have.property('trialID');
                            expect(clinicalRecord).not.to.have.property('officialTitle');
                            expect(clinicalRecord).not.to.have.property('summary'); 
                        });
                });
                it('null for mandatory porps error', () => {
                return currClass.createRecord({title: 'title'})
                    .then((result) => {
                        expect.fail('violated null constraint. expected error');
                    }).catch((error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
                });
                it('duplicate props except for phase', () => {
                    return mockClass.createRecord({title: 'title', year: 2008, phase: 2, trialID: 'trialID', officialTitle: 'trialID'})
                        .then((clinicalResult) => {
                            return mockClass.createRecord({title: 'title', year: 2008, phase: 3, trialID: 'trialID', officialTitle: 'trialID'});
                        }).then((clinicalResult) => {
                            expect.fail('expected error');                        
                        }).catch((clinicalError) => {
                            return oError.expectDuplicateKeyError(clinicalError);
                        });
                });
                it('invalid attribute', () => {
                    return mockClass.createRecord({title: 'title', year: 2008, invalid_attribute: 2})
                        .then((clinicalRecord) => {
                            expect.fail('invalid attribute. error is expected');
                        }).catch((clinicalError) => {
                            expect(clinicalError).to.be.an.instanceof(AttributeError);
                        });
                });
            });

        });

        describe('journal constraints', () => {
            let currClass = null;
            beforeEach(function(done) {
                Journal.createClass(db)
                    .then((esClass) => {
                        currClass = esClass;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('test mandatory props', () => {
                return currClass.createRecord({name: 'name'})
                    .then((record) => {
                        expect(record).to.have.property('uuid');
                        expect(record).to.have.property('version');
                        expect(record).to.have.property('created_at');
                        expect(record).to.have.property('deleted_at');
                        expect(record).to.have.property('name');
                    });
            });
            it('null for mandatory porps error', () => {
            return currClass.createRecord({})
                .then((result) => {
                    expect.fail('violated null constraint. expected error');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });
            it('duplicate entries', () => {
                return currClass.createRecord({name: 'Nature'})
                    .then((result) => {
                        return currClass.createRecord({name: 'naturE'});
                    }).then((result) => {
                        expect.fail('violatedexpected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({name: 'name', invalid_attribute: 2})
                    .then((record) => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
        });

        describe('externalSources constraints', () => {
            let currClass = null;
            beforeEach(function(done) {
                ExternalSource.createClass(db)
                    .then((esClass) => {
                        currClass = esClass;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('test mandatory props', () => {
                return currClass.createRecord({url: 'url', extractionDate: moment().unix() })
                    .then((record) => {
                        expect(record).to.have.property('uuid');
                        expect(record).to.have.property('version');
                        expect(record).to.have.property('created_at');
                        expect(record).to.have.property('deleted_at');
                        expect(record).to.have.property('url');
                        expect(record).to.have.property('extractionDate');
                        // should not have
                        expect(record).to.not.have.property('title');
                    });
            });
            it('null for mandatory porps error', () => {
            return currClass.createRecord({url: 'url'})
                .then((result) => {
                    expect.fail('violated null constraint. expected error');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });
            it('duplicate protocol', () => {
                return currClass.createRecord({url: 'url', extractionDate: 1346789987654})
                    .then((result) => {
                        return currClass.createRecord({url: 'url', extractionDate: 1346789987654});
                    }).then((result) => {
                        expect.fail('violatedexpected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({url: 'url', extractionDate: moment().unix(), invalid_attribute: 2})
                    .then((record) => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
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
                console.log('error closing the server', error);
                done(error);
            });
    })
});
