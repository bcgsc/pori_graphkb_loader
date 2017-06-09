'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, Base, Record, History} = require('./../../app/repo/base');
const {CategoryEvent, PositionalEvent, Event, EVENT_TYPE, EVENT_SUBTYPE, ZYGOSITY} = require('./../../app/repo/event');
const {Feature, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const {Position, CodingSequencePosition, GenomicPosition, ProteinPosition} = require('./../../app/repo/position');
const {Context} = require('./../../app/repo/context');
const cache = require('./../../app/repo/cached/data');
const Promise = require('bluebird');
const {AttributeError, ControlledVocabularyError} = require('./../../app/repo/error');


cache.vocab[Event.clsname] = { 'term': [
    {
        term: 'gain',
        definition: '',
        conditional: EVENT_TYPE.CNV,
        class: Event.clsname,
        property: 'term'
    },
    {
        term: 'not specified',
        definition: '',
        conditional: null,
        class: Event.clsname,
        property: 'term'
    }
]};


describe('Event schema tests:', () => {
    let server, db, primary_feature, secondary_feature;
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
                    models: {KBEdge, KBVertex, History}
                });
            }).then((connection) => {
                db = connection;
                return Promise.all([
                    Context.createClass(db),
                    Position.createClass(db)
                ]);
            }).then(() => {
                return Promise.all([
                    Feature.createClass(db),
                    GenomicPosition.createClass(db),
                    CodingSequencePosition.createClass(db),
                    ProteinPosition.createClass(db)
                ]);
            }).then(() => {
                return Promise.all([
                    db.models.Feature.createRecord({name: 'HUGO1', source: FEATURE_SOURCE.HGNC, biotype: FEATURE_BIOTYPE.GENE}),
                    db.models.Feature.createRecord({name: 'HUGO2', source: FEATURE_SOURCE.HGNC, biotype: FEATURE_BIOTYPE.GENE})
                ]);
            }).then((pList) => {
                [primary_feature, secondary_feature] = pList;
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });
    
    it('create the event abstract class');
    it('errors adding a record to the abstract event class');
    describe('createClass', () => {
        beforeEach((done) => {
            Event.createClass(db)
                .then(() => {
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('CategoryEvent', () => {
            return CategoryEvent.createClass(db)
                .then((cls) => {
                    expect(cls.isAbstract).to.be.false;
                });
        });
        it('PositionalEvent', () => {
            return PositionalEvent.createClass(db)
                .then((cls) => {
                    expect(cls.isAbstract).to.be.false;
                    expect(cls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version', 'start', 'end', 'type', 'subtype');
                });
        });
        describe('Event.validateContent', () => {
            it('errors when germline is true and zygosity=subclonal', () => {
                expect(() => {
                    Event.validateContent(
                        {type: EVENT_TYPE.MUT, germline: true, zygosity: ZYGOSITY.SUB, primary_feature: primary_feature}
                    );
                }).to.throw(AttributeError);
            });
            it('allows subclonal when the event is not germline', () => {
                const args = Event.validateContent(
                    {type: EVENT_TYPE.MUT, germline: false, zygosity: ZYGOSITY.SUB, primary_feature: primary_feature}
                );
                expect(args.germline).to.be.false;
                expect(args).to.not.have.property('uuid');
            });
        });
    });

    describe('PositionalEvent.createRecord', () => {
        beforeEach((done) => {
            Event.createClass(db)
                .then(() => {
                    return PositionalEvent.createClass(db);
                }).then(() => {
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('errors on same start/end positions', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 1}, end: {pos: 1}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors when event start > end position', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, end: {pos: 1}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors when end is undefined and subtype is insertion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('allows end to be undefined', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DUP
            }, GenomicPosition.clsname).then((rec) => {
                expect(rec).to.not.have.property('end');
                expect(rec).to.not.have.property('secondary_feature');
            });
        });
        it('errors on start undefined', () => {
            return db.models.PositionalEvent.createRecord({
                end: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DUP
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(TypeError, () => {});
        });
        it('errors on start null', () => {
            return db.models.PositionalEvent.createRecord({
                start: null, end: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DUP
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(TypeError, () => {});
        });
        it('errors on invalid event subtype', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: 'invalid'
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on null subtype', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: null
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on subtype undefined', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on null untemplated_seq', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.INDEL, untemplated_seq: null
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on null reference_seq', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.INDEL, reference_seq: null
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on primary_feature undefined', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.INDEL
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on untemplated_seq for subtype=deletion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DEL, untemplated_seq: 'A'
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on reference_seq for subtype=insertion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, end: {pos: 3}, 
                primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS, reference_seq: 'A'
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('allows untemplated_seq for insertion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, end: {pos: 3}, primary_feature: primary_feature,
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS, untemplated_seq: 'A'
            }, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('untemplated_seq', 'A');
            });
        });
        it('allows reference_seq for deletion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DEL, reference_seq: 'A'
            }, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('reference_seq', 'A');
            });
        });
        it('allows untemplated_seq and reference_seq for indel', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INDEL, reference_seq: 'A', untemplated_seq: 'CC'
            }, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('untemplated_seq', 'CC');
                expect(rec.content).to.have.property('reference_seq', 'A');
            });
        });
        it('allows untemplated_seq and reference_seq for sub', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.SUB, reference_seq: 'A', untemplated_seq: 'C'
            }, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('untemplated_seq', 'C');
                expect(rec.content).to.have.property('reference_seq', 'A');
            });
        });
        it('errors on substitution where reference_seq is not length 1', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, reference_seq: 'AA'
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on substitution where untemplated_seq is not length 1', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, untemplated_seq: 'AA'
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on substitution where untemplated_seq = reference_seq if not protein', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, untemplated_seq: 'A', reference_seq: 'A'
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on indel where the length of untemplated_seq and reference_seq is 1', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, untemplated_seq: 'A', reference_seq: 'A'
            }, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors if terminating_aa is specified and the subtype is not frameshift', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, untemplated_seq: 'A', reference_seq: 'A', terminating_aa: 1
            }, ProteinPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('allows terminating_aa to be specified for frameshifts', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.FS, reference_seq: 'A', untemplated_seq: 'C', terminating_aa: 110
            }, ProteinPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('untemplated_seq', 'C');
                expect(rec.content).to.have.property('reference_seq', 'A');
            });
        });
    });
    
    describe('CategoryEvent.createRecord', () => {
        beforeEach((done) => {
            Event.createClass(db)
                .then((event) => {
                    db.models.Event = event;
                    return CategoryEvent.createClass(db)
                }).then((ce) => {
                    db.models.CategoryEvent = ce;
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('errors on invalid term for any event type', () => {
            return db.models.CategoryEvent.createRecord({type: EVENT_TYPE.RNA, primary_feature: primary_feature, term: 'gain'})
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('allows term specific to copy number variants', () => {
            return db.models.CategoryEvent.createRecord({
                term: 'gain', 
                type: EVENT_TYPE.CNV, 
                zygosity: null, 
                primary_feature: primary_feature
            }).then((record) => {
                expect(record).to.be.instanceof(Record);
                expect(record.content).to.have.property('zygosity', null);
                expect(record.content).to.have.property('germline', null);
            });
        });
        it('allows term non-specific for CNVs', () => {
            return db.models.CategoryEvent.createRecord({
                term: 'not specified', 
                type: EVENT_TYPE.CNV, 
                zygosity: null, 
                primary_feature: primary_feature
            }).then((record) => {
                expect(record).to.be.instanceof(Record);
                expect(record.content).to.have.property('zygosity', null);
                expect(record.content).to.have.property('germline', null);
            });
        });
        it('errors when a term is not specified', () => {
            return db.models.CategoryEvent.createRecord({type: EVENT_TYPE.RNA, primary_feature: primary_feature})
                .then(() => {
                    expect.fail('expected error');
                }).catch(AttributeError, () => {});
        });
        it('errors on null term', () => {
            return db.models.CategoryEvent.createRecord({type: EVENT_TYPE.RNA, term: null, primary_feature: primary_feature})
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('errors on invalid zygosity', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA, zygosity: 'invalid', primary_feature: primary_feature})
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('allows null (not specified) zygosity', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA, zygosity: null, primary_feature: primary_feature})
                .then((record) => {
                    expect(record).to.be.instanceof(Record);
                    expect(record.content).to.have.property('zygosity', null);
                    expect(record.content).to.have.property('germline', null);
                });
        });
        it('defaults no zygosity to null and germline to null', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA, primary_feature: primary_feature})
                .then((record) => {
                    expect(record).to.be.instanceof(Record);
                    expect(record.content).to.have.property('term', 'not specified');
                    expect(record.content).to.have.property('zygosity', null);
                    expect(record.content).to.have.property('germline', null);
                    expect(record.content).to.have.property('type', EVENT_TYPE.RNA);
                });
        });
        it('errors on invalid event type', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: 'invalid', primary_feature: primary_feature})
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('errors on no event type', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', primary_feature: primary_feature})
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('errors on null event type', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: null, primary_feature: primary_feature})
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('errors on no primary_feature', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA})
                .then(() => {
                    expect.fail('expected error');
                }).catch(AttributeError, () => {});
        });
        it('errors on null primary_feature', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA, primary_feature: null})
                .then(() => {
                    expect.fail('expected error');
                }).catch(AttributeError, () => {});
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
