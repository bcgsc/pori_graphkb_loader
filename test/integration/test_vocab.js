'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer} = require('./../../app/repo/connect');
const {AttributeError} = require('./../../app/repo/error');
const {History, KBVertex, KBEdge, Record} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');
const {fetchValues, Vocab} = require('./../../app/repo/vocab');
const cache = require('./../../app/repo/cached/data');
const data = require('./data.json');
const Promise = require('bluebird');



describe('Vocab schema tests:', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        connectServer(conf)
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
                expect(cache.vocab).to.not.have.property('feature');
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
        it('allows createRecords to create multiple records', () => {
            return vocabInstance.createRecords(data.vocab)
                .then(() => {
                    expect(cache.vocab).to.have.property('feature');
                    expect(cache.vocab.feature).to.have.property('biotype');
                    expect(cache.vocab.feature.biotype).to.include.keys('protein', 'gene', 'template', 'exon', 'domain', 'transcript');
                }).catch((error) => {
                    console.log(error);
                    throw error;
                });
        });
        it('allows createRecords to create multiple records when some already exist', () => {
            return vocabInstance.createRecords(data.vocab)
                .then(() => {
                    return vocabInstance.createRecords(data.vocab);
                }).then(() => {
                    expect(cache.vocab).to.have.property('feature');
                    expect(cache.vocab.feature).to.have.property('biotype');
                    expect(cache.vocab.feature.biotype).to.include.keys('protein', 'gene', 'template', 'exon', 'domain', 'transcript');
                });
        });
        it('errors createRecord on duplicate within category', () => {
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
        it('allows updateRecord', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'})
                .then((record)  => {
                    expect(record).to.be.an.instanceof(Record);
                    expect(record.content).to.have.property('class', 'feature');
                    expect(record.content).to.have.property('property', 'biotype');
                    expect(record.content).to.have.property('term', 'protein');
                    expect(record.content).to.have.property('version', 0);
                    record.content.definition = 'this is a defn';
                    return vocabInstance.updateRecord(record.content);
                }, (error) => {
                    console.log(error);
                    expect.fail('creating the initial record failed', error);
                }).then((updated) => {
                    expect(updated.content).to.have.property('version', 1);
                    expect(updated.content).to.have.property('definition', 'this is a defn');
                    expect(updated.content).to.have.property('class', 'feature');
                    expect(updated.content).to.have.property('property', 'biotype');
                    expect(updated.content).to.have.property('term', 'protein');
                });
        });
        it('allows updateDefinition to update record definition', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'})
                .then((record)  => {
                    expect(record.content).to.have.property('class', 'feature');
                    expect(record.content).to.have.property('property', 'biotype');
                    expect(record.content).to.have.property('term', 'protein');
                    expect(record.content).to.have.property('version', 0);
                    record.content.definition = 'this is a defn';
                    return vocabInstance.updateDefinition(record.content);
                }, (error) => {
                    assert.fail('creating the initial record failed', error);
                }).then((updated) => {
                    expect(updated.content).to.have.property('version', 1);
                    expect(updated.content).to.have.property('definition', 'this is a defn');
                    expect(updated.content).to.have.property('class', 'feature');
                    expect(updated.content).to.have.property('property', 'biotype');
                    expect(updated.content).to.have.property('term', 'protein');
                });
        });
        it('create record: allows different terms within same class & property', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'})
                .then((first)  => {
                    expect(first.content).to.have.property('class', 'feature');
                    expect(first.content).to.have.property('property', 'biotype');
                    expect(first.content).to.have.property('term', 'protein');
                    return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'gene'});
                }).then((second) => {
                    expect(second.content).to.have.property('class', 'feature');
                    expect(second.content).to.have.property('property', 'biotype');
                    expect(second.content).to.have.property('term', 'gene');
                });
        });
        it('create record: allows duplicate terms when property is different', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'name', term: 'protein'})
                .then((first)  => {
                    expect(first.content).to.have.property('class', 'feature');
                    expect(first.content).to.have.property('property', 'name');
                    expect(first.content).to.have.property('term', 'protein');
                    return vocabInstance.createRecord({class: 'feature', property: 'biotype', term: 'protein'});
                }).then((second) => {
                    expect(second.content).to.have.property('class', 'feature');
                    expect(second.content).to.have.property('property', 'biotype');
                    expect(second.content).to.have.property('term', 'protein');
                });
        });

        it('create record updates cache', () => {
            return vocabInstance.createRecord({class: 'feature', property: 'name', term: 'protein'})
                .then((first)  => {
                    expect(cache.vocab.feature).to.be.instanceof(Object);
                });
        });
        it('pull table into json', () => {
            return Promise.all([
                vocabInstance.createRecord({class: 'feature', property: 'name', term: 'protein', definition: ''}),
                vocabInstance.createRecord({class: 'feature', property: 'name', term: 'gene'}),
                vocabInstance.createRecord({class: 'other', property: 'name', term: 'protein'})
            ]).then(() => {
                return fetchValues(db);
            }).then((localCache) => {
                expect(localCache).to.have.property('feature');
                expect(localCache).to.have.property('other');
                expect(localCache.feature).to.have.property('name');
                expect(localCache.feature.name).to.have.property('protein');
                expect(localCache.feature.name).to.have.property('gene');
                expect(localCache.other).to.have.property('name');
                expect(localCache.other.name).to.have.property('protein');
            });
        });
        it('cache: delete something', () => {
            return Promise.all([
                vocabInstance.createRecord({class: 'feature', property: 'name', term: 'protein', definition: ''}),
            ]).then((record) => {
                return fetchValues(db);
            }).then((localCache) => {
                expect(localCache).to.have.property('feature');
                expect(localCache.feature).to.have.property('name');
                expect(localCache.feature.name).to.have.property('protein');
                return vocabInstance.deleteRecord({class: 'feature', property: 'name', term: 'protein'});
            }).then((localCache) => {
                expect(localCache).to.not.have.property('feature');
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
                done(error);
            });
    });
});
