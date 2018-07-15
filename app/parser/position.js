'use strict';
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


const CDS_PATT = /(\d+)([-\+]\d+)?/;
const PROTEIN_PATT = /([A-Za-z\?\*])?(\d+|\?)/;
const CYTOBAND_PATT = /[pq]((\d+|\?)(\.(\d+|\?))?)?/;


const _positionString = (breakpoint) => {
    breakpoint = Object.assign({}, breakpoint);
    if (breakpoint.pos === undefined) {
        breakpoint.pos = '?';
    }
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
const breakRepr = (prefix, start, end=null) => {
    if (end) {  // range
        return `${prefix}.(${_positionString(start)}_${_positionString(end)})`;
    }
    return `${prefix}.${_positionString(start)}`;
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
                if (! /^\d+$/.exec(string)) {
                    throw new ParsingError(`expected integer but found: ${string}`);
                }
                result.pos = parseInt(string);
            }
            return result;
        }
        case 'c': {
            const m = new RegExp(`^${CDS_PATT.source}$`).exec(string);
            if (m === null) {
                throw new ParsingError(`input '${string}' did not match the expected pattern for 'c' prefixed positions`);
            }
            result.pos = m[1] ? parseInt(m[1]) : 1;
            result.offset = m[2] === undefined ? 0 : parseInt(m[2]);
            return result;
        }
        case 'p': {
            const m = new RegExp(`^${PROTEIN_PATT.source}$`).exec(string);
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
            const m = new RegExp(`^${CYTOBAND_PATT.source}$`).exec(string);
            if (m == null) {
                throw new ParsingError(`input string '${string}' did not match the expected pattern for 'y' prefixed positions`);
            }
            result.arm = string[0];
            if (m[2] !== undefined && m[2] !== '?') {
                result.majorBand = parseInt(m[2]);
            }
            if (m[4] !== undefined && m[4] !== '?') {
                result.minorBand = parseInt(m[4]);
            }
            return result;
        }
        default: {
            throw new ParsingError({message: `Prefix not recognized: ${prefix}`, input: string});
        }
    }
};

module.exports = {parsePosition, breakRepr, CYTOBAND_PATT, CDS_PATT, PROTEIN_PATT};
