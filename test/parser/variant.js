

const {expect} = require('chai');
const {ParsingError} = require('./../../app/repo/error');
const {
    parseContinuous,
    parseMultiFeature,
    parse,
    EVENT_SUBTYPE
} = require('./../../app/parser/variant');


describe('parseMultiFeature', () => {
    describe('throws an error on', () => {
        it('short string', () => {
            expect(() => {
                parseMultiFeature('');
            }).to.throw('Too short.');
        });
        it('missing opening bracket', () => {
            expect(() => {
                parseMultiFeature('transe.1,e.2)');
            }).to.throw('Missing opening');
        });
        it('missing closing bracket', () => {
            expect(() => {
                parseMultiFeature('trans(e.1,e.2');
            }).to.throw('Missing closing');
        });
        it('missing variant type', () => {
            expect(() => {
                parseMultiFeature('(e.1,e.2)');
            }).to.throw('Variant type was not specified');
        });
        it('invalid variant type', () => {
            expect(() => {
                parseMultiFeature('blargh(e.1,e.2)');
            }).to.throw('Variant type not recognized');
        });
        it('missing prefix', () => {
            expect(() => {
                parseMultiFeature('trans(1,2)');
            }).to.throw('Error in parsing the first breakpoint');
        });
        it('invalid prefix', () => {
            expect(() => {
                parseMultiFeature('trans(k.1,e.2)');
            }).to.throw('Error in parsing the first breakpoint');
        });
        it('multiple commas', () => {
            expect(() => {
                parseMultiFeature('trans(e.1,e.2,e.3)');
            }).to.throw('Single comma expected');
        });
        it('missing comma', () => {
            expect(() => {
                parseMultiFeature('trans(e.123)');
            }).to.throw('Missing comma');
        });
        it('bad first breakpoint', () => {
            expect(() => {
                const result = parseMultiFeature('trans(e.123k,e.1234)');
                console.log(result);
            }).to.throw('Error in parsing the first breakpoint');
        });
        it('bad second breakpoint', () => {
            expect(() => {
                parseMultiFeature('fusion(e.123,e.123k)');
            }).to.throw('Error in parsing the second breakpoint');
        });
        it('insertion types', () => {
            expect(() => {
                parseMultiFeature('ins(e.123,e.124)');
            }).to.throw('Continuous notation is preferred');
        });
        it('indel types', () => {
            expect(() => {
                parseMultiFeature('delins(e.123,e.123)');
            }).to.throw('Continuous notation is preferred');
        });
        it('inversion types', () => {
            expect(() => {
                parseMultiFeature('inv(e.123,e.123)');
            }).to.throw('Continuous notation is preferred');
        });
        it('deletion types', () => {
            expect(() => {
                parseMultiFeature('del(e.123,e.123)');
            }).to.throw('Continuous notation is preferred');
        });
        it('duplication types', () => {
            expect(() => {
                parseMultiFeature('dup(e.123,e.123)');
            }).to.throw('Continuous notation is preferred');
        });
    });
    it('parses exon gene fusion', () => {
        const parsed = parseMultiFeature('fusion(e.1,e.2)');
        expect(parsed).to.eql({
            break1Repr: 'e.1',
            break2Repr: 'e.2',
            break1Start: {'@class': 'ExonicPosition', pos: 1},
            break2Start: {'@class': 'ExonicPosition', pos: 2},
            type: EVENT_SUBTYPE.FUSION
        });
    });
    it('parses genomic translocation', () => {
        const parsed = parseMultiFeature('trans(g.1,g.2)');
        expect(parsed).to.eql({
            break1Repr: 'g.1',
            break2Repr: 'g.2',
            break1Start: {'@class': 'GenomicPosition', pos: 1},
            break2Start: {'@class': 'GenomicPosition', pos: 2},
            type: EVENT_SUBTYPE.TRANS
        });
    });
    it('parses untemplated sequence', () => {
        const parsed = parseMultiFeature('fusion(e.1,e.2)ATGC');
        expect(parsed).to.eql({
            break1Repr: 'e.1',
            break2Repr: 'e.2',
            break1Start: {'@class': 'ExonicPosition', pos: 1},
            break2Start: {'@class': 'ExonicPosition', pos: 2},
            type: EVENT_SUBTYPE.FUSION,
            untemplatedSeq: 'ATGC',
            untemplatedSeqSize: 4
        });
    });
    it('parses non-specific untemplated sequence', () => {
        const parsed = parseMultiFeature('fusion(e.1,e.2)5');
        expect(parsed).to.eql({
            break1Repr: 'e.1',
            break2Repr: 'e.2',
            break1Start: {'@class': 'ExonicPosition', pos: 1},
            break2Start: {'@class': 'ExonicPosition', pos: 2},
            type: EVENT_SUBTYPE.FUSION,
            untemplatedSeqSize: 5
        });
    });
    it('parses breakpoint ranges', () => {
        const parsed = parseMultiFeature('fusion(e.1_17,e.20_28)');
        expect(parsed).to.eql({
            break1Repr: 'e.(1_17)',
            break2Repr: 'e.(20_28)',
            break1Start: {'@class': 'ExonicPosition', pos: 1},
            break1End: {'@class': 'ExonicPosition', pos: 17},
            break2Start: {'@class': 'ExonicPosition', pos: 20},
            break2End: {'@class': 'ExonicPosition', pos: 28},
            type: EVENT_SUBTYPE.FUSION
        });
    });
});


describe('parseContinuous', () => {
    describe('DNA variant:', () => {
        it('deletion single bp', () => {
            const result = parseContinuous('g.3del');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {
                    '@class': 'GenomicPosition',
                    pos: 3
                },
                break1Repr: 'g.3',
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('deletion spans a range', () => {
            const result = parseContinuous('g.3_5del');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break1Repr: 'g.3',
                break2Repr: 'g.5',
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('deletion has a reference sequence', () => {
            const result = parseContinuous('g.3_5delTAA');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break1Repr: 'g.3',
                break2Repr: 'g.5',
                refSeq: 'TAA',
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain start', () => {
            const result = parseContinuous('g.(3_4)_5dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break1End: {'@class': 'GenomicPosition', pos: 4},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break1Repr: 'g.(3_4)',
                break2Repr: 'g.5',
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain end', () => {
            const result = parseContinuous('g.3_(5_7)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break2End: {'@class': 'GenomicPosition', pos: 7},
                break1Repr: 'g.3',
                break2Repr: 'g.(5_7)',
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain start and end', () => {
            const result = parseContinuous('g.(1_3)_(5_7)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'GenomicPosition', pos: 1},
                break1End: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break2End: {'@class': 'GenomicPosition', pos: 7},
                break1Repr: 'g.(1_3)',
                break2Repr: 'g.(5_7)',
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('duplication has a reference sequence', () => {
            const result = parseContinuous('g.3_5dupTAA');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'GenomicPosition', pos: 3},
                break2Start: {'@class': 'GenomicPosition', pos: 5},
                break1Repr: 'g.3',
                break2Repr: 'g.5',
                untemplatedSeq: 'TAA',
                refSeq: 'TAA',
                untemplatedSeqSize: 3,
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('basic substitution', () => {
            const result = parseContinuous('g.4A>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'GenomicPosition', pos: 4},
                break1Repr: 'g.4',
                untemplatedSeq: 'T',
                refSeq: 'A',
                untemplatedSeqSize: 1,
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('substitution with alt seq options', () => {
            const result = parseContinuous('g.4A>T^C');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'GenomicPosition', pos: 4},
                break1Repr: 'g.4',
                untemplatedSeq: 'T^C',
                refSeq: 'A',
                untemplatedSeqSize: 1,
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('substitution with uncertainty', () => {
            const result = parseContinuous('g.(4_7)A>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'GenomicPosition', pos: 4},
                break1End: {'@class': 'GenomicPosition', pos: 7},
                break1Repr: 'g.(4_7)',
                untemplatedSeq: 'T',
                refSeq: 'A',
                untemplatedSeqSize: 1,
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('indel spans a range uncertain start and end ref and alt specified', () => {
            const result = parseContinuous('g.(1_3)_(5_7)delTAAinsACG');
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
                untemplatedSeqSize: 3,
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('indel ref specified', () => {
            const result = parseContinuous('g.10delTins');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'GenomicPosition', pos: 10},
                break1Repr: 'g.10',
                refSeq: 'T',
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('indel alt specified', () => {
            const result = parseContinuous('g.10delinsACC');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'GenomicPosition', pos: 10},
                break1Repr: 'g.10',
                untemplatedSeq: 'ACC',
                untemplatedSeqSize: 3,
                prefix: 'g'
            };
            expect(result).eql(exp);
        });
        it('errors on protein style missense', () => {
            expect(() => { parseContinuous('g.15T'); }).to.throw(ParsingError);
        });
    });
    describe('cds variant:', () => {
        it('deletion single bp', () => {
            const result = parseContinuous('c.3+1del');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 1},
                break1Repr: 'c.3+1',
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('deletion spans a range', () => {
            const result = parseContinuous('c.3+1_5-2del');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 1},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: -2},
                break1Repr: 'c.3+1',
                break2Repr: 'c.5-2',
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('deletion has a reference sequence', () => {
            const result = parseContinuous('c.3_5delTAA');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 0},
                break1Repr: 'c.3',
                break2Repr: 'c.5',
                refSeq: 'TAA',
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain start', () => {
            const result = parseContinuous('c.(3+1_4-1)_10dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 1},
                break1End: {'@class': 'CdsPosition', pos: 4, offset: -1},
                break2Start: {'@class': 'CdsPosition', pos: 10, offset: 0},
                break1Repr: 'c.(3+1_4-1)',
                break2Repr: 'c.10',
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain end', () => {
            const result = parseContinuous('c.3_(5+1_55-1)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 1},
                break2End: {'@class': 'CdsPosition', pos: 55, offset: -1},
                break1Repr: 'c.3',
                break2Repr: 'c.(5+1_55-1)',
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('duplication spans a range uncertain start and end', () => {
            const result = parseContinuous('c.(1_3)_(5_7)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CdsPosition', pos: 1, offset: 0},
                break1End: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 0},
                break2End: {'@class': 'CdsPosition', pos: 7, offset: 0},
                break1Repr: 'c.(1_3)',
                break2Repr: 'c.(5_7)',
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('duplication has a reference sequence', () => {
            const result = parseContinuous('c.3_5dupTAA');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CdsPosition', pos: 3, offset: 0},
                break2Start: {'@class': 'CdsPosition', pos: 5, offset: 0},
                break1Repr: 'c.3',
                break2Repr: 'c.5',
                refSeq: 'TAA',
                untemplatedSeq: 'TAA',
                untemplatedSeqSize: 3,
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('basic substitution', () => {
            const result = parseContinuous('c.4A>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'CdsPosition', pos: 4, offset: 0},
                break1Repr: 'c.4',
                refSeq: 'A',
                untemplatedSeq: 'T',
                untemplatedSeqSize: 1,
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('substitution with uncertainty', () => {
            const result = parseContinuous('c.(4_7)A>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'CdsPosition', pos: 4, offset: 0},
                break1End: {'@class': 'CdsPosition', pos: 7, offset: 0},
                break1Repr: 'c.(4_7)',
                refSeq: 'A',
                untemplatedSeq: 'T',
                untemplatedSeqSize: 1,
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('indel spans a range uncertain start and end ref and alt specified', () => {
            const result = parseContinuous('c.(1_3)_(5_7)delTAAinsACG');
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
                untemplatedSeqSize: 3,
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('indel ref specified', () => {
            const result = parseContinuous('c.10delTins');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'CdsPosition', pos: 10, offset: 0},
                break1Repr: 'c.10',
                refSeq: 'T',
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('indel alt specified', () => {
            const result = parseContinuous('c.10delinsACC');
            const exp = {
                type: EVENT_SUBTYPE.INDEL,
                break1Start: {'@class': 'CdsPosition', pos: 10, offset: 0},
                break1Repr: 'c.10',
                untemplatedSeq: 'ACC',
                untemplatedSeqSize: 3,
                prefix: 'c'
            };
            expect(result).eql(exp);
        });
        it('substitution before the coding sequence', () => {
            const result = parseContinuous('c.-124C>T');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'CdsPosition', pos: 1, offset: -124},
                break1Repr: 'c.1-124',
                untemplatedSeq: 'T',
                untemplatedSeqSize: 1,
                refSeq: 'C',
                prefix: 'c'
            };
            expect(result).to.eql(exp);
        });
    });
    describe('exon variants', () => {
        it('errors because exon cannot have substitution type', () => {
            expect(() => { parseContinuous('e.1C>T'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('e.C1T'); }).to.throw(ParsingError);
        });
        it('duplication single exon', () => {
            const result = parseContinuous('e.1dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break1Repr: 'e.1',
                prefix: 'e'
            });
        });
        it('duplication single exon with uncertainty', () => {
            const result = parseContinuous('e.(1_2)dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break1End: {'@class': 'ExonicPosition', pos: 2},
                break1Repr: 'e.(1_2)',
                prefix: 'e'
            });
        });
        it('duplication of multiple exons', () => {
            const result = parseContinuous('e.1_3dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break2Start: {'@class': 'ExonicPosition', pos: 3},
                break1Repr: 'e.1',
                break2Repr: 'e.3',
                prefix: 'e'
            });
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parseContinuous('e.(1_2)_(3_4)dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break1End: {'@class': 'ExonicPosition', pos: 2},
                break1Repr: 'e.(1_2)',
                break2Start: {'@class': 'ExonicPosition', pos: 3},
                break2End: {'@class': 'ExonicPosition', pos: 4},
                break2Repr: 'e.(3_4)',
                prefix: 'e'
            });
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parseContinuous('e.(1_2)_4dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 1},
                break1End: {'@class': 'ExonicPosition', pos: 2},
                break1Repr: 'e.(1_2)',
                break2Start: {'@class': 'ExonicPosition', pos: 4},
                break2Repr: 'e.4',
                prefix: 'e'
            });
        });
        it('duplication of multiple exons with uncertainty', () => {
            const result = parseContinuous('e.2_(3_4)dup');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'ExonicPosition', pos: 2},
                break1Repr: 'e.2',
                break2Start: {'@class': 'ExonicPosition', pos: 3},
                break2End: {'@class': 'ExonicPosition', pos: 4},
                break2Repr: 'e.(3_4)',
                prefix: 'e'
            });
        });
    });
    describe('protein variants', () => {
        it('splice site variant', () => {
            const result = parse('p.W288spl');
            expect(result.type).to.equal('splice-site');
        });
        it('case insensitive frameshift', () => {
            // civic example
            const result = parse('p.W288FS');
            expect(result.type).to.equal('frameshift');
        });
        it('lowercase substitution', () => {
            const result = parse('p.d816n');
            expect(result.untemplatedSeq).to.equal('n');
            expect(result.type).to.equal('substitution');
            expect(result.refSeq).to.equal('d');
        });
        it('substitution no alt', () => {
            const result = parse('p.d816');
            expect(result.refSeq).to.equal('d');
            expect(result.type).to.equal('substitution');
        });
        it('frameshift alt specified', () => {
            const result = parseContinuous('p.R10Kfs');
            const exp = {
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                untemplatedSeq: 'K',
                break1Repr: 'p.R10',
                refSeq: 'R',
                untemplatedSeqSize: 1,
                prefix: 'p'
            };
            expect(result).to.eql(exp);
        });
        it('frameshift alt specified and truncation point', () => {
            const result = parseContinuous('p.R10Kfs*10');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                untemplatedSeq: 'K',
                untemplatedSeqSize: 1,
                truncation: 10,
                refSeq: 'R',
                break1Repr: 'p.R10',
                prefix: 'p'
            });
        });
        it('frameshift truncation conflict error', () => {
            expect(() => {
                parseContinuous('p.R10*fs*10');
            }).to.throw('conflict');
        });
        it('frameshift set null on truncation point without position', () => {
            const result = parseContinuous('p.R10Kfs*');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                untemplatedSeq: 'K',
                untemplatedSeqSize: 1,
                truncation: null,
                refSeq: 'R',
                break1Repr: 'p.R10',
                prefix: 'p'
            });
        });
        it('frameshift immeadiate truncation', () => {
            const result = parseContinuous('p.R10*fs');
            expect(result).to.eql({
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                untemplatedSeq: '*',
                untemplatedSeqSize: 1,
                truncation: 1,
                refSeq: 'R',
                break1Repr: 'p.R10',
                prefix: 'p'
            });
        });
        it('frameshift errors on range', () => {
            expect(() => { const result = parseContinuous('p.R10_M11Kfs*'); console.log(result); }).to.throw(ParsingError);
        });
        it('frameshift allows uncertain range', () => {
            const result = parseContinuous('p.(R10_M11)fs*10');
            const exp = {
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                break1End: {'@class': 'ProteinPosition', pos: 11, refAA: 'M'},
                break1Repr: 'p.(R10_M11)',
                truncation: 10,
                prefix: 'p'
            };
            expect(result).to.eql(exp);
        });
        it('frameshift no alt but truncation point specified', () => {
            const result = parseContinuous('p.R10fs*10');
            const exp = {
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                break1Repr: 'p.R10',
                truncation: 10,
                refSeq: 'R',
                prefix: 'p'
            };
            expect(result).to.eql(exp);
        });
        it('frameshift no alt or truncation point', () => {
            const result = parseContinuous('p.R10fs');
            const exp = {
                type: EVENT_SUBTYPE.FS,
                break1Start: {'@class': 'ProteinPosition', pos: 10, refAA: 'R'},
                break1Repr: 'p.R10',
                refSeq: 'R',
                prefix: 'p'
            };
            expect(result).to.eql(exp);
        });
        it('missense mutation', () => {
            const result = parseContinuous('p.F12G');
            const exp = {
                type: EVENT_SUBTYPE.SUB,
                break1Start: {'@class': 'ProteinPosition', pos: 12, refAA: 'F'},
                break1Repr: 'p.F12',
                untemplatedSeq: 'G',
                untemplatedSeqSize: 1,
                refSeq: 'F',
                prefix: 'p'
            };
            expect(result).to.eql(exp);
        });
        it('errors on genomic style missense', () => {
            expect(() => { parseContinuous('p.G12G>T'); }).to.throw(ParsingError);
        });
    });
    describe('cytoband variants', () => {
        it('errors because cytoband variant cannot have ins type', () => {
            expect(() => { parseContinuous('y.p12.1ins'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('y.p12.1_p13ins'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have delins type', () => {
            expect(() => { parseContinuous('y.p12.1delins'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('y.p12.1_p13delins'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have > type', () => {
            expect(() => { parseContinuous('y.p12.1G>T'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('y.Gp12.1T'); }).to.throw(ParsingError);
        });
        it('errors because cytoband variant cannot have fs type', () => {
            expect(() => { parseContinuous('y.p12.1fs'); }).to.throw(ParsingError);
            expect(() => { parseContinuous('y.(p12.1_p13)fs'); }).to.throw(ParsingError);
        });
        it('duplication of whole p arm', () => {
            const result = parseContinuous('y.pdup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p'},
                break1Repr: 'y.p',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('duplication of range on p major band', () => {
            const result = parseContinuous('y.p11dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'p', majorBand: 11},
                break1Repr: 'y.p11',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('duplication of range on p minor band', () => {
            const result = parseContinuous('y.p11.1dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1
                },
                break1Repr: 'y.p11.1',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('duplication of range on p arm', () => {
            const result = parseContinuous('y.p11.1_p13.3dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1
                },
                break1Repr: 'y.p11.1',
                break2Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 3
                },
                break2Repr: 'y.p13.3',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('duplication on p arm uncertain positions', () => {
            const result = parseContinuous('y.(p11.1_p11.2)_(p13.4_p14)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1
                },
                break1End: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 2
                },
                break1Repr: 'y.(p11.1_p11.2)',
                break2Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 4
                },
                break2End: {'@class': 'CytobandPosition', arm: 'p', majorBand: 14},
                break2Repr: 'y.(p13.4_p14)',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('duplication on p arm uncertain start', () => {
            const result = parseContinuous('y.(p11.1_p11.2)_p13.3dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1
                },
                break1End: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 2
                },
                break1Repr: 'y.(p11.1_p11.2)',
                break2Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 3
                },
                break2Repr: 'y.p13.3',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('duplication on p arm uncertain end', () => {
            const result = parseContinuous('y.p13.3_(p15.1_p15.2)dup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 3
                },
                break1Repr: 'y.p13.3',
                break2Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 15, minorBand: 1
                },
                break2End: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 15, minorBand: 2
                },
                break2Repr: 'y.(p15.1_p15.2)',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('duplication of whole q arm', () => {
            const result = parseContinuous('y.qdup');
            const exp = {
                type: EVENT_SUBTYPE.DUP,
                break1Start: {'@class': 'CytobandPosition', arm: 'q'},
                break1Repr: 'y.q',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('deletion of whole p arm', () => {
            const result = parseContinuous('y.pdel');
            const exp = {
                type: EVENT_SUBTYPE.DEL,
                break1Start: {'@class': 'CytobandPosition', arm: 'p'},
                break1Repr: 'y.p',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
        it('inversion of a range on the p arm', () => {
            const result = parseContinuous('y.p11.1_p13.3inv');
            const exp = {
                type: EVENT_SUBTYPE.INV,
                break1Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 11, minorBand: 1
                },
                break2Start: {
                    '@class': 'CytobandPosition', arm: 'p', majorBand: 13, minorBand: 3
                },
                break1Repr: 'y.p11.1',
                break2Repr: 'y.p13.3',
                prefix: 'y'
            };
            expect(result).to.eql(exp);
        });
    });
    it('error on short string', () => {
        expect(() => { parseContinuous(''); }).to.throw(ParsingError);
    });
    it('errors on bad prefix', () => {
        expect(() => { parseContinuous('f.G12D'); }).to.throw(ParsingError);
    });
    it('errors on missing . delimiter after prefix', () => {
        expect(() => { parseContinuous('pG12D'); }).to.throw(ParsingError);
    });
});
