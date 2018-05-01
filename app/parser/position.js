'use strict';
const {ParsingError} = require('./../repo/error');

const PREFIX_CLASS = {
    g: 'GenomicPosition',
    i: 'IntronicPosition',
    e: 'ExonicPosition',
    p: 'ProteinPosition',
    y: 'CytobandPosition',
    c: 'CdsPosition'
};


const parsePosition = (prefix, string) => {
    let result = {'@class': PREFIX_CLASS[prefix]};
    switch(prefix) {
        case 'e': {
            const match = /^intron\s*(\d+)\s*$/.exec(string);
            if (match) {
                result['@class'] = PREFIX_CLASS.i;
                if (match[1] !== '?') {
                    result['pos'] = parseInt(match[1]);
                }
                return result;
            }
        }
        case 'g': {
            if (string !== '?') {
                const pos = parseInt(string);
                if (isNaN(pos)) {
                    throw new ParsingError(`expected integer but found: ${string}`);
                }
                result.pos = pos;
            }
            return result;
        }
        case 'c': {
            const m = /^(\d+)?([-\+]\d+)?$/.exec(string);
            if (m === null) {
                throw new ParsingError(`input '${string}' did not match the expected pattern for 'c' prefixed positions`);
            }
            return {
                pos: m[1] ? parseInt(m[1]) : 1,
                offset: m[2] === undefined ? 0 : parseInt(m[2])
            };
        }
        case 'p': {
            const m = /^([A-Z\?\*])?(\d+|\?)$/.exec(string);
            if (m === null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'p' prefixed positions`);
            }
            if (m[2] !== '?') {
                result.pos = parseInt(m[2]);
            }
            if (m[1] !== undefined && m[1] !== '?') {
                result.refAA = m[1];
            }
            return result;
        }
        case 'y': {
            const m = /^([pq])((\d+|\?)(\.(\d+|\?))?)?$/.exec(string);
            if (m == null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'y' prefixed positions`);
            }
            result.arm = m[1];
            if (m[3] !== undefined && m[3] !== '?') {
                result.majorBand = parseInt(m[3]);
            }
            if (m[5] !== undefined && m[5] !== '?') {
                result.minorBand = parseInt(m[5]);
            }
            return result;
        }
        default: {
            throw new ParsingError(`Prefix not recognized: ${prefix} from ${string}`);
        }
    }
};

module.exports = {parsePosition};
