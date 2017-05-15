"use strict";
const {expect} = require('chai');
const {DependencyError, AttributeError, ParsingError} = require('./../../../app/repo/error');
const {parseFeature} = require('./../../../app/parser/feature');
const {Feature, SOURCE, BIOTYPE} = require('./../../../app/repo/feature');


describe('parseFeature', () => {
    describe(SOURCE.HGNC, () => {
        it('allows gene with no version', () => {
            const result = parseFeature('KRAS');
            expect(result).to.have.property('name', 'KRAS');
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('source', SOURCE.HGNC);
            expect(result).to.have.property('biotype', BIOTYPE.GENE);
        });
        it('allows gene with version', () => {
            const result = parseFeature('KRAS.20170101');
            expect(result).to.have.property('name', 'KRAS');
            expect(result).to.have.property('source_version', 20170101);
            expect(result).to.have.property('source', SOURCE.HGNC);
            expect(result).to.have.property('biotype', BIOTYPE.GENE);
        });
        it('errors on version with wrong delimiter', () => {
            expect(() => { parseFeature('KRAS_20170101'); }).to.throw(ParsingError);
        });
        it('errors on with invalid version', () => {
            expect(() => { parseFeature('KRAS.20170141'); }).to.throw(ParsingError);
            expect(() => { parseFeature('KRAS.20171331'); }).to.throw(ParsingError);
        });
    });
    describe(SOURCE.ENSEMBL, () => {
        it('allows gene with no version', () => {
            const result = parseFeature('ENSG001');
            expect(result).to.have.property('name', 'ENSG001');
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('source', SOURCE.ENSEMBL);
            expect(result).to.have.property('biotype', BIOTYPE.GENE);
        });
        it('allows gene with version', () => {
            const result = parseFeature('ENSG001.69');
            expect(result).to.have.property('name', 'ENSG001');
            expect(result).to.have.property('source_version', 69);
            expect(result).to.have.property('source', SOURCE.ENSEMBL);
            expect(result).to.have.property('biotype', BIOTYPE.GENE);
        });
        it('allows transcript with no version', () => {
            const result = parseFeature('ENST001');
            expect(result).to.have.property('name', 'ENST001');
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('source', SOURCE.ENSEMBL);
            expect(result).to.have.property('biotype', BIOTYPE.TRANSCRIPT);
        });
        it('allows transcript with version', () => {
            const result = parseFeature('ENST001.112');
            expect(result).to.have.property('name', 'ENST001');
            expect(result).to.have.property('source_version', 112);
            expect(result).to.have.property('source', SOURCE.ENSEMBL);
            expect(result).to.have.property('biotype', BIOTYPE.TRANSCRIPT);
        });
        it('allows protein with no version', () => {
            const result = parseFeature('ENSP001');
            expect(result).to.have.property('name', 'ENSP001');
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('source', SOURCE.ENSEMBL);
            expect(result).to.have.property('biotype', BIOTYPE.PROTEIN);
        });
        it('allows protein with version', () => {
            const result = parseFeature('ENSP001.9');
            expect(result).to.have.property('name', 'ENSP001');
            expect(result).to.have.property('source_version', 9);
            expect(result).to.have.property('source', SOURCE.ENSEMBL);
            expect(result).to.have.property('biotype', BIOTYPE.PROTEIN);
        });
        it('errors on version with wrong delimiter');
        it('errors on with invalid version');
    });
    describe(SOURCE.REFSEQ, () => {
        it('allows gene with no version');
        it('allows gene with version');
        it('allows transcript with no version');
        it('allows transcript with version');
        it('allows protein with no version');
        it('allows protein with version');
        it('errors on version with wrong delimiter');
        it('errors on with invalid version');
    });
    describe(SOURCE.GRC, () => {});
    describe(SOURCE.LRG, () => {
        it('allows gene with no version');
        it('allows gene with version');
        it('allows transcript with no version');
        it('allows transcript with version');
        it('allows protein with no version');
        it('allows protein with version');
        it('errors on version with wrong delimiter');
        it('errors on with invalid version');
    });
});
