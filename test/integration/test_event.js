'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, Base, Record, History, KBRole, KBUser} = require('./../../app/repo/base');
const {CategoryEvent, PositionalEvent, Event, EVENT_TYPE, EVENT_SUBTYPE, ZYGOSITY} = require('./../../app/repo/event');
const {Feature, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const {Position, CodingSequencePosition, GenomicPosition, ProteinPosition} = require('./../../app/repo/position');
const {Context} = require('./../../app/repo/context');
const cache = require('./../../app/repo/cached/data');
const Promise = require('bluebird');
const {AttributeError, ControlledVocabularyError} = require('./../../app/repo/error');
const {PERMISSIONS} = require('./../../app/repo/constants');


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
    let server, db, primary_feature, secondary_feature, user;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        connectServer(conf)
            .then((s) => {
                server = s;
                return server.exists({name: conf.emptyDbName});
            }).then((exists) => {
                if (exists) {
                    return server.drop({name: conf.emptyDbName});
                } else {
                    return Promise.resolve();
                }
            }).then(() => {
                return createDB({
                    name: conf.emptyDbName, 
                    username: conf.dbUsername, 
                    password: conf.dbPassword, 
                    server: server,
                    heirarchy: [
                        [KBRole, History],
                        [KBUser],
                        [KBVertex, KBEdge],
                        [Context, Position],
                        [Feature, GenomicPosition, CodingSequencePosition, ProteinPosition]
                    ]
                });
            }).then((result) => {
                db = result;
            }).then(() => {
                return db.models.KBRole.createRecord({name: 'admin', rules: {'kbvertex': PERMISSIONS.ALL}});
            }).then((role) => {
                return db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
            }).then((result) => {
                user = result.content.username;
                return Promise.all([
                    db.models.Feature.createRecord({name: 'HUGO1', source: FEATURE_SOURCE.HGNC, biotype: FEATURE_BIOTYPE.GENE}, user),
                    db.models.Feature.createRecord({name: 'HUGO2', source: FEATURE_SOURCE.HGNC, biotype: FEATURE_BIOTYPE.GENE}, user)
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
                    expect(cls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'absence_of', 'version', 'start', 'end', 'type', 'subtype');
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
                start: {pos: 1}, end: {pos: 1},  absence_of: true, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors when event start > end position', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, end: {pos: 1}, absence_of: true, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors when end is undefined and subtype is insertion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('allows end to be undefined', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DUP
            }, user, GenomicPosition.clsname).then((rec) => {
                expect(rec).to.not.have.property('end');
                expect(rec).to.not.have.property('secondary_feature');
            });
        });
        it('errors on start undefined', () => {
            return db.models.PositionalEvent.createRecord({
                end: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DUP
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(TypeError, () => {});
        });
        it('errors on start null', () => {
            return db.models.PositionalEvent.createRecord({
                start: null, end: {pos: 2},  absence_of: true, absence_of: true, primary_feature: primary_feature, type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DUP
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(TypeError, () => {});
        });
        it('errors on invalid event subtype', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT, subtype: 'invalid'
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on null subtype', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT, subtype: null
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on subtype undefined', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on null untemplated_seq', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.INDEL, untemplated_seq: null
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on null reference_seq', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.INDEL, reference_seq: null
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on primary_feature undefined', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, type: EVENT_TYPE.MUT,  absence_of: true, subtype: EVENT_TYPE.INDEL
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on untemplated_seq for subtype=deletion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature,  absence_of: true,
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.DEL, untemplated_seq: 'A'
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on reference_seq for subtype=insertion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, end: {pos: 3}, 
                primary_feature: primary_feature,  absence_of: true, 
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS, reference_seq: 'A'
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('allows untemplated_seq for insertion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, end: {pos: 3}, primary_feature: primary_feature, absence_of: true,
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INS, untemplated_seq: 'A'
            }, user, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('untemplated_seq', 'A');
            });
        });
        it('allows reference_seq for deletion', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, type: EVENT_TYPE.MUT,  absence_of: true, subtype: EVENT_SUBTYPE.DEL, reference_seq: 'A'
            }, user, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('reference_seq', 'A');
            });
        });
        it('allows collection_method', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, collection_method: 'mass spec', primary_feature: primary_feature, type: EVENT_TYPE.MUT,  absence_of: true, subtype: EVENT_SUBTYPE.DEL, reference_seq: 'A'
            }, user, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('reference_seq', 'A');
            });
        });
        it('allows untemplated_seq and reference_seq for indel', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, 
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.INDEL,  absence_of: true, reference_seq: 'A', untemplated_seq: 'CC'
            }, user, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('untemplated_seq', 'CC');
                expect(rec.content).to.have.property('reference_seq', 'A');
            });
        });
        it('allows untemplated_seq and reference_seq for sub', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature,  absence_of: true,
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.SUB, reference_seq: 'A', untemplated_seq: 'C'
            }, user, GenomicPosition.clsname).then((rec) => {
                expect(rec.content).to.have.property('untemplated_seq', 'C');
                expect(rec.content).to.have.property('reference_seq', 'A');
            });
        });
        it('errors on substitution where reference_seq is not length 1', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature, absence_of: true, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, reference_seq: 'AA'
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on substitution where untemplated_seq is not length 1', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature,  absence_of: true, type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, untemplated_seq: 'AA'
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on substitution where untemplated_seq = reference_seq if not protein', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature,  absence_of: true,
                type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, untemplated_seq: 'A', reference_seq: 'A'
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors on indel where the length of untemplated_seq and reference_seq is 1', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature,  absence_of: true,
                type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, untemplated_seq: 'A', reference_seq: 'A'
            }, user, GenomicPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('errors if termination_aa is specified and the subtype is not frameshift', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature,  absence_of: true,
                type: EVENT_TYPE.MUT, subtype: EVENT_TYPE.SUB, untemplated_seq: 'A', reference_seq: 'A', termination_aa: 1
            }, user, ProteinPosition.clsname).then((rec) => {
                console.log('should have failed:', rec.content);
                expect.fail();
            }).catch(AttributeError, () => {});
        });
        it('allows termination_aa to be specified for frameshifts', () => {
            return db.models.PositionalEvent.createRecord({
                start: {pos: 2}, primary_feature: primary_feature,  absence_of: true,
                type: EVENT_TYPE.MUT, subtype: EVENT_SUBTYPE.FS, reference_seq: 'A', untemplated_seq: 'C', termination_aa: 110
            }, user, ProteinPosition.clsname).then((rec) => {
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
            return db.models.CategoryEvent.createRecord({type: EVENT_TYPE.RNA, primary_feature: primary_feature, term: 'gain'}, user)
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('allows term specific to copy number variants', () => {
            return db.models.CategoryEvent.createRecord({
                term: 'gain', 
                type: EVENT_TYPE.CNV, 
                zygosity: null, 
                primary_feature: primary_feature, absence_of: true,
            }, user).then((record) => {
                expect(record).to.be.instanceof(Record);
                expect(record.content).to.have.property('zygosity', null);
                expect(record.content).to.have.property('germline', null);
            });
        });
        it('allows term non-specific for CNVs', () => {
            return db.models.CategoryEvent.createRecord({
                term: 'not specified', 
                type: EVENT_TYPE.CNV, 
                zygosity: null,  absence_of: true,
                primary_feature: primary_feature
            }, user).then((record) => {
                expect(record).to.be.instanceof(Record);
                expect(record.content).to.have.property('zygosity', null);
                expect(record.content).to.have.property('germline', null);
            });
        });
        it('allows collection_method', () => {
            return db.models.CategoryEvent.createRecord({
                term: 'not specified', 
                type: EVENT_TYPE.CNV,
                collection_method: 'mass spec', 
                zygosity: null,  absence_of: true,
                primary_feature: primary_feature
            }, user).then((record) => {
                expect(record).to.be.instanceof(Record);
                expect(record.content).to.have.property('zygosity', null);
                expect(record.content).to.have.property('germline', null);
            });
        });
        it('errors when a term is not specified', () => {
            return db.models.CategoryEvent.createRecord({type: EVENT_TYPE.RNA,  absence_of: true, primary_feature: primary_feature}, user)
                .then(() => {
                    expect.fail('expected error');
                }).catch(AttributeError, () => {});
        });
        it('errors on null term', () => {
            return db.models.CategoryEvent.createRecord({type: EVENT_TYPE.RNA, term: null,  absence_of: true, primary_feature: primary_feature}, user)
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('errors on invalid zygosity', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA, zygosity: 'invalid',  absence_of: true, primary_feature: primary_feature}, user)
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('allows null (not specified) zygosity', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA, zygosity: null, absence_of: true, primary_feature: primary_feature}, user)
                .then((record) => {
                    expect(record).to.be.instanceof(Record);
                    expect(record.content).to.have.property('zygosity', null);
                    expect(record.content).to.have.property('germline', null);
                });
        });
        it('defaults no zygosity to null and germline to null', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA,  absence_of: true, absence_of: true, primary_feature: primary_feature}, user)
                .then((record) => {
                    expect(record).to.be.instanceof(Record);
                    expect(record.content).to.have.property('term', 'not specified');
                    expect(record.content).to.have.property('zygosity', null);
                    expect(record.content).to.have.property('germline', null);
                    expect(record.content).to.have.property('type', EVENT_TYPE.RNA);
                });
        });
        it('errors on invalid event type', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: 'invalid',  absence_of: true, primary_feature: primary_feature}, user)
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('errors on no event type', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified',  absence_of: true, primary_feature: primary_feature}, user)
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('errors on null event type', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: null, absence_of: true, primary_feature: primary_feature}, user)
                .then(() => {
                    expect.fail('expected error');
                }).catch(ControlledVocabularyError, () => {});
        });
        it('errors on no primary_feature', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA}, user)
                .then(() => {
                    expect.fail('expected error');
                }).catch(AttributeError, () => {});
        });
        it('errors on null primary_feature', () => {
            return db.models.CategoryEvent.createRecord({term: 'not specified', type: EVENT_TYPE.RNA,  absence_of: true, primary_feature: null}, user)
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
