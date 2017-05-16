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
        it('allows exon with no version', () => {
            const result = parseFeature('ENSE001');
            expect(result).to.have.property('name', 'ENSE001');
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('source', SOURCE.ENSEMBL);
            expect(result).to.have.property('biotype', BIOTYPE.EXON);
        });
        it('allows exon with version', () => {
            const result = parseFeature('ENSE001.9');
            expect(result).to.have.property('name', 'ENSE001');
            expect(result).to.have.property('source_version', 9);
            expect(result).to.have.property('source', SOURCE.ENSEMBL);
            expect(result).to.have.property('biotype', BIOTYPE.EXON);
        });
        it('errors on version with wrong delimiter', () => {
            expect(() => { parseFeature('ENST001_20170141'); }).to.throw(ParsingError);
            expect(() => { parseFeature('ENST001,20170141'); }).to.throw(ParsingError);
            expect(() => { const result = parseFeature('ENST001-20170141'); console.log(result); }).to.throw(ParsingError);
            expect(() => { parseFeature('ENST001:1123'); }).to.throw(ParsingError);
        });
        it('errors on with invalid version', () => {
            expect(() => { parseFeature('ENSE001.20170141k'); }).to.throw(ParsingError);
        });
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
    describe(SOURCE.GRC, () => {
        it('errors on GL0002', () => {
            expect(() => { parseFeature('GL0002'); }).to.throw(ParsingError);
        });
        it('allows chr11_GL0001_random', () => {
            const result = parseFeature('chr11_GL0001_random');
            expect(result).to.have.property('name', 'chr11_GL0001_random');
            expect(result).to.have.property('source', SOURCE.GRC);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.TEMPLATE);
        });
        it('errors on chr11_GL0001', () => {
            expect(() => { parseFeature('chr11_GL0001'); }).to.throw(ParsingError);
        });
        it('errors on chrKK', () => {
            expect(() => { parseFeature('chrKK'); }).to.throw(ParsingError);
        });
        it('allows chr11', () => {
            const result = parseFeature('chr11');
            expect(result).to.have.property('name', 'chr11');
            expect(result).to.have.property('source', SOURCE.GRC);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.TEMPLATE);
        });
        it('allows 11', () => {
            const result = parseFeature('11');
            expect(result).to.have.property('name', '11');
            expect(result).to.have.property('source', SOURCE.GRC);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.TEMPLATE);
        });
        it('allows X', () => {
            const result = parseFeature('X');
            expect(result).to.have.property('name', 'X');
            expect(result).to.have.property('source', SOURCE.GRC);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.TEMPLATE);
        });
        it('allows MT', () => {
            const result = parseFeature('MT');
            expect(result).to.have.property('name', 'MT');
            expect(result).to.have.property('source', SOURCE.GRC);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.TEMPLATE);
        });
        it('allows Y', () => {
            const result = parseFeature('Y');
            expect(result).to.have.property('name', 'Y');
            expect(result).to.have.property('source', SOURCE.GRC);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.TEMPLATE);
        });
        it('pulls version from Y.19', () => {
            const result = parseFeature('Y.19');
            expect(result).to.have.property('name', 'Y');
            expect(result).to.have.property('source', SOURCE.GRC);
            expect(result).to.have.property('source_version', 19);
            expect(result).to.have.property('biotype', BIOTYPE.TEMPLATE);
        });
        it('pulls version from 19.19', () => {
            const result = parseFeature('19.19');
            expect(result).to.have.property('name', '19');
            expect(result).to.have.property('source', SOURCE.GRC);
            expect(result).to.have.property('source_version', 19);
            expect(result).to.have.property('biotype', BIOTYPE.TEMPLATE);
        });
    });
    describe(SOURCE.LRG, () => {
        it('allows gene with no version', () => {
            const result = parseFeature('LRG_001');
            expect(result).to.have.property('name', 'LRG_001');
            expect(result).to.have.property('source', SOURCE.LRG);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.GENE);
        });
        it('errors on gene with version', () => {
            expect(() => { parseFeature('LRG_001.1'); }).to.throw(ParsingError);
        });
        it('allows transcript with no version', () => {
            const result = parseFeature('LRG_001t1');
            expect(result).to.have.property('name', 'LRG_001t1');
            expect(result).to.have.property('source', SOURCE.LRG);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.TRANSCRIPT);
        });
        it('errors on transcript with version', () => {
            expect(() => { parseFeature('LRG_001t1.1'); }).to.throw(ParsingError);
        });
        it('allows protein with no version', () => {
            const result = parseFeature('LRG_001p1');
            expect(result).to.have.property('name', 'LRG_001p1');
            expect(result).to.have.property('source', SOURCE.LRG);
            expect(result).to.have.property('source_version', null);
            expect(result).to.have.property('biotype', BIOTYPE.PROTEIN);
        });
        it('errors on protein with version', () => {
            expect(() => { parseFeature('LRG_001p1.1'); }).to.throw(ParsingError);
        });
    });
});
