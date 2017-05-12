'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');
const {KBVertex, KBEdge, History} = require('./../../app/repo/base');
const {Vocab} = require('./../../app/repo/vocab');
const {Feature, SOURCE, BIOTYPE} = require('./../../app/repo/feature');
const cache = require('./../../app/repo/cached/data');
const {ControlledVocabularyError, AttributeError} = require('./../../app/repo/error');
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
    
    describe('validateContent', () => {
        let currClass;
        beforeEach((done) => {
            Feature.createClass(db)
                .then((cls) => {
                    currClass = cls;
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        describe(SOURCE.HGNC, () => {
            let validEntry;
            beforeEach(function(done) {
                validEntry = {source: SOURCE.HGNC, biotype: BIOTYPE.GENE, name: 'KRAS', source_version: '2017-01-01'};
                done();
            });

            it('allows valid', () => {
                expect(() => {
                    return currClass.validateContent(validEntry);
                }).to.not.throw(AttributeError);
            });
            it('errors on invalid source_version', () => {
                validEntry.source_version = '2017-12-1';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('allows source_version to be null', () => {
                validEntry.source_version = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.not.throw(AttributeError);
            });
            it('errors if source_version is not defined', () => {
                delete validEntry.source_version;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on invalid biotype', () => {
                validEntry.biotype = BIOTYPE.PROTEIN;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on null biotype', () => {
                validEntry.biotype = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors if biotype is not defined', () => {
                delete validEntry.biotype;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on invalid name', () => {
                validEntry.name = 'abc';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
                validEntry.name = '1RAS';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on null name', () => {
                validEntry.name = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors if name is not defined', () => {
                delete validEntry.name;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
        });
        describe(SOURCE.ENSEMBL, () => {
            let validEntry;
            beforeEach(function(done) {
                validEntry = {source: SOURCE.ENSEMBL, biotype: BIOTYPE.GENE, name: 'ENSG001', source_version: '69'};
                done();
            });

            it('allows valid gene', () => {
                expect(() => {
                    return currClass.validateContent(validEntry);
                }).to.not.throw(AttributeError);
            });
            it('allows valid protein', () => {
                validEntry.biotype = BIOTYPE.PROTEIN;
                validEntry.name = 'ENSP001';
                expect(() => {
                    return currClass.validateContent(validEntry);
                }).to.not.throw(AttributeError);
            });
            it('allows valid transcript', () => {
                validEntry.biotype = BIOTYPE.TRANSCRIPT;
                validEntry.name = 'ENST001';
                expect(() => {
                    return currClass.validateContent(validEntry);
                }).to.not.throw(AttributeError);
            });
            it('errors on bad string for source_version', () => {
                validEntry.source_version = 'v69';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('allows source_version to be null', () => {
                validEntry.source_version = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.not.throw(AttributeError);
            });
            it('errors if source_version is not defined', () => {
                delete validEntry.source_version;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on invalid biotype', () => {
                validEntry.biotype = BIOTYPE.TEMPLATE;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on null biotype', () => {
                validEntry.biotype = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors if biotype is not defined', () => {
                delete validEntry.biotype;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on invalid name', () => {
                validEntry.name = 'ENST001';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
                validEntry.name = 'ENSP001';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on null name', () => {
                validEntry.name = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors if name is not defined', () => {
                delete validEntry.name;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
        });
        describe(SOURCE.REFSEQ, () => {
            let validEntry;
            beforeEach(function(done) {
                validEntry = {source: SOURCE.REFSEQ, biotype: BIOTYPE.GENE, name: 'NG_001', source_version: '1'};
                done();
            });

            it('allows valid gene', () => {
                expect(() => {
                    return currClass.validateContent(validEntry);
                }).to.not.throw(AttributeError);
            });
            it('allows valid protein', () => {
                validEntry.biotype = BIOTYPE.PROTEIN;
                validEntry.name = 'NP_001';
                expect(() => {
                    return currClass.validateContent(validEntry);
                }).to.not.throw(AttributeError);
            });
            it('allows valid transcript', () => {
                validEntry.biotype = BIOTYPE.TRANSCRIPT;
                validEntry.name = 'NM_001';
                expect(() => {
                    return currClass.validateContent(validEntry);
                }).to.not.throw(AttributeError);
            });
            it('errors on bad string for source_version', () => {
                validEntry.source_version = 'v1';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('allows null source_version', () => {
                validEntry.source_version = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.not.throw(AttributeError);
            });
            it('errors if source_version is not defined', () => {
                delete validEntry.source_version;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on bad string for biotype', () => {
                validEntry.biotype = BIOTYPE.TEMPLATE;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on null biotype', () => {
                validEntry.biotype = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors if biotype is not defined', () => {
                delete validEntry.biotype;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on bad string for name', () => {
                validEntry.name = 'NP_001';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
                validEntry.name = 'NM_001';
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors on null name', () => {
                validEntry.name = null;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
            it('errors when name is not defined', () => {
                delete validEntry.name;
                expect(() => { return currClass.validateContent(validEntry); }).to.throw(AttributeError);
            });
        });
        it('errors on invalid source', () => {
            let entry = {source: SOURCE.HGNC, biotype: BIOTYPE.GENE, name: null, source_version: '2017-01-01'};
            expect(() => { return currClass.validateContent(entry); }).to.throw(AttributeError);
        });
    });
    describe('indices', () => {
        let currClass;
        beforeEach((done) => {
            Feature.createClass(db)
                .then((cls) => {
                    currClass = cls;
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('errors on active name not unique');
        it('allows name duplicate when one node is deleted');
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
