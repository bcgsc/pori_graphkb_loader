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


const _positionString = (breakpoint) => {
    switch(breakpoint['@class']) {
        case PREFIX_CLASS.c: {
            if (breakpoint.offset) {
                return `${breakpoint.pos}${breakpoint.offset > 0 ? '+' : ''}${breakpoint.offset}`;
            }
            return `${breakpoint.pos}`;
        }
        case PREFIX_CLASS.y: {
            if (breakpoint.minorBand) {
                return `${breakpoint.arm}${breakpoint.majorBand || '?'}.${breakpoint.minorBand}`;
            } else if (breakpoint.majorBand) {
                return `${breakpoint.arm}${breakpoint.majorBand || '?'}`;
            } else {
                return breakpoint.arm;
            }
        }
        case PREFIX_CLASS.p: {
            return `${breakpoint.refAA || '?'}${breakpoint.pos || '?'}`;
        }
        default: {
            return `${breakpoint.pos}`;
        }
    };
}


const breakRepr = (prefix, break1, break2) => {
    if (break2) {  // range
        return `${prefix}.(${_positionString(break1)}_${_positionString(break2)})`;
    }
    return `${prefix}.${_positionString(break1)}`;
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
            result.pos = m[1] ? parseInt(m[1]) : 1;
            result.offset = m[2] === undefined ? 0 : parseInt(m[2]);
            return result;
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

module.exports = {parsePosition, breakRepr};
