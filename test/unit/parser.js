"use strict";
const {expect} = require('chai');
const {DependencyError, AttributeError, ParsingError} = require('./../../app/repo/error');
const {
    parseContinuous,
    parseDiscontinuous,
    parseHistoneVariant
} = require('./../../app/parser/variant');
const {parsePosition} = require('./../../app/parser/position');
const {parseFeature} = require('./../../app/parser/feature');


describe('parsePosition', () => {
    it('errors on invalid prefix', () => {
        expect(() => { parsePosition('k', '1'); }).to.throw(ParsingError);
    });
    describe('g prefix', () => {
        it('valid', () => {
            const result = parsePosition('g', '1');
            expect(result.pos).to.equal(1);
            expect(result.prefix).to.equal('g');
        });
        it('errors on non integer', () => {
            expect(() => { parsePosition('g', 'f1'); }).to.throw(ParsingError);
        });
    });
    describe('c prefix', () => {
        it('positive offset', () => {
            const result = parsePosition('c', '1+3');
            expect(result.pos).to.equal(1);
            expect(result.offset).to.equal(3);
            expect(result.prefix).to.equal('c');
        });
        it('negative offset', () => {
            const result = parsePosition('c', '1-3');
            expect(result.pos).to.equal(1);
            expect(result.offset).to.equal(-3);
            expect(result.prefix).to.equal('c');
        });
        it('no offset specified', () => {
            const result = parsePosition('c', '1');
            expect(result.pos).to.equal(1);
            expect(result.offset).to.equal(0);
            expect(result.prefix).to.equal('c');
        });
        it('errors on spaces', () => {
            expect(() => { parsePosition('c', '1 + 3'); }).to.throw(ParsingError);
        });
    });
    describe('p prefix', () => {
        it('defaults to ? on reference AA not given', () => {
            const result = parsePosition('p', '1');
            expect(result.pos).to.equal(1);
            expect(result.ref_aa).to.equal('?');
            expect(result.prefix).to.equal('p');
        });
        it('non-specific reference AA', () => {
            const result = parsePosition('p', '?1');
            expect(result.pos).to.equal(1);
            expect(result.ref_aa).to.equal('?');
            expect(result.prefix).to.equal('p');
        });
        it('valid', () => {
            const result = parsePosition('p', 'P11');
            expect(result.pos).to.equal(11);
            expect(result.ref_aa).to.equal('P');
            expect(result.prefix).to.equal('p');
        });
        it('errors on lowercase reference AA', () => {
            expect(() => { parsePosition('p', 'p1'); }).to.throw(ParsingError);
        });
        it('errors on position not given', () => {
            expect(() => { parsePosition('p', 'p'); }).to.throw(ParsingError);
        });
    });
    describe('e prefix', () => {
        it('valid', () => {
            const result = parsePosition('e', '1');
            expect(result.pos).to.equal(1);
            expect(result.prefix).to.equal('e');
        });
        it('errors on non integer', () => {
            expect(() => { parsePosition('e', 'f1'); }).to.throw(ParsingError);
        });
    });
    describe('y prefix', () => {
        it('errors on arm not given', () => {
            expect(() => { parsePosition('y', '1.1'); }).to.throw(ParsingError);
        });
        it('p arm', () => {
            const result = parsePosition('y', 'p1.1');
            expect(result.arm).to.equal('p');
            expect(result.major_band).to.equal(1);
            expect(result.minor_band).to.equal(1);
            expect(result.prefix).to.equal('y');
        });
        it('q arm', () => {
            const result = parsePosition('y', 'q1.1');
            expect(result.arm).to.equal('q');
            expect(result.major_band).to.equal(1);
            expect(result.minor_band).to.equal(1);
            expect(result.prefix).to.equal('y');
        });
        it('errors on invalid arm', () => {
            expect(() => { parsePosition('y', 'k1.1'); }).to.throw(ParsingError);
        });
        it('errors on uppercase P arm', () => {
            expect(() => { parsePosition('y', 'P1.1'); }).to.throw(ParsingError);
        });
        it('errors on uppercase Q arm', () => {
            expect(() => { parsePosition('y', 'Q1.1'); }).to.throw(ParsingError);
        });
        it('minor band null if not given', () => {
            const result = parsePosition('y', 'q1');
            expect(result.arm).to.equal('q');
            expect(result.major_band).to.equal(1);
            expect(result.minor_band).to.be.undefined;
            expect(result.prefix).to.equal('y');
        });
        it('major band null if not given', () => {
            const result = parsePosition('y', 'q');
            expect(result.arm).to.equal('q');
            expect(result.major_band).to.be.undefined;
            expect(result.minor_band).to.be.undefined;
            expect(result.prefix).to.equal('y');
        });
        it('errors on minor band but no major band', () => {
            expect(() => { parsePosition('y', 'p.1'); }).to.throw(ParsingError);
        });
    });
});


describe('parseContinuous', () => {
    describe('DNA variant:', () => {
        it('deletion single bp', () => {
            const result = parseContinuous('g', '3del');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('del');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('deletion spans a range', () => {
            const result = parseContinuous('g', '3_5del');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal('del');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('deletion has a reference sequence', () => {
            const result = parseContinuous('g', '3_5delTAA');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal('del');
            expect(result.reference_seq).to.equal('TAA');
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain start', () => {
            const result = parseContinuous('g', '(3_4)_5dup');
            expect(result.prefix).to.equal('g');
            expect(result.break1.start.pos).to.equal(3);
            expect(result.break1.end.pos).to.equal(4);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal('dup');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain end', () => {
            const result = parseContinuous('g', '3_(5_7)dup');
            expect(result.prefix).to.equal('g');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.pos).to.equal(3);
            expect(result.type).to.equal('dup');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain start and end', () => {
            const result = parseContinuous('g', '(1_3)_(5_7)dup');
            expect(result.prefix).to.equal('g');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.start.pos).to.equal(1);
            expect(result.break1.end.pos).to.equal(3);
            expect(result.type).to.equal('dup');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication has a reference sequence', () => {
            const result = parseContinuous('g', '3_5dupTAA');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal('dup');
            expect(result.reference_seq).to.equal('TAA');
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('basic substitution', () => {
            const result = parseContinuous('g', '4A>T');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(4);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('>');
            expect(result.reference_seq).to.equal('A');
            expect(result.untemplated_seq).to.equal('T');
        });
        it('substitution with uncertainty', () => {
            const result = parseContinuous('g', '(4_7)A>T');
            expect(result.prefix).to.equal('g');
            expect(result.break1.start.pos).to.equal(4);
            expect(result.break1.end.pos).to.equal(7);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('>');
            expect(result.reference_seq).to.equal('A');
            expect(result.untemplated_seq).to.equal('T');
        });
        it('indel spans a range uncertain start and end ref and alt specified', () => {
            const result = parseContinuous('g', '(1_3)_(5_7)delTAAinsACG');
            expect(result.prefix).to.equal('g');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.start.pos).to.equal(1);
            expect(result.break1.end.pos).to.equal(3);
            expect(result.type).to.equal('delins');
            expect(result.reference_seq).to.equal('TAA')
            expect(result.untemplated_seq).to.equal('ACG');
        });
        it('indel ref specified', () => {
            const result = parseContinuous('g', '10delTins');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('delins');
            expect(result.reference_seq).to.equal('T')
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('indel alt specified', () => {
            const result = parseContinuous('g', '10delinsACC');
            expect(result.prefix).to.equal('g');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('delins');
            expect(result.untemplated_seq).to.equal('ACC')
            expect(result.reference_seq).to.be.undefined;
        });
    });
    describe('cds variant:', () => {
        it('deletion single bp', () => {
            const result = parseContinuous('c', '3+1del');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(3);
            expect(result.break1.offset).to.equal(1);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('del');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('deletion spans a range', () => {
            const result = parseContinuous('c', '3+1_5-2del');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(3);
            expect(result.break1.offset).to.equal(1);
            expect(result.break2.pos).to.equal(5);
            expect(result.break2.offset).to.equal(-2);
            expect(result.type).to.equal('del');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('deletion has a reference sequence', () => {
            const result = parseContinuous('c', '3_5delTAA');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal('del');
            expect(result.reference_seq).to.equal('TAA');
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain start', () => {
            const result = parseContinuous('c', '(3+1_4-1)_10dup');
            expect(result.prefix).to.equal('c');
            expect(result.break1.start.pos).to.equal(3);
            expect(result.break1.start.offset).to.equal(1);
            expect(result.break1.end.pos).to.equal(4);
            expect(result.break1.end.offset).to.equal(-1);
            expect(result.break2.pos).to.equal(10);
            expect(result.type).to.equal('dup');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain end', () => {
            const result = parseContinuous('c', '3_(5+1_55-1)dup');
            expect(result.prefix).to.equal('c');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(55);
            expect(result.break1.pos).to.equal(3);
            expect(result.type).to.equal('dup');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication spans a range uncertain start and end', () => {
            const result = parseContinuous('c', '(1_3)_(5_7)dup');
            expect(result.prefix).to.equal('c');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.start.pos).to.equal(1);
            expect(result.break1.end.pos).to.equal(3);
            expect(result.type).to.equal('dup');
            expect(result.reference_seq).to.be.undefined;
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('duplication has a reference sequence', () => {
            const result = parseContinuous('c', '3_5dupTAA');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(3);
            expect(result.break2.pos).to.equal(5);
            expect(result.type).to.equal('dup');
            expect(result.reference_seq).to.equal('TAA');
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('basic substitution', () => {
            const result = parseContinuous('c', '4A>T');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(4);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('>');
            expect(result.reference_seq).to.equal('A');
            expect(result.untemplated_seq).to.equal('T');
        });
        it('substitution with uncertainty', () => {
            const result = parseContinuous('c', '(4_7)A>T');
            expect(result.prefix).to.equal('c');
            expect(result.break1.start.pos).to.equal(4);
            expect(result.break1.end.pos).to.equal(7);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('>');
            expect(result.reference_seq).to.equal('A');
            expect(result.untemplated_seq).to.equal('T');
        });
        it('indel spans a range uncertain start and end ref and alt specified', () => {
            const result = parseContinuous('c', '(1_3)_(5_7)delTAAinsACG');
            expect(result.prefix).to.equal('c');
            expect(result.break2.start.pos).to.equal(5);
            expect(result.break2.end.pos).to.equal(7);
            expect(result.break1.start.pos).to.equal(1);
            expect(result.break1.end.pos).to.equal(3);
            expect(result.type).to.equal('delins');
            expect(result.reference_seq).to.equal('TAA')
            expect(result.untemplated_seq).to.equal('ACG');
        });
        it('indel ref specified', () => {
            const result = parseContinuous('c', '10delTins');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('delins');
            expect(result.reference_seq).to.equal('T')
            expect(result.untemplated_seq).to.be.undefined;
        });
        it('indel alt specified', () => {
            const result = parseContinuous('c', '10delinsACC');
            expect(result.prefix).to.equal('c');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('delins');
            expect(result.untemplated_seq).to.equal('ACC')
            expect(result.reference_seq).to.be.undefined;
        });
    });
    describe('exon variants', () => {
        it('errors because exon cannot have substitution type', () => {
            expect(() => { parseContinuous('e', '1C>T'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('e', 'C1T'); }).to.throw(ParsingError);
        });
        it('errors because exon cannot have insertion type', () => {
            expect(() => { parseContinuous('e', '1_2ins'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('e', '2ins'); }).to.throw(ParsingError);
        });
        it('duplication single exon', () => {
            const result = parseContinuous('e', '1dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
        });
        it('duplication single exon with uncertainty', () => {
            const result = parseContinuous('e', '(1_2)dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({start: {pos: 1, prefix: 'e'}, end: {pos: 2, prefix: 'e'}});
        });
        it('duplication of multiple exons', () => {
            const result = parseContinuous('e', '1_3dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 3, prefix: 'e'});
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parseContinuous('e', '(1_2)_(3_4)dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({start: {pos: 1, prefix: 'e'}, end: {pos: 2, prefix: 'e'}});
            expect(result.break2).to.eql({start: {pos: 3, prefix: 'e'}, end: {pos: 4, prefix: 'e'}});
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parseContinuous('e', '(1_2)_4dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({start: {pos: 1, prefix: 'e'}, end: {pos: 2, prefix: 'e'}});
            expect(result.break2).to.eql({pos: 4, prefix: 'e'});
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parseContinuous('e', '2_(3_4)dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({pos: 2, prefix: 'e'});
            expect(result.break2).to.eql({start: {pos: 3, prefix: 'e'}, end: {pos: 4, prefix: 'e'}});
        });
    });
    describe('protein variants', () => {
        it('frameshift alt specified', () => {
            const result = parseContinuous('p', 'R10Kfs');
            expect(result.prefix).to.equal('p');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('fs');
            expect(result.untemplated_seq).to.equal('K')
            expect(result.reference_seq).to.be.undefined;
        });
        it('frameshift alt specified and truncation point', () => {
            const result = parseContinuous('p', 'R10Kfs*10');
            expect(result.prefix).to.equal('p');
            expect(result.break1.pos).to.equal(10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('fs');
            expect(result.untemplated_seq).to.equal('K')
            expect(result.reference_seq).to.be.undefined;
            expect(result.truncation).to.equal(10);
        });
        it('frameshift errors on truncation point without position', () => {
            expect(() => { parsePosition('p', 'R10Kfs*'); }).to.throw(ParsingError);
        });
        it('frameshift errors on range', () => {
            expect(() => { parsePosition('p', 'R10_M11Kfs*'); }).to.throw(ParsingError);
        });
        it('frameshift allows uncertain range', () => {
            const result = parseContinuous('p', '(R10_M11)fs*10');
            expect(result.prefix).to.equal('p');
            expect(result.break1.start).to.have.property('pos', 10);
            expect(result.break1.start).to.have.property('ref_aa', 'R');
            expect(result.break1.end).to.have.property('pos', 11);
            expect(result.break1.end).to.have.property('ref_aa', 'M');
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('fs');
            expect(result.untemplated_seq).to.be.undefined;
            expect(result.truncation).to.equal(10);
            expect(result.reference_seq).to.be.undefined;
        });
        it('frameshift no alt but truncation point specified', () => {
            const result = parseContinuous('p', 'R10fs*10');
            expect(result.prefix).to.equal('p');
            expect(result.break1).to.have.property('pos', 10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('fs');
            expect(result.untemplated_seq).to.be.undefined;
            expect(result.reference_seq).to.be.undefined;
        });
        it('frameshift no alt or truncation point', () => {
            const result = parseContinuous('p', 'R10fs');
            expect(result.prefix).to.equal('p');
            expect(result.break1).to.have.property('pos', 10);
            expect(result.break2).to.be.undefined;
            expect(result.type).to.equal('fs');
            expect(result.untemplated_seq).to.be.undefined;
            expect(result.reference_seq).to.be.undefined;
            expect(result.truncation).to.be.undefined;
        });
    });
    describe('cytoband variants', () => {
        it('errors because cytoband variant cannot have ins type', () => {
            expect(() => { parseContinuous('y', 'p12.1ins'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('y', 'p12.1_p13ins'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have delins type', () => {
            expect(() => { parseContinuous('y', 'p12.1delins'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('y', 'p12.1_p13delins'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have > type', () => {
            expect(() => { parseContinuous('y', 'p12.1G>T'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('y', 'Gp12.1T'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have fs type', () => {
            expect(() => { parseContinuous('y', 'p12.1fs'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('y', '(p12.1_p13)fs'); }).to.throw(ParsingError);
        });
        it('duplication of whole p arm', () => {
            const result = parseContinuous('y', 'pdup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({arm: 'p', major_band: undefined, minor_band: undefined, prefix: 'y'});
        });
        it('duplication of range on p major band', () => {
            const result = parseContinuous('y', 'p11dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({arm: 'p', major_band: 11, minor_band: undefined, prefix: 'y'});
        });
        it('duplication of range on p minor band', () => {
            const result = parseContinuous('y', 'p11.1dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
        });
        it('duplication of range on p arm', () => {
            const result = parseContinuous('y', 'p11.1_p13.3dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'p', major_band: 13, minor_band: 3, prefix: 'y'});
        });
        it('duplication on p arm uncertain positions', () => {
            const result = parseContinuous('y', '(p11.1_p11.2)_(p13.4_p14)dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1.start).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
            expect(result.break1.end).to.eql({arm: 'p', major_band: 11, minor_band: 2, prefix: 'y'});
            expect(result.break2.start).to.eql({arm: 'p', major_band: 13, minor_band: 4, prefix: 'y'});
            expect(result.break2.end).to.eql({arm: 'p', major_band: 14, minor_band: undefined, prefix: 'y'});
        });
        it('duplication on p arm uncertain start', () => {
            const result = parseContinuous('y', '(p11.1_p11.2)_p13.3dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1.start).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
            expect(result.break1.end).to.eql({arm: 'p', major_band: 11, minor_band: 2, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'p', major_band: 13, minor_band: 3, prefix: 'y'});
        });
        it('duplication on p arm uncertain end', () => {
            const result = parseContinuous('y', 'p13.3_(p15.1_p15.2)dup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({arm: 'p', major_band: 13, minor_band: 3, prefix: 'y'});
            expect(result.break2.start).to.eql({arm: 'p', major_band: 15, minor_band: 1, prefix: 'y'});
            expect(result.break2.end).to.eql({arm: 'p', major_band: 15, minor_band: 2, prefix: 'y'});
        });
        it('duplication of whole q arm', () => {
            const result = parseContinuous('y', 'qdup');
            expect(result).to.have.property('type', 'dup');
            expect(result.break1).to.eql({arm: 'q', major_band: undefined, minor_band: undefined, prefix: 'y'});
        });
        it('deletion of whole p arm', () => {
            const result = parseContinuous('y', 'pdel');
            expect(result).to.have.property('type', 'del');
            expect(result.break1).to.eql({arm: 'p', major_band: undefined, minor_band: undefined, prefix: 'y'});
        });
        it('inversion of a range on the p arm', () => {
            const result = parseContinuous('y', 'p11.1_p13.3inv');
            expect(result).to.have.property('type', 'inv');
            expect(result.break1).to.eql({arm: 'p', major_band: 11, minor_band: 1, prefix: 'y'});
            expect(result.break2).to.eql({arm: 'p', major_band: 13, minor_band: 3, prefix: 'y'});
        });
    });
});


describe('parseFeature', () => {
    it('returns a hugo gene', () => {
        const result = parseFeature('KRAS');
        expect(result).to.have.property('name', 'KRAS');
        expect(result).to.have.property('source_version', undefined);
        expect(result).to.have.property('source', 'hgnc');
        expect(result).to.have.property('biotype', 'gene');
    });
    it('returns a hugo gene with version datestamp');
    it('errors when the hugo gene version is not a date');
});


describe('parseDiscontinuous', () => {
    describe('DNA variants', () => {

    });
    describe('cds variants', () => {});
    describe('exon variants', () => {
        it('single gene fusion', () => {
            const result = parseDiscontinuous('e', 'fus(GENE1)(1,3)');
            expect(result).to.have.property('type', 'fus');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 3, prefix: 'e'});
        });
        it('two gene fusion', () => {
            const result = parseDiscontinuous('e', 'fus(GENE1,GENE2)(1,2)');
            expect(result).to.have.property('type', 'fus');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 2, prefix: 'e'});
        });
        it('two gene inversion', () => {
            const result = parseDiscontinuous('e', 'inv(GENE1,GENE2)(1,2)');
            expect(result).to.have.property('type', 'inv');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 2, prefix: 'e'});
        });
        it('single gene inversion', () => {
            const result = parseDiscontinuous('e', 'inv(GENE1)(4, 7)');
            expect(result).to.have.property('type', 'inv');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result.break1).to.eql({pos: 4, prefix: 'e'});
            expect(result.break2).to.eql({pos: 7, prefix: 'e'});
        });
        it('two gene duplication', () => {
            const result = parseDiscontinuous('e', 'dup(GENE1,GENE2)(1,2)');
            expect(result).to.have.property('type', 'dup');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 2, prefix: 'e'});
        });
        it('single gene duplication', () => {
            const result = parseDiscontinuous('e', 'dup(GENE1)(1,8)');
            expect(result).to.have.property('type', 'dup');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 8, prefix: 'e'});
        });
        it('deletion two gene fusion', () => {
            const result = parseDiscontinuous('e', 'del(GENE1,GENE2)(1,2)');
            expect(result).to.have.property('type', 'del');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE2');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 2, prefix: 'e'});
        });
        it('deletion single gene fusion', () => {
            const result = parseDiscontinuous('e', 'del(GENE1)(1,8)');
            expect(result.feature1).to.have.property('name', 'GENE1');
            expect(result.feature2).to.have.property('name', 'GENE1');
            expect(result).to.have.property('type', 'del');
            expect(result.break1).to.eql({pos: 1, prefix: 'e'});
            expect(result.break2).to.eql({pos: 8, prefix: 'e'});
        });
    });
    describe('protein variants', () => {

    });
    describe('cytoband variants', () => {
        it('translocation');
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
