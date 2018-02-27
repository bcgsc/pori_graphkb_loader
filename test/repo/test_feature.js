'use strict';
const {expect} = require('chai');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const {AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const Promise = require('bluebird');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {setUpEmptyDB, tearDownEmptyDB} = require('./util');


const expectPromiseFail = (promise, errorClass) => {
    return promise
        .then((result) => {
            throw new Error('expected error');
        }).catch((err) => {
            expect(err).to.be.instanceof(errorClass);
        });
};


describe('Feature schema tests:', () => {
    let server, db, user;
    beforeEach(async () => { 
        ({server, db, user} = await setUpEmptyDB());
        await Context.createClass(db);
    });

    it('create the feature class', () => {
        return Feature.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.include('name', 'biotype', 'uuid', 'version', 'source', 'source_version', 'created_at', 'deleted_at');
            });
    });

    describe('indices', () => {
        beforeEach(async () => {
            await Feature.createClass(db);
        });
        it('errors on active name not unique within source/version', () => {
            const entry = {source: FEATURE_SOURCE.REFSEQ, biotype: FEATURE_BIOTYPE.GENE, name: 'NG_001', source_version: null};
            return db.models.Feature.createRecord(entry, user)
                .then(() => {
                    return db.models.Feature.createRecord(entry, user);
                }, (error) => {
                    console.log(error);
                    expect.fail('failed on initial record creation');
                }).then((record2) => {
                    console.log(record2);
                    expect.fail('expected an error');
                }).catch((error) => {
                    expectDuplicateKeyError(error);
                });
        });
        it('allows name duplicate within a source in different source versions', () => {
            const entry = {source: FEATURE_SOURCE.REFSEQ, biotype: FEATURE_BIOTYPE.GENE, name: 'NG_001', source_version: null};
            const secondEntry = {source: FEATURE_SOURCE.REFSEQ, biotype: FEATURE_BIOTYPE.GENE, name: 'NG_001', source_version: 1};
            return db.models.Feature.createRecord(entry, user)
                .then((record) => {
                    expect(record.content).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                    return db.models.Feature.createRecord(secondEntry, user);
                }, () => {
                    expect.fail('failed on initial record creation');
                }).then((record2) => {
                    expect(record2.content).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                });
        });
        it('allows name duplicate when one node is deleted', () => {
            const entry = {source: FEATURE_SOURCE.REFSEQ, biotype: FEATURE_BIOTYPE.GENE, name: 'NG_001', source_version: null};
            return db.models.Feature.createRecord(entry, user)
                .then((record) => {
                    expect(record.content).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                    record.content.source_version = 1;
                    return db.models.Feature.updateRecord(record, user);
                }, () => {
                    expect.fail('failed on initial record creation');
                }).then((record2) => {
                    expect(record2.content).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                });
        });
        it('allows name duplicates in separate sources', () => {
            const entry = {source: FEATURE_SOURCE.ENSEMBL, biotype: FEATURE_BIOTYPE.GENE, name: 'ENSG001', source_version: null};
            const secondEntry = {source: FEATURE_SOURCE.HGNC, biotype: FEATURE_BIOTYPE.GENE, name: 'ENSG001', source_version: null};
            return db.models.Feature.createRecord(entry, user)
                .then((record) => {
                    expect(record.content).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                    return db.models.Feature.createRecord(secondEntry, user);
                }, () => {
                    expect.fail('failed on initial record creation');
                }).then((record2) => {
                    expect(record2.content).to.include.keys('source', 'biotype', 'source_version', 'name', 'uuid', 'deleted_at', 'created_at');
                });
        });
    });
    describe('FeatureDeprecatedBy', () => {
        beforeEach(async () => {
            await Feature.createClass(db);
            await FeatureDeprecatedBy.createClass(db);
        });

        it('errors when deprecating a feature with a different biotype', () => {
            return Promise.all([
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: 10}, user),
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENST001', biotype: FEATURE_BIOTYPE.TRANSCRIPT, source_version: 11}, user)
            ]).then((recList) => {
                return db.models.FeatureDeprecatedBy.createRecord({out: recList[0], in: recList[1]}, user);
            }).then((edge) => {
                console.log(edge);
                expect.fail('should not have been able to create the record');
            }, (error) => {
                expect(error).to.be.instanceof(AttributeError);
            });
        });
        it('errors when deprecating a feature with a different source', () => {
            return Promise.all([
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: 10}, user),
                db.models.Feature.createRecord({source: FEATURE_SOURCE.REFSEQ, name: 'NG_001', biotype: FEATURE_BIOTYPE.GENE, source_version: 11}, user)
            ]).then((recList) => {
                return db.models.FeatureDeprecatedBy.createRecord({out: recList[0], in: recList[1]}, user);
            }).then((edge) => {
                console.log(edge);
                expect.fail('should not have been able to create the record');
            }, (error) => {
                expect(error).to.be.instanceof(AttributeError);
            });
        });
        it('errors when the deprecated version is not lower than the new version', () => {
            return Promise.all([
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: 11}, user),
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG002', biotype: FEATURE_BIOTYPE.GENE, source_version: 11}, user)
            ]).then((recList) => {
                return db.models.FeatureDeprecatedBy.createRecord({out: recList[0], in: recList[1]}, user);
            }).then((edge) => {
                console.log(edge);
                expect.fail('should not have been able to create the record');
            }, (error) => {
                expect(error).to.be.instanceof(AttributeError);
            });
        });
        it('errors when null version deprecates non-null version', () => {
            return Promise.all([
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: 10}, user),
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: null}, user)
            ]).then((recList) => {
                return db.models.FeatureDeprecatedBy.createRecord({out: recList[0], in: recList[1]}, user);
            }).then((edge) => {
                console.log(edge);
                expect.fail('should not have been able to create the record');
            }, (error) => {
                expect(error).to.be.instanceof(AttributeError);
            });
        });
        it('allows version higher', () => {
            return Promise.all([
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: 10}, user),
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: 11}, user)
            ]).then((recList) => {
                return db.models.FeatureDeprecatedBy.createRecord({out: recList[0], in: recList[1]}, user);
            }).then((edge) => {
                expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out', 'created_by', 'deleted_by');
            });
        });

    });
    describe('FeatureAliasOf', () => {
        beforeEach(async () => { /* build and connect to the empty database */
            await Feature.createClass(db)
            await FeatureAliasOf.createClass(db);
        });

        it('errors when deprecating a feature with a different biotype', () => {
            return Promise.all([
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: 10}, user),
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENST001', biotype: FEATURE_BIOTYPE.TRANSCRIPT, source_version: 11}, user)
            ]).then((recList) => {
                return db.models.FeatureAliasOf.createRecord({out: recList[0], in: recList[1]}, user);
            }).then((edge) => {
                console.log(edge);
                expect.fail('should not have been able to create the record');
            }, (error) => {
                expect(error).to.be.instanceof(AttributeError);
            });
        });
        it('allows between different sources when the biotype is equal', () => {
            return Promise.all([
                db.models.Feature.createRecord({source: FEATURE_SOURCE.ENSEMBL, name: 'ENSG001', biotype: FEATURE_BIOTYPE.GENE, source_version: 10}, user),
                db.models.Feature.createRecord({source: FEATURE_SOURCE.REFSEQ, name: 'NG_0001', biotype: FEATURE_BIOTYPE.GENE, source_version: 11}, user)
            ]).then((recList) => {
                return db.models.FeatureAliasOf.createRecord({out: recList[0], in: recList[1]}, user);
            }).then((edge) => {
                expect(edge.content).to.include.keys('uuid', 'version', 'created_at', 'deleted_at', 'in', 'out');
            });
        });
        
    });
    afterEach(async () => {
        await tearDownEmptyDB(server);
    });
});


describe('Feature.validateContent', () => {
    let server, db, user;
    beforeEach(async () => { 
        ({server, db, user} = await setUpEmptyDB());
        await Context.createClass(db);
        await Feature.createClass(db);
    });

    describe(FEATURE_SOURCE.HGNC, () => {
        let validEntry;
        beforeEach(() => {
            validEntry = {source: FEATURE_SOURCE.HGNC, biotype: FEATURE_BIOTYPE.GENE, name: 'KRAS', source_version: 20170101, created_by: true};
        });

        it('allows valid', () => {
            return db.models.Feature.validateContent(validEntry);
        });
        it('allows source_version to be null', () => {
            validEntry.source_version = null;
            return db.models.Feature.validateContent(validEntry);
        });
        it('source_version defaults to null', () => {
            delete validEntry.source_version;
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('source_version', null);
                });
        });
        it('errors on invalid biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on null biotype', () => {
            validEntry.biotype = null;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors if biotype is not defined', () => {
            delete validEntry.biotype;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on invalid name', () => {
            validEntry.name = 'abc';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
            validEntry.name = '1RAS';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on null name', () => {
            validEntry.name = null;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors if name is not defined', () => {
            delete validEntry.name;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
    });
    describe(FEATURE_SOURCE.ENSEMBL, () => {
        let validEntry;
        beforeEach(function(done) {
            validEntry = {source: FEATURE_SOURCE.ENSEMBL, biotype: FEATURE_BIOTYPE.GENE, name: 'ensg001', source_version: 69, created_by: true};
            done();
        });

        it('allows valid gene', () => {
           return db.models.Feature.validateContent(validEntry);
        });
        it('allows valid protein', () => {
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            validEntry.name = 'ensp001';
            return db.models.Feature.validateContent(validEntry);
        });
        it('allows valid transcript', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
            validEntry.name = 'enst001';
            return db.models.Feature.validateContent(validEntry);;
        });
        it('allows valid exon', () => {
            validEntry.biotype = FEATURE_BIOTYPE.EXON;
            validEntry.name = 'ense001';
            return db.models.Feature.validateContent(validEntry);
        });
        it('errors on gene name not compatible with transcript biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on gene name not compatible with protein biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on gene name not compatible with exon biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.EXON;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on transcript name not compatible with gene biotype', () => {
            validEntry.name = 'enst0001';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on transcript name not compatible with protein biotype', () => {
            validEntry.name = 'enst0001';
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on transcript name not compatible with exon biotype', () => {
            validEntry.name = 'enst0001';
            validEntry.biotype = FEATURE_BIOTYPE.EXON;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on protein name not compatible with gene biotype', () => {
            validEntry.name = 'ensp0001';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on protein name not compatible with transcript biotype', () => {
            validEntry.name = 'ensp0001';
            validEntry.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on protein name not compatible with exon biotype', () => {
            validEntry.name = 'ensp0001';
            validEntry.biotype = FEATURE_BIOTYPE.EXON;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('allows source_version to be null', () => {
            validEntry.source_version = null;
            return db.models.Feature.validateContent(validEntry);
        });
        it('source_version defaults to null', () => {
            delete validEntry.source_version;
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('source_version', null);
                });
        });
        it('errors on invalid biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TEMPLATE;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on null biotype', () => {
            validEntry.biotype = null;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors if biotype is not defined', () => {
            delete validEntry.biotype;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on null name', () => {
            validEntry.name = null;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors if name is not defined', () => {
            delete validEntry.name;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
    });
    describe(FEATURE_SOURCE.REFSEQ, () => {
        let validEntry;
        beforeEach(function(done) {
            validEntry = {source: FEATURE_SOURCE.REFSEQ, biotype: FEATURE_BIOTYPE.GENE, name: 'ng_001', source_version: 1, created_by: true};
            done();
        });

        it('allows valid gene', () => {
            return db.models.Feature.validateContent(validEntry);
        });
        it('allows valid protein', () => {
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            validEntry.name = 'np_001';
            return db.models.Feature.validateContent(validEntry);
        });
        it('allows valid transcript', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
            validEntry.name = 'nm_001';
            return db.models.Feature.validateContent(validEntry);
        });
        it('errors on gene name not compatible with transcript biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TEMPLATE;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on gene name not compatible with protein biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on transcript name not compatible with gene biotype', () => {
            validEntry.name = 'nm_0001';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on transcript name not compatible with protein biotype', () => {
            validEntry.name = 'nm_0001';
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on protein name not compatible with gene biotype', () => {
            validEntry.name = 'np_0001';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on protein name not compatible with transcript biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TEMPLATE;
            validEntry.name = 'np_0001';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('allows null source_version', () => {
            validEntry.source_version = null;
            return db.models.Feature.validateContent(validEntry);
        });
        it('source_version defaults to null', () => {
            delete validEntry.source_version;
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('source_version', null);
                });
        });
        it('errors on template for biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TEMPLATE;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on null biotype', () => {
            validEntry.biotype = null;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors if biotype is not defined', () => {
            delete validEntry.biotype;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on null name', () => {
            validEntry.name = null;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors when name is not defined', () => {
            delete validEntry.name;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
    });
    describe(FEATURE_SOURCE.LRG, () => {
        let validEntry;
        beforeEach(function(done) {
            validEntry = {source: FEATURE_SOURCE.LRG, biotype: FEATURE_BIOTYPE.GENE, name: 'LRG_001', source_version: 1, created_by: true};
            done();
        });

        it('allows valid gene', () => {
            return db.models.Feature.validateContent(validEntry);
        });
        it('allows valid protein', () => {
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            validEntry.name = 'lrg_001p2';
            return db.models.Feature.validateContent(validEntry);
        });
        it('allows valid transcript', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
            validEntry.name = 'lrg_001t2';
            return db.models.Feature.validateContent(validEntry);
        });
        it('errors on gene name not compatible with transcript biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on gene name not compatible with protein biotype', () => {
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on transcript name not compatible with gene biotype', () => {
            validEntry.name = 'lrg_001t2';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on transcript name not compatible with protein biotype', () => {
            validEntry.name = 'lrg_001t2';
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on protein name not compatible with gene biotype', () => {
            validEntry.name = 'lrg_001p2';
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on protein name not compatible with transcript biotype', () => {
            validEntry.name = 'lrg_001p2';
            validEntry.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('allows null source_version', () => {
            validEntry.source_version = null;
            return db.models.Feature.validateContent(validEntry);
        });
        it('source_version defaults to null', () => {
            delete validEntry.source_version;
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('source_version', null);
                });
        });
        it('errors on null biotype', () => {
            validEntry.biotype = null;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors if biotype is not defined', () => {
            delete validEntry.biotype;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on null name', () => {
            validEntry.name = null;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors when name is not defined', () => {
            delete validEntry.name;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
    });
    describe(FEATURE_SOURCE.GRC, () => {
        let validEntry;
        beforeEach(function(done) {
            validEntry = {source: FEATURE_SOURCE.GRC, biotype: FEATURE_BIOTYPE.TEMPLATE, name: 'chr11', source_version: 19, created_by: true};
            done();
        });
        it('allows version', () => {
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('source', FEATURE_SOURCE.GRC);
                    expect(result).to.have.property('source_version', 19);
                    expect(result).to.have.property('name', 'chr11');
                    expect(result).to.have.property('biotype', FEATURE_BIOTYPE.TEMPLATE);
                });
        });
        it('allows with chr prefix', () => {
            validEntry.name = 'chr1';
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('name', 'chr1');
                });
        });
        it('allows without chr prefix', () => {
            validEntry.name = 1;
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('name', 1);
                });
        });
        it('allows alternative chromosomes chr1_gl000191_random', () => {
            validEntry.name = 'chr1_gl000191_random';
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('name', 'chr1_gl000191_random');
                });
        });
        it('allows MT', () => {
            validEntry.name = 'MT';
            return db.models.Feature.validateContent(validEntry)
                .then((result) => {
                    expect(result).to.have.property('name', 'mt');
                });
        });
        it('errors on biotype gene', () => {
            validEntry.biotype = FEATURE_BIOTYPE.GENE;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on biotype transcript', () => {
            validEntry.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on biotype protein', () => {
            validEntry.biotype = FEATURE_BIOTYPE.PROTEIN;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
        it('errors on biotype exon', () => {
            validEntry.biotype = FEATURE_BIOTYPE.EXON;
            expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
        });
    });
    it('errors on invalid source', () => {
        let validEntry = {source: FEATURE_SOURCE.HGNC, biotype: FEATURE_BIOTYPE.GENE, name: null, source_version: '2017-01-01'};
        expectPromiseFail(db.models.Feature.validateContent(validEntry), AttributeError);
    });

    after(async () => {
        await tearDownEmptyDB(server);
    });
});
