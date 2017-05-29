"use strict";
const {expect} = require('chai');
const {DependencyError, AttributeError, ParsingError} = require('./../../../app/repo/error');
const {
    parse,
    parseHistoneVariant
} = require('./../../../app/parser/variant');
const {EVENT_SUBTYPE, EVENT_TYPE} = require('./../../../app/repo/event');


describe('parse', () => {
    describe('DNA variant:', () => {
        it('deletion single bp', () => {
            const result = parse('g.3del');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.DEL);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('deletion spans a range', () => {
            const result = parse('g.3_5del');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal(EVENT_SUBTYPE.DEL);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('deletion has a reference sequence', () => {
            const result = parse('g.3_5delTAA');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal(EVENT_SUBTYPE.DEL);
            expect(result.reference_seq).to.equal('TAA');
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain start', () => {
            const result = parse('g.(3_4)_5dup');
            expect(result.prefix).to.equal('g');
            expect(result.break1.start.pos).to.equal(3);
            expect(result.break1.end.pos).to.equal(4);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal(EVENT_SUBTYPE.DUP);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain end', () => {
            const result = parse('g.3_(5_7)dup');
            expect(result.prefix).to.equal('g');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.pos).to.equal(3);
            expect(result.type).to.equal(EVENT_SUBTYPE.DUP);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain start and end', () => {
            const result = parse('g.(1_3)_(5_7)dup');
            expect(result.prefix).to.equal('g');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.start.pos).to.equal(1);
            expect(result.break1.end.pos).to.equal(3);
            expect(result.type).to.equal(EVENT_SUBTYPE.DUP);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication has a reference sequence', () => {
            const result = parse('g.3_5dupTAA');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal(EVENT_SUBTYPE.DUP);
            expect(result.reference_seq).to.equal('TAA');
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('basic substitution', () => {
            const result = parse('g.4A>T');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(4);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.SUB);
            expect(result.reference_seq).to.equal('A');
            expect(result.untemplated_seq).to.equal('T');
        });
        it('substitution with uncertainty', () => {
            const result = parse('g.(4_7)A>T');
            expect(result.prefix).to.equal('g');
            expect(result.break1.start.pos).to.equal(4);
            expect(result.break1.end.pos).to.equal(7);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.SUB);
            expect(result.reference_seq).to.equal('A');
            expect(result.untemplated_seq).to.equal('T');
        });
        it('indel spans a range uncertain start and end ref and alt specified', () => {
            const result = parse('g.(1_3)_(5_7)delTAAinsACG');
            expect(result.prefix).to.equal('g');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.start.pos).to.equal(1);
            expect(result.break1.end.pos).to.equal(3);
            expect(result.type).to.equal(EVENT_SUBTYPE.INDEL);
            expect(result.reference_seq).to.equal('TAA')
            expect(result.untemplated_seq).to.equal('ACG');
        });
        it('indel ref specified', () => {
            const result = parse('g.10delTins');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.INDEL);
            expect(result.reference_seq).to.equal('T')
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('indel alt specified', () => {
            const result = parse('g.10delinsACC');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.INDEL);
            expect(result.untemplated_seq).to.equal('ACC')
            expect(result.reference_seq).to.be.undefined;
        });
    });
    describe('cds variant:', () => {
        it('deletion single bp', () => {
            const result = parse('c.3+1del');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(3);
            expect(result.break1.offset).to.equal(1);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.DEL);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('deletion spans a range', () => {
            const result = parse('c.3+1_5-2del');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(3);
            expect(result.break1.offset).to.equal(1);
            expect(result.break2.pos).to.equal(5);
            expect(result.break2.offset).to.equal(-2);
            expect(result.type).to.equal(EVENT_SUBTYPE.DEL);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('deletion has a reference sequence', () => {
            const result = parse('c.3_5delTAA');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal(EVENT_SUBTYPE.DEL);
            expect(result.reference_seq).to.equal('TAA');
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain start', () => {
            const result = parse('c.(3+1_4-1)_10dup');
            expect(result.prefix).to.equal('c');
            expect(result.break1.start.pos).to.equal(3);
            expect(result.break1.start.offset).to.equal(1);
            expect(result.break1.end.pos).to.equal(4);
            expect(result.break1.end.offset).to.equal(-1);
            expect(result.break2.pos).to.equal(10);
            expect(result.type).to.equal(EVENT_SUBTYPE.DUP);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain end', () => {
            const result = parse('c.3_(5+1_55-1)dup');
            expect(result.prefix).to.equal('c');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(55);
            expect(result.break1.pos).to.equal(3);
            expect(result.type).to.equal(EVENT_SUBTYPE.DUP);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain start and end', () => {
            const result = parse('c.(1_3)_(5_7)dup');
            expect(result.prefix).to.equal('c');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.start.pos).to.equal(1);
            expect(result.break1.end.pos).to.equal(3);
            expect(result.type).to.equal(EVENT_SUBTYPE.DUP);
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication has a reference sequence', () => {
            const result = parse('c.3_5dupTAA');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal(EVENT_SUBTYPE.DUP);
            expect(result.reference_seq).to.equal('TAA');
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('basic substitution', () => {
            const result = parse('c.4A>T');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(4);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.SUB);
            expect(result.reference_seq).to.equal('A');
            expect(result.untemplated_seq).to.equal('T');
        });
        it('substitution with uncertainty', () => {
            const result = parse('c.(4_7)A>T');
            expect(result.prefix).to.equal('c');
            expect(result.break1.start.pos).to.equal(4);
            expect(result.break1.end.pos).to.equal(7);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.SUB);
            expect(result.reference_seq).to.equal('A');
            expect(result.untemplated_seq).to.equal('T');
        });
        it('indel spans a range uncertain start and end ref and alt specified', () => {
            const result = parse('c.(1_3)_(5_7)delTAAinsACG');
            expect(result.prefix).to.equal('c');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.start.pos).to.equal(1);
            expect(result.break1.end.pos).to.equal(3);
            expect(result.type).to.equal(EVENT_SUBTYPE.INDEL);
            expect(result.reference_seq).to.equal('TAA')
            expect(result.untemplated_seq).to.equal('ACG');
        });
        it('indel ref specified', () => {
            const result = parse('c.10delTins');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.INDEL);
            expect(result.reference_seq).to.equal('T')
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('indel alt specified', () => {
            const result = parse('c.10delinsACC');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.INDEL);
            expect(result.untemplated_seq).to.equal('ACC')
            expect(result.reference_seq).to.be.undefined;
        });
    });
    describe('exon variants', () => {
        it('errors because exon cannot have substitution type', () => {
            expect(() => { parse('e.1C>T'); }).to.throw(ParsingError);
            expect(() => { parse('e.C1T'); }).to.throw(ParsingError);
        });
        it('errors because exon cannot have insertion type', () => {
            expect(() => { parse('e.1_2ins'); }).to.throw(ParsingError);
            expect(() => { parse('e.2ins'); }).to.throw(ParsingError);
        });
        it('duplication single exon', () => {
            const result = parse('e.1dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
        });
        it('duplication single exon with uncertainty', () => {
            const result = parse('e.(1_2)dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({start: {pos: 1, prefix: 'e'}, end: {pos: 2, prefix: 'e'}});
        });
        it('duplication of multiple exons', () => {
            const result = parse('e.1_3dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 3, prefix: 'e'});
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parse('e.(1_2)_(3_4)dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({start: {pos: 1, prefix: 'e'}, end: {pos: 2, prefix: 'e'}});
            expect(result.break2).to.eql({start: {pos: 3, prefix: 'e'}, end: {pos: 4, prefix: 'e'}});
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parse('e.(1_2)_4dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({start: {pos: 1, prefix: 'e'}, end: {pos: 2, prefix: 'e'}});
            expect(result.break2).to.eql({pos: 4, prefix: 'e'});
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parse('e.2_(3_4)dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({pos: 2, prefix: 'e'});
            expect(result.break2).to.eql({start: {pos: 3, prefix: 'e'}, end: {pos: 4, prefix: 'e'}});
        });
    });
    describe('protein variants', () => {
        it('frameshift alt specified', () => {
            const result = parse('p.R10Kfs');
            expect(result.prefix).to.equal('p');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.FS);
            expect(result.untemplated_seq).to.equal('K')
            expect(result.reference_seq).to.be.undefined;
        });
        it('frameshift alt specified and truncation point', () => {
            const result = parse('p.R10Kfs*10');
            expect(result.prefix).to.equal('p');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.FS);
            expect(result.untemplated_seq).to.equal('K')
            expect(result.reference_seq).to.be.undefined;
            expect(result.truncation).to.equal(10);
        });
        it('frameshift errors on truncation point without position', () => {
            expect(() => { parse('p.R10Kfs*'); }).to.throw(ParsingError);
        });
        it('frameshift errors on range', () => {
            expect(() => { parse('p.R10_M11Kfs*'); }).to.throw(ParsingError);
        });
        it('frameshift allows uncertain range', () => {
            const result = parse('p.(R10_M11)fs*10');
            expect(result.prefix).to.equal('p');
            expect(result.break1.start).to.have.property('pos', 10);
            expect(result.break1.start).to.have.property('ref_aa', 'R');
            expect(result.break1.end).to.have.property('pos', 11);
            expect(result.break1.end).to.have.property('ref_aa', 'M');
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.FS);
            expect(result.untemplated_seq).to.be.undefined;
            expect(result.truncation).to.equal(10);
            expect(result.reference_seq).to.be.undefined;
        });
        it('frameshift no alt but truncation point specified', () => {
            const result = parse('p.R10fs*10');
            expect(result.prefix).to.equal('p');
            expect(result.break1).to.have.property('pos', 10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.FS);
            expect(result.untemplated_seq).to.be.undefined;
            expect(result.reference_seq).to.be.undefined;
        });
        it('frameshift no alt or truncation point', () => {
            const result = parse('p.R10fs');
            expect(result.prefix).to.equal('p');
            expect(result.break1).to.have.property('pos', 10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal(EVENT_SUBTYPE.FS);
            expect(result.untemplated_seq).to.be.undefined;
            expect(result.reference_seq).to.be.undefined;
            expect(result.truncation).to.be.undefined;
        });
    });
    describe('cytoband variants', () => {
        it('errors because cytoband variant cannot have ins type', () => {
            expect(() => { parse('y.p12.1ins'); }).to.throw(ParsingError);
            expect(() => { parse('y.p12.1_p13ins'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have delins type', () => {
            expect(() => { parse('y.p12.1delins'); }).to.throw(ParsingError);
            expect(() => { parse('y.p12.1_p13delins'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have > type', () => {
            expect(() => { parse('y.p12.1G>T'); }).to.throw(ParsingError);
            expect(() => { parse('y.Gp12.1T'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have fs type', () => {
            expect(() => { parse('y.p12.1fs'); }).to.throw(ParsingError);
            expect(() => { parse('y.(p12.1_p13)fs'); }).to.throw(ParsingError);
        });
        it('duplication of whole p arm', () => {
            const result = parse('y.pdup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({arm: 'p', major_band: null, minor_band: null, prefix: 'y'});
        });
        it('duplication of range on p major band', () => {
            const result = parse('y.p11dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({arm: 'p', major_band: 11, minor_band: null, prefix: 'y'});
        });
        it('duplication of range on p minor band', () => {
            const result = parse('y.p11.1dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
        });
        it('duplication of range on p arm', () => {
            const result = parse('y.p11.1_p13.3dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'p', major_band: 13, minor_band: 3, prefix: 'y'});
        });
        it('duplication on p arm uncertain positions', () => {
            const result = parse('y.(p11.1_p11.2)_(p13.4_p14)dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1.start).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
            expect(result.break1.end).to.eql({arm: 'p', major_band: 11, minor_band: 2, prefix: 'y'});
            expect(result.break2.start).to.eql({arm: 'p', major_band: 13, minor_band: 4, prefix: 'y'});
            expect(result.break2.end).to.eql({arm: 'p', major_band: 14, minor_band: null, prefix: 'y'});
        });
        it('duplication on p arm uncertain start', () => {
            const result = parse('y.(p11.1_p11.2)_p13.3dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1.start).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
            expect(result.break1.end).to.eql({arm: 'p', major_band: 11, minor_band: 2, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'p', major_band: 13, minor_band: 3, prefix: 'y'});
        });
        it('duplication on p arm uncertain end', () => {
            const result = parse('y.p13.3_(p15.1_p15.2)dup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({arm: 'p', major_band: 13, minor_band: 3, prefix: 'y'});
            expect(result.break2.start).to.eql({arm: 'p', major_band: 15, minor_band: 1, prefix: 'y'});
            expect(result.break2.end).to.eql({arm: 'p', major_band: 15, minor_band: 2, prefix: 'y'});
        });
        it('duplication of whole q arm', () => {
            const result = parse('y.qdup');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({arm: 'q', major_band: null, minor_band: null, prefix: 'y'});
        });
        it('deletion of whole p arm', () => {
            const result = parse('y.pdel');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DEL);
            expect(result.break1).to.eql({arm: 'p', major_band: null, minor_band: null, prefix: 'y'});
        });
        it('inversion of a range on the p arm', () => {
            const result = parse('y.p11.1_p13.3inv');
            expect(result).to.have.property('type', EVENT_SUBTYPE.INV);
            expect(result.break1).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'p', major_band: 13, minor_band: 3, prefix: 'y'});
        });
    });
});


describe('parse', () => {
    describe('DNA variants', () => {

    });
    describe('cds variants', () => {});
    describe('exon variants', () => {
        it('single gene fusion', () => {
            const result = parse('e.fus(GENE1)(1,3)');
            expect(result).to.have.property('type', EVENT_SUBTYPE.FUSION);
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 3, prefix: 'e'});
        });
        it('two gene fusion', () => {
            const result = parse('e.fus(GENE1,GENE2)(1,2)');
            expect(result).to.have.property('type', EVENT_SUBTYPE.FUSION);
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 2, prefix: 'e'});
        });
        it('two gene inversion', () => {
            const result = parse('e.inv(GENE1,GENE2)(1,2)');
            expect(result).to.have.property('type', EVENT_SUBTYPE.INV);
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 2, prefix: 'e'});
        });
        it('single gene inversion', () => {
            const result = parse('e.inv(GENE1)(4, 7)');
            expect(result).to.have.property('type', EVENT_SUBTYPE.INV);
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result.break1).to.eql({pos: 4, prefix: 'e'});
            expect(result.break2).to.eql({pos: 7, prefix: 'e'});
        });
        it('two gene duplication', () => {
            const result = parse('e.dup(GENE1,GENE2)(1,2)');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 2, prefix: 'e'});
        });
        it('single gene duplication', () => {
            const result = parse('e.dup(GENE1)(1,8)');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 8, prefix: 'e'});
        });
        it('deletion two gene fusion', () => {
            const result = parse('e.del(GENE1,GENE2)(1,2)');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DEL);
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 2, prefix: 'e'});
        });
        it('deletion single gene fusion', () => {
            const result = parse('e.del(GENE1)(1,8)');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DEL);
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 8, prefix: 'e'});
        });
    });
    describe('protein variants', () => {
        it('allows single gene fusion', () => {
            const result = parse('p.fus(GENE1)(R12,K15)');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result).to.have.property('type', EVENT_SUBTYPE.FUSION);
            expect(result.break1).to.eql({ref_aa: 'R', pos: 12, prefix: 'p'});
            expect(result.break2).to.eql({ref_aa: 'K', pos: 15, prefix: 'p'});
        });
        it('allows two gene fusion', () => {
            const result = parse('p.fus(GENE1,GENE2)(R12,K15)');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result).to.have.property('type', EVENT_SUBTYPE.FUSION);
            expect(result.break1).to.eql({ref_aa: 'R', pos: 12, prefix: 'p'});
            expect(result.break2).to.eql({ref_aa: 'K', pos: 15, prefix: 'p'});
        });
        it('allows deletion', () => {
            const result = parse('p.del(GENE1,GENE2)(R12,K15)');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DEL);
            expect(result.break1).to.eql({ref_aa: 'R', pos: 12, prefix: 'p'});
            expect(result.break2).to.eql({ref_aa: 'K', pos: 15, prefix: 'p'});
        });
        it('errors on insertion', () => {
            expect(() => { parse('p.ins(GENE1,GENE2)(R12,K15)'); }).to.throw(ParsingError);
        });
        it('errors on indel', () => {
            expect(() => { parse('p.delins(GENE1,GENE2)(R12,K15)'); }).to.throw(ParsingError);
        });
        it('allows duplication', () => {
            const result = parse('p.dup(GENE1,GENE2)(R12,K15)');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({ref_aa: 'R', pos: 12, prefix: 'p'});
            expect(result.break2).to.eql({ref_aa: 'K', pos: 15, prefix: 'p'});
        });
        it('allows inversion', () => {
            const result = parse('p.inv(GENE1,GENE2)(R12,K15)');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result).to.have.property('type', EVENT_SUBTYPE.INV);
            expect(result.break1).to.eql({ref_aa: 'R', pos: 12, prefix: 'p'});
            expect(result.break2).to.eql({ref_aa: 'K', pos: 15, prefix: 'p'});
        });
        it('errors on missense', () => {
            expect(() => { parse('p.>(GENE1,GENE2)(R12,K15)'); }).to.throw(ParsingError);
        });
        it('errors on frameshift', () => {
            expect(() => { parse('p.fs(GENE1,GENE2)(R12,K15)'); }).to.throw(ParsingError);
        });
    });
    describe('cytoband variants', () => {
        it('allows single gene fusion', () => {
            const result = parse('y.fus(chr1)(p12.1,q11)');
            expect(result.feature1).to.have.property('name', 'chr1');
            expect(result.feature2).to.have.property('name', 'chr1');
            expect(result).to.have.property('type', EVENT_SUBTYPE.FUSION);
            expect(result.break1).to.eql({arm: 'p', major_band: 12, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'q', major_band: 11, minor_band: null, prefix: 'y'});
        });
        it('allows two gene fusion', () => {
            const result = parse('y.fus(chr1,chr2)(p12.1,q11)');
            expect(result.feature1).to.have.property('name', 'chr1');
            expect(result.feature2).to.have.property('name', 'chr2');
            expect(result).to.have.property('type', EVENT_SUBTYPE.FUSION);
            expect(result.break1).to.eql({arm: 'p', major_band: 12, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'q', major_band: 11, minor_band: null, prefix: 'y'});
        });
        it('allows deletion', () => {
            const result = parse('y.del(chr1,chr2)(p12.1,q11)');
            expect(result.feature1).to.have.property('name', 'chr1');
            expect(result.feature2).to.have.property('name', 'chr2');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DEL);
            expect(result.break1).to.eql({arm: 'p', major_band: 12, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'q', major_band: 11, minor_band: null, prefix: 'y'});
        });
        it('errors on insertion', () => {
            expect(() => { parse('y.ins(chr1,chr2)(p12.1,q11)'); }).to.throw(ParsingError);
        });
        it('errors on indel', () => {
            expect(() => { parse('y.delins(chr1,chr2)(p12.1,q11)'); }).to.throw(ParsingError);
        });
        it('allows duplication', () => {
            const result = parse('y.dup(chr1,chr2)(p12.1,q11)');
            expect(result.feature1).to.have.property('name', 'chr1');
            expect(result.feature2).to.have.property('name', 'chr2');
            expect(result).to.have.property('type', EVENT_SUBTYPE.DUP);
            expect(result.break1).to.eql({arm: 'p', major_band: 12, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'q', major_band: 11, minor_band: null, prefix: 'y'});
        });
        it('allows inversion', () => {
            const result = parse('y.inv(chr1,chr2)(p12.1,q11)');
            expect(result.feature1).to.have.property('name', 'chr1');
            expect(result.feature2).to.have.property('name', 'chr2');
            expect(result).to.have.property('type', EVENT_SUBTYPE.INV);
            expect(result.break1).to.eql({arm: 'p', major_band: 12, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'q', major_band: 11, minor_band: null, prefix: 'y'});
        });
        it('errors on missense', () => {
            expect(() => { parse('y.>(chr1,chr2)(p12.1,q11)'); }).to.throw(ParsingError);
        });
        it('errors on frameshift', () => {
            expect(() => { parse('y.fs(chr1,chr2)(p12.1,q11)'); }).to.throw(ParsingError);
        });
    });
});


describe('parseHistoneVariant', () => {
    it('ubiquitination', () => {
        const result = parseHistoneVariant('H2BK123ub1');
        expect(result).to.have.property('histone', 'H2B');
        expect(result.protein_position).to.eql({ref_aa: 'K', pos: 123, prefix: 'p'});
        expect(result.modification).to.eql({type: 'ub', count: 1});
    });
    it('methylation', () => {
        const result = parseHistoneVariant('H3.3K4me3');
        expect(result).to.have.property('histone', 'H3');
        expect(result).to.have.property('subtype', '3');
        expect(result.protein_position).to.eql({ref_aa: 'K', pos: 4, prefix: 'p'});
        expect(result.modification).to.eql({type: 'me', count: 3});
    });
});
