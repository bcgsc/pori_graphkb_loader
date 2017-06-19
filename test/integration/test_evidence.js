'use strict';
const {expect} = require('chai');
const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./../../app/repo/evidence');
const moment = require('moment');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./../../app/repo/base');
const {Vocab} = require('./../../app/repo/vocab');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const cache = require('./../../app/repo/cached/data');
const {ControlledVocabularyError, AttributeError, DependencyError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const Promise = require('bluebird');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDepricatedBy} = require('./../../app/repo/ontology');
const {PERMISSIONS} = require('./../../app/repo/constants');
const oError = require('./orientdb_errors');

describe('Evidence schema tests:', () => {
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
    it('test creating the evidence class', () => {
        return Evidence.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(Evidence);
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at')
                expect(result.isAbstract).to.be.true;
            });
    });
    it('create an evidence record (should error)', () => {
        return Evidence.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then((result) => {
                return result.createRecord({}, 'me');
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
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create journal class', () => {
            return Journal.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Journal);
                    expect(result.propertyNames).to.include('name','version','created_at','deleted_at','created_by');
                    expect(result.isAbstract).to.be.false;
                });
        });
        it('create ExternalSource class', () => {
            return ExternalSource.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(ExternalSource);
                    expect(result.propertyNames).to.include('title', 'extraction_date', 'url','version','created_at','deleted_at','created_by');
                    expect(result.isAbstract).to.be.false;
                });
        });
        it('create study class', () => {
            return Study.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Study);
                    expect(result.propertyNames).to.include('title', 'year', 'sample_population', 'sample_population_size', 'method', 'url','version','created_at','deleted_at','created_by');
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
                    expect(result.propertyNames).to.include('sample_population','phase', 'trial_id', 'official_title', 'summary','version','created_at','deleted_at');
                    expect(result.isAbstract).to.be.false;
                    expect(result.conn.superClass).to.equal('study')
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
                return pubClass.createRecord({title: 'title', year: 2008}, journalClass, 'me')
                    .then((result) => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows links from different publications to one journal', () => {
                return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}}, journalClass, 'me')
                    .then((result) => {
                        expect(result.content).to.have.property('journal');
                        return pubClass.createRecord({title: 'title2', year: 2008, journal: {name: 'journal'}}, journalClass, 'me')
                            .then((result2) => {
                                expect(result2.content).to.have.property('journal');
                            })
                    .then((result) => {
                        return pubClass.createRecord({title: 'title3', year: 2008, journal: {name: 'journal'}}, journalClass, 'me')
                            .then((result3) => {
                                expect(result3.content).to.have.property('journal');
                            });
                    })                            
                });
            });
            it('test mandatory props with future publication date', () => {
                return pubClass.createRecord({title: 'title', year: 2018, journal: {name: 'journal'}}, journalClass, 'me')
                    .then((result) => {
                        expect.fail('invalid attribute. should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('test wrong pmid value (i.e. string)', () => {
                return pubClass.createRecord({title: 'title', year: 2016, pmid: '21xd2456', journal: {name: 'journal'}}, journalClass, 'me')
                    .then((result) => {
                        expect.fail('invalid attribute. should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('errors on creating duplicate active entries', () => {
                return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}}, journalClass, 'me')
                    .then(() => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}}, journalClass, 'me')
                    }).then(() => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}, deleted_at: 1493760183196}, journalClass, 'me')
                    .then((result) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}, deleted_at: 1493760183196}, journalClass, 'me');
                    }).then(() => {
                        expect.fail('violated unqiue constraint. error expected');             
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}, deleted_at: 1493760183196}, journalClass, 'me')
                    .then((result) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}, deleted_at: 1493760183201}, journalClass, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('year');
                        expect(result.content).to.have.property('title')             
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries one active and one deleted', () => {
                return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}, deleted_at: 1493760183196}, journalClass, 'me')
                    .then((result) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: {name: 'journal'}}, journalClass, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('year');
                        expect(result.content).to.have.property('title')            
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return pubClass.createRecord({title: 'title', year: 'year',  journal: {name: 'journal'},  invalid_attribute: 2}, journalClass, 'me')
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
                return currClass.createRecord({title: 'title', year: 2008}, 'me')
                    .then((record) => {
                        expect(record.content).to.have.property('title');
                        expect(record.content).to.have.property('year');
                        // should not have
                        expect(record.content).not.to.have.property('sample_population');
                        expect(record.content).not.to.have.property('sample_population_size');
                        expect(record.content).not.to.have.property('method');
                        expect(record.content).not.to.have.property('url'); 
                    });
            });
            it('null for mandatory porps error', () => {
                return currClass.createRecord({title: 'title'}, 'me')
                    .then((result) => {
                        expect.fail('violated null constraint. expected error');
                    }).catch((error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('duplicate active entries', () => {
                return currClass.createRecord({title: 'title', year: 2008}, 'me')
                    .then((result) => {
                        return currClass.createRecord({title: 'title', year: 2008}, 'me')
                    }).then((result) => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me');
                    }).then(() => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at different times', () => {
                return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me')
                    .then((result) => {
                        return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183199}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('title');
                        expect(result.content).to.have.property('year');                       
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries one deleted and one active', () => {
                return currClass.createRecord({title: 'title', year: 2008}, 'me')
                    .then((result) => {
                        return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183199}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('title');
                        expect(result.content).to.have.property('year');                       
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('future study', () => {
                return currClass.createRecord({title: 'title', year: 2028}, 'me')
                    .then((record) => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({title: 'title', year: 2008, invalid_attribute: 2}, 'me')
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
                    return mockClass.createRecord({title: 'title', year: 2008}, 'me')
                        .then((clinicalRecord) => {
                            expect(clinicalRecord.content).to.have.property('title');
                            expect(clinicalRecord.content).to.have.property('year');
                            // should not have
                            expect(clinicalRecord.content).not.to.have.property('phase');
                            expect(clinicalRecord.content).not.to.have.property('trial_id');
                            expect(clinicalRecord.content).not.to.have.property('official_title');
                            expect(clinicalRecord.content).not.to.have.property('summary'); 
                        });
                });
                it('null for mandatory porps error', () => {
                return currClass.createRecord({title: 'title'}, 'me')
                    .then((result) => {
                        expect.fail('violated null constraint. expected error');
                    }).catch((error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
                });
                it('duplicate props except for phase for active rows', () => {
                    return mockClass.createRecord({title: 'title', year: 2008, phase: 2, trial_id: 'trial_id', official_title: 'official_title'}, 'me')
                        .then((clinicalResult) => {
                            return mockClass.createRecord({title: 'title', year: 2008, phase: 3, trial_id: 'trial_id', official_title: 'official_title'}, 'me');
                        }).then((clinicalResult) => {
                            expect.fail('expected error');                        
                        }).catch((clinicalError) => {
                            return oError.expectDuplicateKeyError(clinicalError);
                        });
                });
                it('duplicate entries for active rows', () => {
                    return mockClass.createRecord({title: 'title', year: 2008, phase: 2, trial_id: 'trial_id', official_title: 'official_title'}, 'me')
                        .then((clinicalResult) => {
                            return mockClass.createRecord({title: 'title', year: 2008, phase: 2, trial_id: 'trial_id', official_title: 'official_title'}, 'me');
                        }).then((clinicalResult) => {
                            expect.fail('expected error');                        
                        }).catch((clinicalError) => {
                            return oError.expectDuplicateKeyError(clinicalError);
                        });
                });
                it('duplicate entries for rows deleted at the same time', () => {
                    return mockClass.createRecord({title: 'title', year: 2008, phase: 2, trial_id: 'trial_id', official_title: 'official_title', deleted_at: 1493760183196}, 'me')
                        .then((clinicalResult) => {
                            return mockClass.createRecord({title: 'title', year: 2008, phase: 2, trial_id: 'trial_id', official_title: 'official_title', deleted_at: 1493760183196}, 'me');
                        }).then((clinicalResult) => {
                            expect.fail('expected error');                        
                        }).catch((clinicalError) => {
                            return oError.expectDuplicateKeyError(clinicalError);
                        });
                });
                it('duplicate entries for rows deleted at different times', () => {
                    return mockClass.createRecord({title: 'title', year: 2008, phase: 2, trial_id: 'trial_id', official_title: 'official_title', deleted_at: 1493760183196}, 'me')
                        .then((clinicalResult) => {
                            return mockClass.createRecord({title: 'title', year: 2008, phase: 2, trial_id: 'trial_id', official_title: 'official_title', deleted_at: 1493760183198}, 'me');
                        }).then((clinicalResult) => {
                            expect(clinicalResult.content).to.have.property('title');                       
                        }).catch((clinicalError) => {
                            return oError.expectDuplicateKeyError(clinicalError);
                        });
                });
                it('invalid attribute', () => {
                    return mockClass.createRecord({title: 'title', year: 2008, invalid_attribute: 2}, 'me')
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
                return currClass.createRecord({name: 'name'}, 'me')
                    .then((record) => {
                        expect(record.content).to.have.property('uuid');
                        expect(record.content).to.have.property('version');
                        expect(record.content).to.have.property('created_at');
                        expect(record.content).to.have.property('deleted_at');
                        expect(record.content).to.have.property('name');
                    });
            });
            it('null for mandatory porps error', () => {
            return currClass.createRecord({}, 'me')
                .then((result) => {
                    expect.fail('violated null constraint. expected error');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });
            it('duplicate active entries', () => {
                return currClass.createRecord({name: 'Nature'}, 'me')
                    .then((result) => {
                        return currClass.createRecord({name: 'naturE'}, 'me');
                    }).then((result) => {
                        expect.fail('violated unique constraint. expected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return currClass.createRecord({name: 'Nature', deleted_at: 1493760183196}, 'me')
                    .then((result) => {
                        return currClass.createRecord({name: 'naturE', deleted_at: 1493760183196}, 'me');
                    }).then((result) => {
                        expect.fail('violated unique constraint. expected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at different times', () => {
                return currClass.createRecord({name: 'Nature', deleted_at: 1493760183196}, 'me')
                    .then((result) => {
                        return currClass.createRecord({name: 'naturE', deleted_at: 1493760183198}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('name');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries one active and one deleted', () => {
                return currClass.createRecord({name: 'Nature'}, 'me')
                    .then((result) => {
                        return currClass.createRecord({name: 'naturE', deleted_at: 1493760183196}, 'me');
                    }).then((result) => {
                       expect(result.content).to.have.property('name');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({name: 'name', invalid_attribute: 2}, 'me')
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
                return currClass.createRecord({url: 'url', extraction_date: moment().unix()}, 'me')
                    .then((record) => {
                        expect(record.content).to.have.property('uuid');
                        expect(record.content).to.have.property('version');
                        expect(record.content).to.have.property('created_at');
                        expect(record.content).to.have.property('deleted_at');
                        expect(record.content).to.have.property('url');
                        expect(record.content).to.have.property('extraction_date');
                        // should not have
                        expect(record).to.not.have.property('title');
                    });
            });
            it('null for mandatory porps error', () => {
            return currClass.createRecord({url: 'url'}, 'me')
                .then((result) => {
                    expect.fail('violated null constraint. expected error');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });
            it('duplicate entries for active records', () => {
                return currClass.createRecord({url: 'url', extraction_date: 'extraction_date'}, 'me')
                    .then((result) => {
                        return currClass.createRecord({url: 'url', extraction_date: 'extraction_date'}, 'me');
                    }).then((result) => {
                        expect.fail('violated unique constraint. expected error');
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries for rows deleted at the same time', () => {
                return currClass.createRecord({url: 'url', extraction_date: 'extraction_date', deleted_at: 1493760183196}, 'me')
                    .then((result) => {
                        return currClass.createRecord({url: 'url', extraction_date: 'extraction_date', deleted_at: 1493760183196}, 'me');
                    }).then((result) => {
                        expect.fail('violated unique constraint. expected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries for deleted rows', () => {
                return currClass.createRecord({url: 'url', extraction_date: 'extraction_date', deleted_at: 1493760183196}, 'me')
                    .then((result) => {
                        return currClass.createRecord({url: 'url', extraction_date: 'extraction_date', deleted_at: 1493760183198}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('url');
                        expect(result.content).to.have.property('extraction_date')                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({url: 'url', extraction_date: 'extraction_date', invalid_attribute: 2}, 'me')
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
        db.server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                return db.server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error closing the server', error);
                done(error);
            });
    })
});
