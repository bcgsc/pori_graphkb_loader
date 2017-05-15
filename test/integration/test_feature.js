'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History} = require('./../../app/repo/base');
const {Vocab} = require('./../../app/repo/vocab');
const {Feature, FeatureDeprecatedBy, SOURCE, BIOTYPE} = require('./../../app/repo/feature');
const cache = require('./../../app/repo/cached/data');
const {ControlledVocabularyError, AttributeError} = require('./../../app/repo/error');
const Promise = require('bluebird');
const {expectDuplicateKeyError} = require('./orientdb_errors');



describe('Feature schema tests:', () => {
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
                    models: {KBVertex, KBEdge, History}
                });
            }).then((result) => {
                db = result.db;
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
        it('errors on active name not unique within source/version', () => {
            const entry = {source: SOURCE.REFSEQ, biotype: BIOTYPE.GENE, name: 'NG_001', source_version: null};
            return currClass.createRecord(entry)
                .then((record) => {
                    return currClass.createRecord(entry);
                }, (error) => {
                    expect.fail('failed on initial record creation');
                }).then((record2) => {
                    expect.fail('expected an error');
                }).catch((error) => {
                    expectDuplicateKeyError(error);
                });
        });
        it('allows name duplicate within a source in different source versions', () => {
            const entry = {source: SOURCE.REFSEQ, biotype: BIOTYPE.GENE, name: 'NG_001', source_version: null};
            const secondEntry = {source: SOURCE.REFSEQ, biotype: BIOTYPE.GENE, name: 'NG_001', source_version: 1};
            return currClass.createRecord(entry)
                .then((record) => {
                    expect(record).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                    return currClass.createRecord(secondEntry);
                }, (error) => {
                    expect.fail('failed on initial record creation');
                }).then((record2) => {
                    expect(record2).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                });
        });
        it('allows name duplicate when one node is deleted', () => {
            const entry = {source: SOURCE.REFSEQ, biotype: BIOTYPE.GENE, name: 'NG_001', source_version: null};
            return currClass.createRecord(entry)
                .then((record) => {
                    expect(record).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                    record.source_version = 1;
                    return currClass.updateRecord(record);
                }, (error) => {
                    expect.fail('failed on initial record creation');
                }).then((record2) => {
                    expect(record2).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                });
        });
        it('allows name duplicates in separate sources', () => {
            const entry = {source: SOURCE.ENSEMBL, biotype: BIOTYPE.GENE, name: 'ENSG001', source_version: null};
            const secondEntry = {source: SOURCE.HGNC, biotype: BIOTYPE.GENE, name: 'ENSG001', source_version: null};
            return currClass.createRecord(entry)
                .then((record) => {
                    expect(record).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                    return currClass.createRecord(secondEntry);
                }, (error) => {
                    expect.fail('failed on initial record creation');
                }).then((record2) => {
                    expect(record2).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
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


describe('Feature.validateContent', () => {
    let server, db, currClass;
    before(function(done) { /* build and connect to the empty database */
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
                    models: {KBVertex, KBEdge, History}
                });
            }).then((result) => {
                db = result.db;
                return Feature.createClass(db);
            }).then((cls) => {
                currClass = cls;
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });

    describe(SOURCE.HGNC, () => {
        let validEntry;
        beforeEach(function(done) {
            validEntry = {source: SOURCE.HGNC, biotype: BIOTYPE.GENE, name: 'KRAS', source_version: 20170101};
            done();
        });

        it('allows valid', () => {
            expect(() => {
                return currClass.validateContent(validEntry);
            }).to.not.throw(AttributeError);
        });
        it('allows source_version to be null', () => {
            validEntry.source_version = null;
            expect(() => { return currClass.validateContent(validEntry); }).to.not.throw(AttributeError);
        });
        it('source_version defaults to null', () => {
            delete validEntry.source_version;
            const record = currClass.validateContent(validEntry)
            expect(record).to.have.property('source_version', null);
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
            validEntry = {source: SOURCE.ENSEMBL, biotype: BIOTYPE.GENE, name: 'ENSG001', source_version: 69};
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
        it('allows source_version to be null', () => {
            validEntry.source_version = null;
            expect(() => { return currClass.validateContent(validEntry); }).to.not.throw(AttributeError);
        });
        it('source_version defaults to null', () => {
            delete validEntry.source_version;
            const record = currClass.validateContent(validEntry)
            expect(record).to.have.property('source_version', null);
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
            validEntry = {source: SOURCE.REFSEQ, biotype: BIOTYPE.GENE, name: 'NG_001', source_version: 1};
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
        it('allows null source_version', () => {
            validEntry.source_version = null;
            expect(() => { return currClass.validateContent(validEntry); }).to.not.throw(AttributeError);
        });
        it('source_version defaults to null', () => {
            delete validEntry.source_version;
            const record = currClass.validateContent(validEntry)
            expect(record).to.have.property('source_version', null);
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
    describe(SOURCE.LRG, () => {});
    describe(SOURCE.GRC, () => {});
    it('errors on invalid source', () => {
        let entry = {source: SOURCE.HGNC, biotype: BIOTYPE.GENE, name: null, source_version: '2017-01-01'};
        expect(() => { return currClass.validateContent(entry); }).to.throw(AttributeError);
    });

    after((done) => {
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


// test FeatureDeprecatedBy
describe('FeatureDeprecatedBy', () => {
    let server, db, deprecatedByClass, featureClass;
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
                    models: {KBVertex, KBEdge, History}
                });
            }).then((result) => {
                db = result.db;
                return Promise.all([
                    FeatureDeprecatedBy.createClass(db),
                    Feature.createClass(db)
                ]);
            }).then((clsList) => {
                [deprecatedByClass, featureClass] = clsList;
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });

    it('errors when deprecating a feature with a different biotype', () => {
        return Promise.all([
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENSG001', biotype: BIOTYPE.GENE, source_version: 10}),
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENST001', biotype: BIOTYPE.TRANSCRIPT, source_version: 11})
        ]).then((recList) => {
            return deprecatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            console.log(edge);
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    it('errors when deprecating a feature with a different source', () => {
        return Promise.all([
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENSG001', biotype: BIOTYPE.GENE, source_version: 10}),
            featureClass.createRecord({source: SOURCE.REFSEQ, name: 'NG_001', biotype: BIOTYPE.GENE, source_version: 11})
        ]).then((recList) => {
            return deprecatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            console.log(edge);
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    it('errors when the deprecated version is not lower than the new version', () => {
        return Promise.all([
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENSG001', biotype: BIOTYPE.GENE, source_version: 11}),
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENSG002', biotype: BIOTYPE.GENE, source_version: 11})
        ]).then((recList) => {
            return deprecatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            console.log(edge);
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
    it('errors when null version deprecates non-null version', () => {
        return Promise.all([
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENSG001', biotype: BIOTYPE.GENE, source_version: 10}),
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENSG001', biotype: BIOTYPE.GENE, source_version: null})
        ]).then((recList) => {
            return deprecatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            console.log(edge);
            expect.fail('should not have been able to create the record');
        }, (error) => {
            expect(error).to.be.instanceof(AttributeError);
        });
    });
     it('allows version higher', () => {
        return Promise.all([
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENSG001', biotype: BIOTYPE.GENE, source_version: 10}),
            featureClass.createRecord({source: SOURCE.ENSEMBL, name: 'ENSG001', biotype: BIOTYPE.GENE, source_version: 11})
        ]).then((recList) => {
            return deprecatedByClass.createRecord({in: recList[0], out: recList[1]});
        }).then((edge) => {
            expect(edge).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
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
