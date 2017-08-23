'use strict';
const {expect} = require('chai');
const {
    Position,
    CodingSequencePosition,
    CytobandPosition
} = require('./../../app/repo/position');

describe('Position.compare', () => {
    it('errors on unequal prefixes', () => {
        expect(() => {
            return Position.compare({prefix: 'y'}, {prefix: 'e'});
        }).to.throw(TypeError);
    });
    it('errors on null position', () => {
        expect(() => {
            return Position.compare({prefix: 'e', pos: 1}, {prefix: 'e', pos: null});
        }).to.throw(TypeError);
        expect(() => {
            return Position.compare({prefix: 'e', pos: 1}, {prefix: 'e'});
        }).to.throw(TypeError);
        expect(() => {
            return Position.compare({prefix: 'e'}, {prefix: 'e'});
        }).to.throw(TypeError);
    });
    it('allows prefix to be null', () => {
        expect(() => {
            Position.compare({pos: 1}, {pos: 1});
        }).to.not.throw(TypeError);
    });
    it('returns -1 when curr < pos', () => {
        expect(Position.compare({pos: 0}, {pos: 1})).to.equal(-1);
    });
    it('returns +1 when curr > pos', () => {
        expect(Position.compare({pos: 2}, {pos: 1})).to.equal(1);
    });
    it('returns 0 when positions are equal', () => {
        expect(Position.compare({pos: 1}, {pos: 1})).to.equal(0);
    });

});
describe('CodingSequencePosition.compare', () => {
    it('errors when the offset is not defined', () => {
        expect(() => {
            CodingSequencePosition.compare({pos: 1, offset: null}, {pos: 1, offset: 0});
        }).to.throw(TypeError);
    });
    it('allows the offset to be undefined if the positions are not equal', () => {
        expect(CodingSequencePosition.compare({pos: 1, offset: null}, {pos: 2, offset: -1})).to.equal(-1);
    });
    it('returns -1 when the curr.pos < other.pos', () => {
        expect(CodingSequencePosition.compare({pos: 1, offset: 1}, {pos: 2, offset: -1})).to.equal(-1);
    });
    it('returns -1 when the pos is equal but curr has a lower offset', () => {
        expect(CodingSequencePosition.compare({pos: 2, offset: -2}, {pos: 2, offset: -1})).to.equal(-1);
    });
    it('returns +1 when the pos is equal but curr has a higher offset', () => {
        expect(CodingSequencePosition.compare({pos: 2, offset: 0}, {pos: 2, offset: -1})).to.equal(1);
    });
    it('returns 0 when both the position and offset are equal', () => {
        expect(CodingSequencePosition.compare({pos: 2, offset: 0}, {pos: 2, offset: 0})).to.equal(0);
    });
});
describe('CytobandPosition.compare', () => {
    it('errors when the prefix is not equal', () => {
        expect(() => {
            CytobandPosition.compare({prefix: 'y', arm: 'p'}, {prefix: 'e', arm: 'q'});
        }).to.throw(TypeError);
    });
    it('errors when the arm is null', () => {
        expect(() => {
            CytobandPosition.compare({arm: 'p'}, {arm: null});
        }).to.throw(TypeError);
    });
    it('allows the major_band to be null if the arms are not equal', () => {
        expect(CytobandPosition.compare({arm: 'p'}, {arm: 'q'})).to.equal(-1);
    });
    it('allows the minor_band to be null if the major_band is not equal', () => {
        expect(CytobandPosition.compare({arm: 'p', major_band: 12}, {arm: 'p', major_band: 13})).to.equal(-1);
    });
    it('errors if the major_band is null and the arms are equal', () => {
        expect(() => {
            CytobandPosition.compare({arm: 'p'}, {arm: 'p'});
        }).to.throw(TypeError);
    });
    it('errors if the minor_band is null and the major_band is equal', () => {
        expect(() => {
            CytobandPosition.compare({arm: 'p', major_band: 12}, {arm: 'p', major_band: 12});
        }).to.throw(TypeError);
    });
    it('p < q', () => {
        expect(CytobandPosition.compare({arm: 'p'}, {arm: 'q'})).to.equal(-1);
    });
    it('p1 < p2', () => {
        expect(CytobandPosition.compare({arm: 'p', major_band: 1}, {arm: 'p', major_band: 2})).to.equal(-1);
    });
    it('p11.1 < p11.2', () => {
        expect(CytobandPosition.compare(
            {arm: 'p', major_band: 11, minor_band: 1}, 
            {arm: 'p', major_band: 11, minor_band: 2}
        )).to.equal(-1);
    });
    it('p34.4 < p35.1', () => {
        expect(CytobandPosition.compare(
            {arm: 'p', major_band: 34, minor_band: 4}, 
            {arm: 'p', major_band: 35, minor_band: 1}
        )).to.equal(-1);
    });
});
