'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');
const {AttributeError} = require('./../../app/repo/error');
const {History, KBVertex, KBEdge} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');
const {fetchValues, Vocab} = require('./../../app/repo/vocab');


describe('Vocab schema tests:', () => {
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

    it('create the class', () => {
        return Vocab.createClass(db)
            .then((result) => {
                expect(result.propertyNames).to.include('class', 'property', 'term', 'definition', 'uuid', 'created_at', 'deleted_at', 'version');
                expect(result.isAbstract).to.be.false;
            });
    });

    describe('class dependent', () => {
        let vocabInstance;
        beforeEach(function(done) {
            Vocab.createClass(db)
                .then((result) => {
                    vocabInstance = result;
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('create record: error on duplicate within category', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'})
                .then(()  => {
                    return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'});
                }, (error) => {
                    assert.fail('creating the initial record failed', error);
                }).then(() => {
                    assert.fail('expected duplicate key error');
                }, (error) => {
                    oError.expectDuplicateKeyError(error);
                });
        });
        it('update record definition', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'})
                .then((record)  => {
                    expect(record).to.have.property('class', 'feature');
                    expect(record).to.have.property('property', 'biotype');
                    expect(record).to.have.property('term', 'protein');
                    expect(record).to.have.property('version', 0);
                    record.definition = 'this is a defn';
                    return vocabInstance.updateRecord(record);
                }, (error) => {
                    assert.fail('creating the initial record failed', error);
                }).then((updated) => {
                    expect(updated).to.have.property('version', 1);
                    expect(updated).to.have.property('definition', 'this is a defn');
                    expect(updated).to.have.property('class', 'feature');
                    expect(updated).to.have.property('property', 'biotype');
                    expect(updated).to.have.property('term', 'protein');
                });
        });
        it('create record: allows different terms within same class & property', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'})
                .then((first)  => {
                    expect(first).to.have.property('class', 'feature');
                    expect(first).to.have.property('property', 'biotype');
                    expect(first).to.have.property('term', 'protein');
                    return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'gene'});
                }).then((second) => {
                    expect(second).to.have.property('class', 'feature');
                    expect(second).to.have.property('property', 'biotype');
                    expect(second).to.have.property('term', 'gene');
                });
        });
        it('create record: allows duplicate terms when property is different', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'name', term: 'protein'})
                .then((first)  => {
                    expect(first).to.have.property('class', 'feature');
                    expect(first).to.have.property('property', 'name');
                    expect(first).to.have.property('term', 'protein');
                    return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'});
                }).then((second) => {
                    expect(second).to.have.property('class', 'feature');
                    expect(second).to.have.property('property', 'biotype');
                    expect(second).to.have.property('term', 'protein');
                });
        });
        it('pull table into json', () => {
            return Promise.all([
                vocabInstance.createRecord({class: 'feature', property: 'name', term: 'protein', definition: ''}),
                vocabInstance.createRecord({class: 'feature', property: 'name', term: 'gene'}),
                vocabInstance.createRecord({class: 'other', property: 'name', term: 'protein'})
            ]).then(() => {
                return fetchValues(db);
            }).then((cache) => {
                console.log(cache);
                expect(cache).to.have.property('feature');
                expect(cache).to.have.property('other');
                expect(cache.feature).to.have.property('name');
                expect(cache.feature.name).to.have.property('protein', '');
                expect(cache.feature.name).to.have.property('gene', undefined);
                expect(cache.other).to.have.property('name');
                expect(cache.other.name).to.have.property('protein');
            });
        });
        it('cache: create initial');
        it('cache: update an entry');
        it('cache: delete something');
        it('cache: add a new entry');
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
