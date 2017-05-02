"use strict";
const {expect} = require('chai');
const {DependencyError, AttributeError, ParsingError} = require('./../../app/repo/error');
const {parse, parsePosition, parseContinuous} = require('./../../app/parser/notation');


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


describe('parse continuous', () => {
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
        it('exon cannot have substitution type');
        it('exon cannot have insertion type');
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

    });
});


describe('discontinuous', () => {
    describe('DNA variants', () => {});
    describe('cds variants', () => {});
    describe('exon variants', () => {});
    describe('protein variants', () => {});
    describe('cytoband variants', () => {});
});
