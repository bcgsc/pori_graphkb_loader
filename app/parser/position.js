

/** @module app/parser/position */
const {ParsingError} = require('./../repo/error');

const PREFIX_CLASS = {
    g: 'GenomicPosition',
    i: 'IntronicPosition',
    e: 'ExonicPosition',
    p: 'ProteinPosition',
    y: 'CytobandPosition',
    c: 'CdsPosition'
};


const CDS_PATT = /(\d+)?([-+]\d+)?/;
const PROTEIN_PATT = /([A-Za-z?*])?(\d+|\?)/;
const CYTOBAND_PATT = /[pq]((\d+|\?)(\.(\d+|\?))?)?/;


const positionString = (inputBreakpoint) => {
    const breakpoint = Object.assign({}, inputBreakpoint);
    if (breakpoint.pos === undefined || breakpoint.pos === null) {
        breakpoint.pos = '?';
    }
    switch (breakpoint['@class']) {
        case PREFIX_CLASS.c: {
            if (breakpoint.offset) {
                return `${breakpoint.pos}${breakpoint.offset > 0
                    ? '+'
                    : ''}${breakpoint.offset}`;
            }
            return `${breakpoint.pos}`;
        }
        case PREFIX_CLASS.y: {
            if (breakpoint.minorBand) {
                return `${breakpoint.arm}${breakpoint.majorBand || '?'}.${breakpoint.minorBand}`;
            } if (breakpoint.majorBand) {
                return `${breakpoint.arm}${breakpoint.majorBand || '?'}`;
            }
            return breakpoint.arm;
        }
        case PREFIX_CLASS.p: {
            return `${breakpoint.refAA || '?'}${breakpoint.pos || '?'}`;
        }
        default: {
            return `${breakpoint.pos}`;
        }
    }
};

/**
 * Convert parsed breakpoints into a string representing the breakpoint range
 *
 * @param {string} prefix the prefix denoting the coordinate system being used
 * @param {string} start the start of the breakpoint range
 * @param {string} [end=null] the end of the breakpoint range (if the breakpoint is a range)
 *
 * @example
 * > break1Repr('g', {pos: 1}, {pos: 10});
 * 'g.(1_10)'
 *
 * @example
 * > break1Repr('g', {pos: 1})
 * 'g.1'
 */
const breakRepr = (prefix, start, end = null) => {
    if (end) { // range
        return `${prefix}.(${positionString(start)}_${positionString(end)})`;
    }
    return `${prefix}.${positionString(start)}`;
};


/**
 * Given a prefix and string, parse a position
 *
 * @param {string} prefix the prefix type which defines the type of position to be parsed
 * @param {string} string the string the position information is being parsed from
 *
 * @example
 * > parsePosition('c', '100+2');
 * {'@class': 'CdsPosition', pos: 100, offset: 2}
 *
 * @returns {object} the parsed position
 */
const parsePosition = (prefix, string) => {
    const result = {'@class': PREFIX_CLASS[prefix]};
    switch (prefix) {
        case 'i':
        case 'e': {
            result['@class'] = PREFIX_CLASS[prefix];
            if (string !== '?') {
                if (/^\d+$/.exec(string.toString().trim())) {
                    result.pos = parseInt(string, 10);
                } else {
                    throw new ParsingError(`expected integer but found: ${string}`);
                }
            } else {
                result.pos = null;
            }
            return result;
        }
        case 'g': {
            if (string !== '?') {
                if (!/^\d+$/.exec(string.toString().trim())) {
                    throw new ParsingError(`expected integer but found: ${string}`);
                }
                result.pos = parseInt(string, 10);
            } else {
                result.pos = null;
            }
            return result;
        }
        case 'c': {
            const m = new RegExp(`^${CDS_PATT.source}$`).exec(string);
            if (m === null || (!m[1] && !m[2])) {
                throw new ParsingError(`input '${string}' did not match the expected pattern for 'c' prefixed positions`);
            }
            result.pos = m[1]
                ? parseInt(m[1], 10)
                : 1;
            result.offset = m[2] === undefined
                ? 0
                : parseInt(m[2], 10);
            return result;
        }
        case 'p': {
            const m = new RegExp(`^${PROTEIN_PATT.source}$`).exec(string);
            if (m === null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'p' prefixed positions`);
            }
            if (m[2] !== '?') {
                result.pos = parseInt(m[2], 10);
            } else {
                result.pos = null;
            }
            if (m[1] !== undefined && m[1] !== '?') {
                [, result.refAA] = m;
            }
            return result;
        }
        case 'y': {
            const m = new RegExp(`^${CYTOBAND_PATT.source}$`).exec(string);
            if (m == null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'y' prefixed positions`);
            }
            [result.arm] = string;
            if (m[2] !== undefined && m[2] !== '?') {
                result.majorBand = parseInt(m[2], 10);
            }
            if (m[4] !== undefined && m[4] !== '?') {
                result.minorBand = parseInt(m[4], 10);
            }
            return result;
        }
        default: {
            throw new ParsingError({message: `Prefix not recognized: ${prefix}`, input: string});
        }
    }
};

module.exports = {
    parsePosition, breakRepr, CYTOBAND_PATT, CDS_PATT, PROTEIN_PATT
};
