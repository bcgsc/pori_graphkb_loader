'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');
const {KBVertex, KBEdge, History} = require('./../../app/repo/base');
const {Vocab} = require('./../../app/repo/vocab');
const {Feature} = require('./../../app/repo/feature');
const cache = require('./../../app/repo/cached/data');
const {ControlledVocabularyError} = require('./../../app/repo/error');
const Promise = require('bluebird');



describe('Feature schema tests:', () => {
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

    it('create the feature class', () => {
        Feature.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.include('name', 'biotype', 'uuid', 'version', 'source', 'source_version', 'created_at', 'deleted_at');
            });
    });
    
    describe('create record', () => {
        it('allows no biotype');
        it('errors on no name');
        it('errors on null name');
        it('errors on no source');
        it('errors on null source');
        it('errors on no source_version');
        it('allows null source_version');
        it('errors on duplicate name + source + source_version where deleted_at=null');
        it('allows update of biotype without violating unique index');
    });

    describe('controlled vocabulary', () => {
        let curClass, vocabClass;
        beforeEach((done) => {
            Vocab.createClass(db)
                .then((cls) => {
                    vocabClass = cls;
                    return Feature.createClass(db);
                }).then((cls) => {
                    curClass = cls;
                    return Promise.all([
                        vocabClass.createRecord({class: Feature.clsname, property: 'biotype', term: 'protein'}),
                        vocabClass.createRecord({class: Feature.clsname, property: 'biotype', term: 'gene'})
                    ]);
                }).then(() => {
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('errors on invalid biotype', () => {
            return curClass.createRecord({name: 'KRAS', biotype: 'invalid', source: 'HUGO', source_version: null})
                .then((record) => {
                    console.log(record);
                    expect.fail('expected an error'); 
                }, (error) => {
                    expect(error).to.be.instanceof(ControlledVocabularyError);
                })
        });
        it('allows on valid biotype');
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
