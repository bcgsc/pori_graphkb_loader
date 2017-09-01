'use strict';
const {expect} = require('chai');
const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./../../app/repo/evidence');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./../../app/repo/base');
const {AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const Promise = require('bluebird');
const {PERMISSIONS} = require('./../../app/repo/constants');
const {expectDuplicateKeyError} = require('./orientdb_errors');


describe('Evidence schema tests:', () => {
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
    it('test creating the evidence class', () => {
        return Evidence.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(Evidence);
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at');
                expect(result.isAbstract).to.be.true;
            });
    });

    it('errors adding a record to the abstract evidence class', () => {
        Evidence.createClass(db)
            .then(() => {
                expect.fail('expected an error');
            }).catch((error) => {
                console.log(error);
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
        it('create journal class', () => {
            return Journal.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Journal);
                    expect(result.propertyNames).to.include('name','version','created_at','deleted_at','created_by');
                    expect(result.isAbstract).to.be.false;
                });
        });
        it('create publication class', () => {
            return Journal.createClass(db)
                .then(() => {
                    return Publication.createClass(db)
                        .then((result) => {
                            expect(result).to.be.an.instanceof(Publication);
                            expect(result.isAbstract).to.be.false;
                        });
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
                        expect(result.conn.superClass).to.equal('study');
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
            it('basic publication record', () => {
                return journalClass.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: journalRec}, 'me')
                            .then((result) => {
                                expect(result.content).to.have.property('journal');
                            });
                    });                        
            });
            it('basic publication record with no journal', () => {
                return pubClass.createRecord({title: 'title', year: 2008}, 'me')
                    .then((result) => {
                        expect(result.content).to.have.property('title');
                    }).catch((err) => {
                        console.log(err);
                    });                        
            });
            it('allows links from different publications to one journal', () => {
                return journalClass.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: journalRec}, 'me')
                            .then((result) => {
                                expect(result.content).to.have.property('journal');
                                return pubClass.createRecord({title: 'title2', year: 2008, journal: journalRec}, 'me')
                                    .then((result2) => {
                                        expect(result2.content).to.have.property('journal');
                                    })
                            .then(() => {
                                return pubClass.createRecord({title: 'title3', year: 2008, journal: journalRec}, 'me')
                                    .then((result3) => {
                                        expect(result3.content).to.have.property('journal');
                                    });
                            });                            
                            });
                    });
            });
            it('test mandatory props with future publication date', () => {
                return pubClass.createRecord({title: 'title', year: 2018}, 'me')
                    .then(() => {
                        expect.fail('invalid attribute. should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('errors on creating duplicate active entries', () => {
                return pubClass.createRecord({title: 'title', year: 2008}, 'me')
                    .then(() => {
                        return pubClass.createRecord({title: 'title', year: 2008}, 'me');
                    }).then(() => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return journalClass.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183196}, 'me')
                            .then(() => {
                                return pubClass.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183196}, 'me');
                            }).then(() => {
                                expect.fail('violated unqiue constraint. error expected');             
                            }).catch((error) => {
                                return expectDuplicateKeyError(error);
                            });
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return journalClass.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183196}, 'me')
                            .then(() => {
                                return pubClass.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183201}, 'me');
                            }).then((result) => {
                                expect(result.content).to.have.property('year');
                                expect(result.content).to.have.property('title');             
                            }).catch((error) => {
                                return expectDuplicateKeyError(error);
                            });
                    });
            });
            it('duplicate entries one active and one deleted', () => {
                return journalClass.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return pubClass.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183196}, 'me')
                            .then(() => {
                                return pubClass.createRecord({title: 'title', year: 2008, journal: journalRec}, 'me');
                            }).then((result) => {
                                expect(result.content).to.have.property('year');
                                expect(result.content).to.have.property('title');            
                            }).catch((error) => {
                                return expectDuplicateKeyError(error);
                            });
                    });
            });
            it('invalid attribute', () => {
                return journalClass.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return pubClass.createRecord({title: 'title', year: 'year',  journal: journalRec,  invalid_attribute: 2}, 'me')
                            .then(() => {
                                expect.fail('invalid attribute. should have thrown error');
                            }).catch((error) => {
                                expect(error).to.be.an.instanceof(AttributeError);
                            });
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
            it('null for mandatory porps (i.e. title) error', () => {
                return currClass.createRecord({year: 2010}, 'me')
                    .then(() => {
                        expect.fail('violated null constraint. expected error');
                    }).catch((error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me');
                    }).then(() => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at different times', () => {
                return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183199}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('title');
                        expect(result.content).to.have.property('year');                       
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries one deleted and one active', () => {
                return currClass.createRecord({title: 'title', year: 2008}, 'me')
                    .then(() => {
                        return currClass.createRecord({title: 'title', year: 2008, deleted_at: 1493760183199}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('title');
                        expect(result.content).to.have.property('year');                       
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('future study', () => {
                return currClass.createRecord({title: 'title', year: 2028}, 'me')
                    .then(() => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({title: 'title', year: 2008, invalid_attribute: 2}, 'me')
                    .then(() => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
        });

            // Take this one step back and add study class before adding a clinical Trial class

        describe('clinicalTrial constraints', () => {
            let mockClass = null;
            beforeEach(function(done) {
                Study.createClass(db)
                    .then(() => {
                        ClinicalTrial.createClass(db)
                            .then((clinicalClass) => {
                                mockClass = clinicalClass;
                                done();
                            }).catch((clinicalError) => {
                                done(clinicalError);
                            });
                    });
            });
            it('test mandatory props', () => {
                return mockClass.createRecord({title: 'title', year: 2008}, 'me')
                    .then((clinicalRecord) => {
                        expect(clinicalRecord.content).to.have.property('title');
                        expect(clinicalRecord.content).to.have.property('year');
                        // should not have
                        expect(clinicalRecord.content).not.to.have.property('phase');
                        expect(clinicalRecord.content).not.to.have.property('summary'); 
                    });
            });

            it('errors when one or more mandatory porps are not provided', () => {
                return mockClass.createRecord({year: 2008, phase: 1}, 'me')
                .then(() => {
                    expect.fail('violated null constraint. expected error');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });

            it('allows trial_id to be used when title is not provided', () => {
                return mockClass.createRecord({year: 2008, phase: 1, trial_id: 'trial_id'}, 'me')
                .then((clinicalResult) => {
                    expect(clinicalResult.content).to.have.property('title');   
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });

            it('errors on duplicate active trials', () => {
                const trial_entry = {phase: 1, trial_id: 'trial_id', title: 'title', year: 2008};
                return mockClass.createRecord(trial_entry, 'me')
                    .then(() => {
                        return mockClass.createRecord(trial_entry, 'me');
                    }, () => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
                    });
            });

            it('errors on duplicate active trials in different phases', () => {
                const first_trial_entry = {phase: 1, trial_id: 'trial_id', title: 'title', year: 2008};
                const second_trial_entry = {phase: 2, trial_id: 'trial_id', title: 'title', year: 2008};
                return mockClass.createRecord(first_trial_entry, 'me')
                    .then(() => {
                        return mockClass.createRecord(second_trial_entry, 'me');
                    }, () => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
                    });
            });

            it('duplicate entries for rows deleted at the same time', () => {
                return mockClass.createRecord({phase: 2, trial_id: 'trial_id', deleted_at: 1493760183196, title: 'title', year: 2008}, 'me')
                    .then(() => {
                        return mockClass.createRecord({phase: 2, trial_id: 'trial_id', deleted_at: 1493760183196, title: 'title', year: 2008}, 'me');
                    }).then(() => {
                        expect.fail('expected error');                        
                    }).catch((clinicalError) => {
                        return expectDuplicateKeyError(clinicalError);
                    });
            });
            it('duplicate entries for rows deleted at different times', () => {
                return mockClass.createRecord({phase: 2, trial_id: 'trial_id', deleted_at: 1493760183196, title: 'title', year: 2008}, 'me')
                    .then(() => {
                        return mockClass.createRecord({phase: 2, trial_id: 'trial_id', deleted_at: 1493760183198, title: 'title', year: 2008}, 'me');
                    }).then((clinicalResult) => {
                        expect(clinicalResult.content).to.have.property('title');                       
                    }).catch((clinicalError) => {
                        return expectDuplicateKeyError(clinicalError);
                    });
            });
            it('invalid attribute', () => {
                return mockClass.createRecord({invalid_attribute: 2, title: 'title', year: 2008}, 'me')
                    .then(() => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((clinicalError) => {
                        expect(clinicalError).to.be.an.instanceof(AttributeError);
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
                .then(() => {
                    expect.fail('violated null constraint. expected error');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });
            it('duplicate active entries', () => {
                return currClass.createRecord({name: 'Nature'}, 'me')
                    .then(() => {
                        return currClass.createRecord({name: 'naturE'}, 'me');
                    }).then(() => {
                        expect.fail('violated unique constraint. expected error');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return currClass.createRecord({name: 'Nature', deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return currClass.createRecord({name: 'naturE', deleted_at: 1493760183196}, 'me');
                    }).then(() => {
                        expect.fail('violated unique constraint. expected error');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at different times', () => {
                return currClass.createRecord({name: 'Nature', deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return currClass.createRecord({name: 'naturE', deleted_at: 1493760183198}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('name');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries one active and one deleted', () => {
                return currClass.createRecord({name: 'Nature'}, 'me')
                    .then(() => {
                        return currClass.createRecord({name: 'naturE', deleted_at: 1493760183196}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('name');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({name: 'name', invalid_attribute: 2}, 'me')
                    .then(() => {
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
                return currClass.createRecord({url: 'url', title: 'title'}, 'me')
                    .then((record) => {
                        expect(record.content).to.have.property('uuid');
                        expect(record.content).to.have.property('version');
                        expect(record.content).to.have.property('created_at');
                        expect(record.content).to.have.property('deleted_at');
                        expect(record.content).to.have.property('title');
                        expect(record.content).to.have.property('url');
                        // should not have
                        expect(record.content).to.not.have.property('extraction_date');
                    });
            });
            it('errors when mandatory porp: title is not provided', () => {
                return currClass.createRecord({url: 'url'}, 'me')
                .then(() => {
                    expect.fail('violated null constraint. expected error');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });
            it('allows when mandatory porp: url is not provided', () => {
                return currClass.createRecord({title: 'title'}, 'me')
                .then((result) => {
                    expect(result.content).to.have.property('title');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });
            it('duplicate entries for active records', () => {
                return currClass.createRecord({url: 'url', title:'title'}, 'me')
                    .then(() => {
                        return currClass.createRecord({url: 'url', title:'title'}, 'me');
                    }).then(() => {
                        expect.fail('violated unique constraint. expected error');
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries for rows deleted at the same time', () => {
                return currClass.createRecord({url: 'url', title:'title', deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return currClass.createRecord({url: 'url', title:'title', deleted_at: 1493760183196}, 'me');
                    }).then(() => {
                        expect.fail('violated unique constraint. expected error');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries for deleted rows', () => {
                return currClass.createRecord({url: 'url', title:'title', deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return currClass.createRecord({url: 'url', title:'title', deleted_at: 1493760183198}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('url');                 
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return currClass.createRecord({url: 'url', extraction_date: 'extraction_date', invalid_attribute: 2}, 'me')
                    .then(() => {
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
    });
});
