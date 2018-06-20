'use strict';
const {expect} = require('chai');
const {ParsingError} = require('./../../app/repo/error');
const {
    parse,
    EVENT_SUBTYPE
} = require('./../../app/parser/variant');


describe('parse', () => {
    describe('DNA variant:', () => {
        it('deletion single bp', () => {
            const result = parse('g.3del');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {
                    '@class': 'GenomicPosition',
                    pos: 3
                },
                break1Repr: 'g.3'
            };
            expect(result).eql(exp);
        });
        it('deletion spans a range', () => {
            const result = parse('g.3_5del');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break1Repr: 'g.3',
                break2Repr: 'g.5'
            };
            expect(result).eql(exp);
        });
        it('deletion has a reference sequence', () => {
            const result = parse('g.3_5delTAA');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break1Repr: 'g.3',
                break2Repr: 'g.5',
                refSeq: 'TAA'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain start', () => {
            const result = parse('g.(3_4)_5dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break1End: {'@class': 'GenomicPosition', pos: 4},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break1Repr: 'g.(3_4)',
                break2Repr: 'g.5'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain end', () => {
            const result = parse('g.3_(5_7)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break2End: {'@class': 'GenomicPosition', pos: 7},
                break1Repr: 'g.3',
                break2Repr: 'g.(5_7)'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain start and end', () => {
            const result = parse('g.(1_3)_(5_7)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'GenomicPosition', pos: 1},
                break1End: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break2End: {'@class': 'GenomicPosition', pos: 7},
                break1Repr: 'g.(1_3)',
                break2Repr: 'g.(5_7)'
            };
            expect(result).eql(exp);
        });
        it('duplication has a reference sequence', () => {
            const result = parse('g.3_5dupTAA');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break1Repr: 'g.3',
                break2Repr: 'g.5',
                untemplatedSeq: 'TAA',
                refSeq: 'TAA',
                untemplatedSeqSize: 3
            };
            expect(result).eql(exp);
        });
        it('basic substitution', () => {
            const result = parse('g.4A>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'GenomicPosition', pos: 4},
                break1Repr: 'g.4',
                untemplatedSeq: 'T',
                refSeq: 'A',
                untemplatedSeqSize: 1
            };
            expect(result).eql(exp);
        });
        it('substitution with uncertainty', () => {
            const result = parse('g.(4_7)A>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'GenomicPosition', pos: 4},
                break1End: {'@class': 'GenomicPosition', pos: 7},
                break1Repr: 'g.(4_7)',
                untemplatedSeq: 'T',
                refSeq: 'A',
                untemplatedSeqSize: 1
            };
            expect(result).eql(exp);
        });
        it('indel spans a range uncertain start and end ref and alt specified', () => {
            const result = parse('g.(1_3)_(5_7)delTAAinsACG');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'GenomicPosition', pos: 1},
                break1End: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break2End: {'@class': 'GenomicPosition', pos: 7},
                break1Repr: 'g.(1_3)',
                break2Repr: 'g.(5_7)',
                untemplatedSeq: 'ACG',
                refSeq: 'TAA',
                untemplatedSeqSize: 3
            };
            expect(result).eql(exp);
        });
        it('indel ref specified', () => {
            const result = parse('g.10delTins');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'GenomicPosition', pos: 10},
                break1Repr: 'g.10',
                refSeq: 'T'
            };
            expect(result).eql(exp);
        });
        it('indel alt specified', () => {
            const result = parse('g.10delinsACC');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'GenomicPosition', pos: 10},
                break1Repr: 'g.10',
                untemplatedSeq: 'ACC',
                untemplatedSeqSize: 3
            };
            expect(result).eql(exp);
        });
        it('errors on protein style missense', () => {
            expect(() => { parse('g.15T'); }).to.throw(ParsingError);
        });
    });
    describe('cds variant:', () => {
        it('deletion single bp', () => {
            const result = parse('c.3+1del');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 1},
                break1Repr: 'c.3+1'
            };
            expect(result).eql(exp);
        });
        it('deletion spans a range', () => {
            const result = parse('c.3+1_5-2del');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 1},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: -2},
                break1Repr: 'c.3+1',
                break2Repr: 'c.5-2'
            };
            expect(result).eql(exp);
        });
        it('deletion has a reference sequence', () => {
            const result = parse('c.3_5delTAA');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 0},
                break1Repr: 'c.3',
                break2Repr: 'c.5',
                refSeq: 'TAA'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain start', () => {
            const result = parse('c.(3+1_4-1)_10dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 1},
                break1End: {'@class': 'CdsPosition', pos: 4, offset: -1},
                break2Start: {'@class': 'CdsPosition', pos: 10, offset: 0},
                break1Repr: 'c.(3+1_4-1)',
                break2Repr: 'c.10'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain end', () => {
            const result = parse('c.3_(5+1_55-1)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 1},
                break2End: {'@class': 'CdsPosition', pos: 55, offset: -1},
                break1Repr: 'c.3',
                break2Repr: 'c.(5+1_55-1)'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain start and end', () => {
            const result = parse('c.(1_3)_(5_7)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CdsPosition', pos: 1, offset: 0},
                break1End: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 0},
                break2End: {'@class': 'CdsPosition', pos: 7, offset: 0},
                break1Repr: 'c.(1_3)',
                break2Repr: 'c.(5_7)'
            };
            expect(result).eql(exp);
        });
        it('duplication has a reference sequence', () => {
            const result = parse('c.3_5dupTAA');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 0},
                break1Repr: 'c.3',
                break2Repr: 'c.5',
                refSeq: 'TAA',
                untemplatedSeq: 'TAA',
                untemplatedSeqSize: 3
            };
            expect(result).eql(exp);
        });
        it('basic substitution', () => {
            const result = parse('c.4A>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'CdsPosition', pos: 4, offset: 0},
                break1Repr: 'c.4',
                refSeq: 'A',
                untemplatedSeq: 'T',
                untemplatedSeqSize: 1
            };
            expect(result).eql(exp);
        });
        it('substitution with uncertainty', () => {
            const result = parse('c.(4_7)A>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'CdsPosition', pos: 4, offset: 0},
                break1End: {'@class': 'CdsPosition', pos: 7, offset: 0},
                break1Repr: 'c.(4_7)',
                refSeq: 'A',
                untemplatedSeq: 'T',
                untemplatedSeqSize: 1
            };
            expect(result).eql(exp);
        });
        it('indel spans a range uncertain start and end ref and alt specified', () => {
            const result = parse('c.(1_3)_(5_7)delTAAinsACG');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'CdsPosition', pos: 1, offset: 0},
                break1End: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 0},
                break2End: {'@class': 'CdsPosition', pos: 7, offset: 0},
                break1Repr: 'c.(1_3)',
                break2Repr: 'c.(5_7)',
                refSeq: 'TAA',
                untemplatedSeq: 'ACG',
                untemplatedSeqSize: 3
            };
            expect(result).eql(exp);
        });
        it('indel ref specified', () => {
            const result = parse('c.10delTins');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'CdsPosition', pos: 10, offset: 0},
                break1Repr: 'c.10',
                refSeq: 'T'
            };
            expect(result).eql(exp);
        });
        it('indel alt specified', () => {
            const result = parse('c.10delinsACC');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'CdsPosition', pos: 10, offset: 0},
                break1Repr: 'c.10',
                untemplatedSeq: 'ACC',
                untemplatedSeqSize: 3
            };
            expect(result).eql(exp);
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
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break1Repr: 'e.1'
            });
        });
        it('duplication single exon with uncertainty', () => {
            const result = parse('e.(1_2)dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break1End: {'@class': 'ExonicPosition', pos: 2},
                break1Repr: 'e.(1_2)'
            });
        });
        it('duplication of multiple exons', () => {
            const result = parse('e.1_3dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break2Start: {'@class': 'ExonicPosition', pos: 3},
                break1Repr: 'e.1',
                break2Repr: 'e.3'
            });
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parse('e.(1_2)_(3_4)dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break1End: {'@class': 'ExonicPosition', pos: 2},
                break1Repr: 'e.(1_2)',
                break2Start: {'@class': 'ExonicPosition', pos: 3},
                break2End: {'@class': 'ExonicPosition', pos: 4},
                break2Repr: 'e.(3_4)'
            });
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parse('e.(1_2)_4dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break1End: {'@class': 'ExonicPosition', pos: 2},
                break1Repr: 'e.(1_2)',
                break2Start: {'@class': 'ExonicPosition', pos: 4},
                break2Repr: 'e.4'
            });
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parse('e.2_(3_4)dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 2},
                break1Repr: 'e.2',
                break2Start: {'@class': 'ExonicPosition', pos: 3},
                break2End: {'@class': 'ExonicPosition', pos: 4},
                break2Repr: 'e.(3_4)'
            });
        });
    });
    describe('protein variants', () => {
        it('frameshift alt specified', () => {
            const result = parse('p.R10Kfs');
            const exp = {
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                untemplatedSeq: 'K',
                break1Repr: 'p.R10',
                refSeq: 'R',
                untemplatedSeqSize: 1
            };
            expect(result).to.eql(exp);
        });
        it('frameshift alt specified and truncation point', () => {
            const result = parse('p.R10Kfs*10');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                untemplatedSeq: 'K',
                untemplatedSeqSize: 1,
                truncation: 10,
                refSeq: 'R',
                break1Repr: 'p.R10'
            });
        });
        it('frameshift errors on truncation point without position', () => {
            expect(() => { parse('p.R10Kfs*'); }).to.throw(ParsingError);
        });
        it('frameshift errors on range', () => {
            expect(() => { parse('p.R10_M11Kfs*'); }).to.throw(ParsingError);
        });
        it('frameshift allows uncertain range', () => {
            const result = parse('p.(R10_M11)fs*10');
            const exp = {
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                break1End: {'@class': 'ProteinPosition', pos: 11, refAA: 'M'},
                break1Repr: 'p.(R10_M11)',
                truncation: 10
            };
            expect(result).to.eql(exp);
        });
        it('frameshift no alt but truncation point specified', () => {
            const result = parse('p.R10fs*10');
            const exp = {
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                break1Repr: 'p.R10',
                truncation: 10,
                refSeq: 'R'
            };
            expect(result).to.eql(exp);
        });
        it('frameshift no alt or truncation point', () => {
            const result = parse('p.R10fs');
            const exp = {
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                break1Repr: 'p.R10',
                refSeq: 'R'
            };
            expect(result).to.eql(exp);
        });
        it('missense mutation', () => {
            const result = parse('p.F12G');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'ProteinPosition', pos: 12, refAA: 'F'},
                break1Repr: 'p.F12',
                untemplatedSeq: 'G',
                untemplatedSeqSize: 1,
                refSeq: 'F'
            };
            expect(result).to.eql(exp);
        });
        it('errors on genomic style missense', () => {
            expect(() => { parse('p.G12G>T'); }).to.throw(ParsingError);
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
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p'},
                type: EVENT_SUBTYPE.DUP,
                break1Repr: 'y.p'
            };
            expect(result).to.eql(exp);
        });
        it('duplication of range on p major band', () => {
            const result = parse('y.p11dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11},
                type: EVENT_SUBTYPE.DUP,
                break1Repr: 'y.p11'
            };
            expect(result).to.eql(exp);
        });
        it('duplication of range on p minor band', () => {
            const result = parse('y.p11.1dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1},
                type: EVENT_SUBTYPE.DUP,
                break1Repr: 'y.p11.1'
            };
            expect(result).to.eql(exp);
        });
        it('duplication of range on p arm', () => {
            const result = parse('y.p11.1_p13.3dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1},
                type: EVENT_SUBTYPE.DUP,
                break1Repr: 'y.p11.1',
                break2Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 3},
                break2Repr: 'y.p13.3'
            };
            expect(result).to.eql(exp);
        });
        it('duplication on p arm uncertain positions', () => {
            const result = parse('y.(p11.1_p11.2)_(p13.4_p14)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1},
                break1End: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 2},
                type: EVENT_SUBTYPE.DUP,
                break1Repr: 'y.(p11.1_p11.2)',
                break2Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 4},
                break2End: {'@class': 'CytobandPosition', arm: 'p', majorBand: 14},
                break2Repr: 'y.(p13.4_p14)'
            };
            expect(result).to.eql(exp);
        });
        it('duplication on p arm uncertain start', () => {
            const result = parse('y.(p11.1_p11.2)_p13.3dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1},
                break1End: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 2},
                type: EVENT_SUBTYPE.DUP,
                break1Repr: 'y.(p11.1_p11.2)',
                break2Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 3},
                break2Repr: 'y.p13.3'
            };
            expect(result).to.eql(exp);
        });
        it('duplication on p arm uncertain end', () => {
            const result = parse('y.p13.3_(p15.1_p15.2)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 3},
                break1Repr: 'y.p13.3',
                type: EVENT_SUBTYPE.DUP,
                break2Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 15, minorBand: 1},
                break2End: {'@class': 'CytobandPosition', arm: 'p', majorBand: 15, minorBand: 2},
                break2Repr: 'y.(p15.1_p15.2)'
            };
            expect(result).to.eql(exp);
        });
        it('duplication of whole q arm', () => {
            const result = parse('y.qdup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'q'},
                break1Repr: 'y.q',
                type: EVENT_SUBTYPE.DUP
            };
            expect(result).to.eql(exp);
        });
        it('deletion of whole p arm', () => {
            const result = parse('y.pdel');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'CytobandPosition', arm: 'p'},
                break1Repr: 'y.p'
            };
            expect(result).to.eql(exp);
        });
        it('inversion of a range on the p arm', () => {
            const result = parse('y.p11.1_p13.3inv');
            const exp = {
                type: EVENT_SUBTYPE.INV,
                break1Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1},
                break2Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 3},
                break1Repr: 'y.p11.1',
                break2Repr: 'y.p13.3'
            };
            expect(result).to.eql(exp);
        });
    });
    it('error on short string', () => {
        expect(() => { parse(''); }).to.throw(ParsingError);
    });
    it('errors on bad prefix', () => {
        expect(() => { parse('f.G12D'); }).to.throw(ParsingError);
    });
    it('errors on missing . delimiter after prefix', () => {
        expect(() => { parse('pG12D'); }).to.throw(ParsingError);
    });
});
