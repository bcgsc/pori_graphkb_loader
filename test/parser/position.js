

const {expect} = require('chai');
const {ParsingError} = require('./../../app/repo/error');
const {parsePosition} = require('./../../app/parser/position');


describe('parsePosition', () => {
    it('errors on invalid prefix', () => {
        expect(() => { parsePosition('k', '1'); }).to.throw(ParsingError);
    });
    describe('g prefix', () => {
        it('valid', () => {
            const result = parsePosition('g', '1');
            expect(result.pos).to.equal(1);
            expect(result['@class']).to.equal('GenomicPosition');
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
            expect(result['@class']).to.equal('CdsPosition');
        });
        it('negative offset', () => {
            const result = parsePosition('c', '1-3');
            expect(result.pos).to.equal(1);
            expect(result.offset).to.equal(-3);
            expect(result['@class']).to.equal('CdsPosition');
        });
        it('no offset specified', () => {
            const result = parsePosition('c', '1');
            expect(result.pos).to.equal(1);
            expect(result.offset).to.equal(0);
            expect(result['@class']).to.equal('CdsPosition');
        });
        it('errors on spaces', () => {
            expect(() => { parsePosition('c', '1 + 3'); }).to.throw(ParsingError);
        });
    });
    describe('p prefix', () => {
        it('defaults to ? on reference AA not given', () => {
            const result = parsePosition('p', '1');
            expect(result.pos).to.equal(1);
            expect(result.refAA).to.be.undefined;
            expect(result['@class']).to.equal('ProteinPosition');
        });
        it('non-specific reference AA', () => {
            const result = parsePosition('p', '?1');
            expect(result.pos).to.equal(1);
            expect(result.refAA).to.be.undefined;
            expect(result['@class']).to.equal('ProteinPosition');
        });
        it('valid', () => {
            const result = parsePosition('p', 'P11');
            expect(result.pos).to.equal(11);
            expect(result.refAA).to.equal('P');
            expect(result['@class']).to.equal('ProteinPosition');
        });
        it('ok on lowercase reference AA', () => {
            expect(() => { parsePosition('p', 'p1'); }).to.not.throw(ParsingError);
        });
        it('errors on position not given', () => {
            expect(() => { parsePosition('p', 'p'); }).to.throw(ParsingError);
        });
    });
    describe('e prefix', () => {
        it('valid', () => {
            const result = parsePosition('e', '1');
            expect(result.pos).to.equal(1);
            expect(result['@class']).to.equal('ExonicPosition');
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
            expect(result.majorBand).to.equal(1);
            expect(result.minorBand).to.equal(1);
            expect(result['@class']).to.equal('CytobandPosition');
        });
        it('q arm', () => {
            const result = parsePosition('y', 'q1.1');
            expect(result.arm).to.equal('q');
            expect(result.majorBand).to.equal(1);
            expect(result.minorBand).to.equal(1);
            expect(result['@class']).to.equal('CytobandPosition');
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
            expect(result.majorBand).to.equal(1);
            expect(result['@class']).to.equal('CytobandPosition');
        });
        it('major band null if not given', () => {
            const result = parsePosition('y', 'q');
            expect(result.arm).to.equal('q');
            expect(result['@class']).to.equal('CytobandPosition');
        });
        it('errors on minor band but no major band', () => {
            expect(() => { parsePosition('y', 'p.1'); }).to.throw(ParsingError);
        });
    });
});
