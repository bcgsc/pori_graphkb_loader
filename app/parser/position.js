'use strict';
const {ParsingError} = require('./../repo/error');


const parsePosition = (prefix, string) => {
    switch(prefix) {
        case 'e':
        case 'g': {
            const pos = parseInt(string);
            if (isNaN(pos)) {
                throw new ParsingError(`expected integer but found: ${string}`);
            }
            return {pos, prefix};
        }
        case 'c': {
            const m = /^(\d+)([-\+]\d+)?$/.exec(string);
            if (m === null) {
                throw new ParsingError(`input '${string}' did not match the expected pattern for 'c' prefixed positions`);
            }
            return {
                pos: parseInt(m[1]),
                offset: m[2] === undefined ? 0 : parseInt(m[2]),
                prefix
            };
        }
        case 'p': {
            const m = /^([A-Z\?\*])?(\d+)$/.exec(string);
            if (m === null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'p' prefixed positions`);
            }
            return {
                pos: parseInt(m[2]),
                ref_aa: m[1] === undefined ? '?' : m[1],
                prefix
            };
        }
        case 'y': {
            const m = /^([pq])((\d+)(\.(\d+))?)?$/.exec(string);
            if (m == null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'y' prefixed positions`);
            }
            return {
                arm: m[1],
                major_band: m[3] === undefined ? null : parseInt(m[3]),
                minor_band: m[5] === undefined ? null : parseInt(m[5]),
                prefix
            };
        }
        default: {
            throw new ParsingError(`Prefix not recognized: ${prefix} from ${string}`);
        }
    }
};

module.exports = {parsePosition};
