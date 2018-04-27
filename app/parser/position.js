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
    switch(prefix) {
        case 'e': {
            const match = /^intron\s*(\d+)\s*$/.exec(string);
            if (match) {
                return {pos: parseInt(match[1]), '@class': PREFIX_CLASS.i}
            }
        }
        case 'g': {
            const pos = parseInt(string);
            if (isNaN(pos)) {
                throw new ParsingError(`expected integer but found: ${string}`);
            }
            return {pos, '@class': PREFIX_CLASS[prefix]};
        }
        case 'c': {
            const m = /^(\d+)?([-\+]\d+)?$/.exec(string);
            if (m === null) {
                throw new ParsingError(`input '${string}' did not match the expected pattern for 'c' prefixed positions`);
            }
            return {
                pos: m[1] ? parseInt(m[1]) : 1,
                offset: m[2] === undefined ? 0 : parseInt(m[2]),
                '@class': PREFIX_CLASS[prefix]
            };
        }
        case 'p': {
            const m = /^([A-Z\?\*])?(\d+)$/.exec(string);
            if (m === null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'p' prefixed positions`);
            }
            return {
                pos: parseInt(m[2]),
                refAA: m[1] === undefined ? '?' : m[1],
                '@class': PREFIX_CLASS[prefix]
            };
        }
        case 'y': {
            const m = /^([pq])((\d+)(\.(\d+))?)?$/.exec(string);
            if (m == null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'y' prefixed positions`);
            }
            return {
                arm: m[1],
                majorBand: m[3] === undefined ? null : parseInt(m[3]),
                minorBand: m[5] === undefined ? null : parseInt(m[5]),
                '@class': PREFIX_CLASS[prefix]
            };
        }
        default: {
            throw new ParsingError(`Prefix not recognized: ${prefix} from ${string}`);
        }
    }
};

module.exports = {parsePosition};
