'use strict';
const {expect} = require('chai');
const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./../../app/repo/evidence');
const {AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {setUpEmptyDB, tearDownEmptyDB} = require('./util');


describe('Evidence schema tests:', () => {
    let server, db;
    beforeEach(async () => { 
        ({server, db} = await setUpEmptyDB());
        await Context.createClass(db);
    });
    it('test creating the evidence class', () => {
        return Evidence.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(Evidence);
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at');
                expect(result.isAbstract).to.be.true;
            });
    });
    
    describe('evidence subclasses', () => {
        beforeEach(async () => {
            await Evidence.createClass(db);
        });
        it('create journal class', () => {
            return Journal.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Journal);
                    expect(result.propertyNames).to.include('name','version','created_at','deleted_at','created_by');
                    expect(result.isAbstract).to.be.false;
                });
        });
        it('create publication class', async () => {
            await Journal.createClass(db);
            const pub = await Publication.createClass(db);
            expect(pub).to.be.an.instanceof(Publication);
            expect(pub.isAbstract).to.be.false;
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
            beforeEach(async function() {
                await Study.createClass(db);
            });

            it('create clinicalTrial class', () => {
                return ClinicalTrial.createClass(db)
                    .then((result) => {
                        expect(result).to.be.an.instanceof(ClinicalTrial);
                        expect(result.propertyNames).to.include('sample_population','phase', 'trial_id', 'summary','version','created_at','deleted_at');
                        expect(result.isAbstract).to.be.false;
                        expect(result.conn.superClass).to.equal('study');
                    });
            });

        });

        describe('publication constraints', () => {
            beforeEach(async function() {
                await Promise.all([
                    Publication.createClass(db),
                    Journal.createClass(db)
                ]);
            });
            it('basic publication record', () => {
                return db.models.Journal.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return db.models.Publication.createRecord({title: 'title', year: 2008, journal: journalRec}, 'me')
                            .then((result) => {
                                expect(result.content).to.have.property('journal');
                            });
                    });                        
            });
            it('basic publication record with no journal', () => {
                return db.models.Publication.createRecord({title: 'title', year: 2008}, 'me')
                    .then((result) => {
                        expect(result.content).to.have.property('title');
                    }).catch((err) => {
                        console.log(err);
                    });                        
            });
            it('allows links from different publications to one journal', async () => {
                const journalRec = await db.models.Journal.createRecord({name: 'sampleJournalName'}, 'me')
                const [pub1, pub2] = Promise.all([
                    db.models.Publication.createRecord({title: 'title', year: 2008, journal: journalRec}, 'me'),
                    db.models.Publication.createRecord({title: 'title2', year: 2008, journal: journalRec}, 'me')
                ]);
                expect(pub1).to.have.property('journal');
                expect(pub2).to.have.property('journal');
            });
            it('test mandatory props with future publication date', () => {
                return db.models.Publication.createRecord({title: 'title', year: 2018}, 'me')
                    .then(() => {
                        expect.fail('invalid attribute. should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('errors on creating duplicate active entries', () => {
                return db.models.Publication.createRecord({title: 'title', year: 2008}, 'me')
                    .then(() => {
                        return db.models.Publication.createRecord({title: 'title', year: 2008}, 'me');
                    }).then(() => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return db.models.Journal.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return db.models.Publication.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183196}, 'me')
                            .then(() => {
                                return db.models.Publication.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183196}, 'me');
                            }).then(() => {
                                expect.fail('violated unqiue constraint. error expected');             
                            }).catch((error) => {
                                return expectDuplicateKeyError(error);
                            });
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return db.models.Journal.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return db.models.Publication.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183196}, 'me')
                            .then(() => {
                                return db.models.Publication.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183201}, 'me');
                            }).then((result) => {
                                expect(result.content).to.have.property('year');
                                expect(result.content).to.have.property('title');             
                            }).catch((error) => {
                                return expectDuplicateKeyError(error);
                            });
                    });
            });
            it('duplicate entries one active and one deleted', () => {
                return db.models.Journal.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return db.models.Publication.createRecord({title: 'title', year: 2008, journal: journalRec, deleted_at: 1493760183196}, 'me')
                            .then(() => {
                                return db.models.Publication.createRecord({title: 'title', year: 2008, journal: journalRec}, 'me');
                            }).then((result) => {
                                expect(result.content).to.have.property('year');
                                expect(result.content).to.have.property('title');            
                            }).catch((error) => {
                                return expectDuplicateKeyError(error);
                            });
                    });
            });
            it('invalid attribute', () => {
                return db.models.Journal.createRecord({name: 'sampleJournalName'}, 'me')
                    .then((journalRec) => {
                        return db.models.Publication.createRecord({title: 'title', year: 'year',  journal: journalRec,  invalid_attribute: 2}, 'me')
                            .then(() => {
                                expect.fail('invalid attribute. should have thrown error');
                            }).catch((error) => {
                                expect(error).to.be.an.instanceof(AttributeError);
                            });
                    });
            });
        });
        
        describe('study constraints', () => {
            beforeEach(async function() {
                await Study.createClass(db);
            });
            it('test mandatory props', () => {
                return db.models.Study.createRecord({title: 'title', year: 2008}, 'me')
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
                return db.models.Study.createRecord({year: 2010}, 'me')
                    .then(() => {
                        expect.fail('violated null constraint. expected error');
                    }).catch((error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('duplicate entries deleted at the same time', () => {
                return db.models.Study.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return db.models.Study.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me');
                    }).then(() => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries deleted at different times', () => {
                return db.models.Study.createRecord({title: 'title', year: 2008, deleted_at: 1493760183196}, 'me')
                    .then(() => {
                        return db.models.Study.createRecord({title: 'title', year: 2008, deleted_at: 1493760183199}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('title');
                        expect(result.content).to.have.property('year');                       
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('duplicate entries one deleted and one active', () => {
                return db.models.Study.createRecord({title: 'title', year: 2008}, 'me')
                    .then(() => {
                        return db.models.Study.createRecord({title: 'title', year: 2008, deleted_at: 1493760183199}, 'me');
                    }).then((result) => {
                        expect(result.content).to.have.property('title');
                        expect(result.content).to.have.property('year');                       
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('future study', () => {
                return db.models.Study.createRecord({title: 'title', year: 2028}, 'me')
                    .then(() => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
            it('invalid attribute', () => {
                return db.models.Study.createRecord({title: 'title', year: 2008, invalid_attribute: 2}, 'me')
                    .then(() => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
        });

            // Take this one step back and add study class before adding a clinical Trial class

        describe('clinicalTrial constraints', () => {
            beforeEach(async function() {
                await Study.createClass(db);
                await ClinicalTrial.createClass(db);
            });
            it('test mandatory props', () => {
                return db.models.ClinicalTrial.createRecord({trial_id: 'trial_id', title: 'title', year: 2008}, 'me')
                    .then((clinicalRecord) => {
                        expect(clinicalRecord.content).to.have.property('trial_id');
                        expect(clinicalRecord.content).to.have.property('title');
                        expect(clinicalRecord.content).to.have.property('year');
                        // should not have
                        expect(clinicalRecord.content).not.to.have.property('phase');
                        expect(clinicalRecord.content).not.to.have.property('summary'); 
                    });
            });

            it('errors when one or more mandatory props are not provided', () => {
                return db.models.ClinicalTrial.createRecord({year: 2008, phase: 1}, 'me')
                .then(() => {
                    expect.fail('violated null constraint. expected error');
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });

            it('allows trial_id to be used when title is not provided', () => {
                return db.models.ClinicalTrial.createRecord({year: 2008, phase: 1, trial_id: 'trial_id'}, 'me')
                .then((clinicalResult) => {
                    expect(clinicalResult.content).to.have.property('title');   
                }).catch((error) => {
                    expect(error).to.be.instanceof(AttributeError);
                });
            });

            it('errors on duplicate active trials', () => {
                const trial_entry = {phase: 1, trial_id: 'trial_id', title: 'title', year: 2008};
                return db.models.ClinicalTrial.createRecord(trial_entry, 'me')
                    .then(() => {
                        return db.models.ClinicalTrial.createRecord(trial_entry, 'me')
                    }).then(() => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
                    });
            });

            it('duplicate active trials in different phases', () => {
                const first_trial_entry = {phase: 1, trial_id: 'trial_id', title: 'title', year: 2008}
                const second_trial_entry = {phase: 2, trial_id: 'trial_id', title: 'title', year: 2008}
                return db.models.ClinicalTrial.createRecord(first_trial_entry, 'me')
                    .then(() => {
                        return db.models.ClinicalTrial.createRecord(second_trial_entry, 'me');
                    }, () => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
                    });
            });

            it('duplicate entries for rows deleted at the same time', () => {
                return db.models.ClinicalTrial.createRecord({phase: 2, trial_id: 'trial_id', deleted_at: 1493760183196, title: 'title', year: 2008}, 'me')
                    .then(() => {
                        return db.models.ClinicalTrial.createRecord({phase: 2, trial_id: 'trial_id', deleted_at: 1493760183196, title: 'title', year: 2008}, 'me');
                    }).then(() => {
                        expect.fail('expected error');                        
                    }).catch((clinicalError) => {
                        return expectDuplicateKeyError(clinicalError);
                    });
            });
            it('duplicate entries for rows deleted at different times', () => {
                return db.models.ClinicalTrial.createRecord({phase: 2, trial_id: 'trial_id', deleted_at: 1493760183196, title: 'title', year: 2008}, 'me')
                    .then(() => {
                        return db.models.ClinicalTrial.createRecord({phase: 2, trial_id: 'trial_id', deleted_at: 1493760183198, title: 'title', year: 2008}, 'me');
                    }).then((clinicalResult) => {
                        expect(clinicalResult.content).to.have.property('trial_id');                       
                    }).catch((clinicalError) => {
                        return expectDuplicateKeyError(clinicalError);
                    });
            });
            it('invalid attribute', () => {
                return db.models.ClinicalTrial.createRecord({invalid_attribute: 2, title: 'title', year: 2008}, 'me')
                    .then(() => {
                        expect.fail('invalid attribute. error is expected');
                    }).catch((clinicalError) => {
                        expect(clinicalError).to.be.an.instanceof(AttributeError);
                    });
            });
        });
    });

    afterEach(async () => {
        await tearDownEmptyDB(server);
    });
});
