'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, Base, Record, History} = require('./../../app/repo/base');
const {CategoryEvent, PositionalEvent, Event, EVENT_TYPE, EVENT_SUBTYPE} = require('./../../app/repo/event');
const {Feature, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const Promise = require('bluebird');
const {AttributeError, ControlledVocabularyError} = require('./../../app/repo/error');


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
                return Context.createClass(db);
            }).then(() => {
                return Feature.createClass(db);
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
    it('create the PositionalEvent class');
    it('create the CategoryEvent class');

    describe('PositionalEvent', () => {
        it('allows events with same start/end positions');
        it('errors when event start > end position');
        it('errors on either position not given');
        it('errors on invalid event subtype');
        it('errors on null subtype');
        it('allows no subtype');
        it('allows no untemplated_seq');
        it('errors on null untemplated_seq');
        it('errors on null reference_seq');
        it('allows no reference_seq');
        it('errors on no feature specified');
        it('errors on more than two features');
        it('errors on feature not found in database');
    });
    
    describe('CategoryEvent', () => {
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
        it('errors on invalid term for any event type');
        it('errors on invalid term for RNA expression event');
        it('allows term specific to copy number variants');
        it('allows term non-specific for CNVs');
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
                }).catch(AttributeError, () => {});
        });
        it('errors on invalid zygosity');
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
        it('errors on invalid event type');
        it('errors on no event type');
        it('errors on null event type');
        it('errors on more than one feature');
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
