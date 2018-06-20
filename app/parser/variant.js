'use strict';
const nRegex = require('named-js-regexp');
const {ParsingError} = require('./../repo/error');
const {parsePosition, breakRepr} = require('./position');

const EVENT_SUBTYPE = {
    INS: 'insertion',
    DEL: 'deletion',
    SUB: 'substitution',
    INV: 'inversion',
    INDEL: 'indel',
    GAIN: 'gain',
    LOSS: 'loss',
    TRANS: 'translocation',
    ITRANS: 'inverted translocation',
    EXT: 'extension',
    FS: 'frameshift',
    FUSION: 'fusion',
    DUP: 'duplication',
    ME: 'methylation',
    AC: 'acetylation',
    UB: 'ubiquitination',
    SPL: 'splice-site'
};


const NOTATION_TO_SUBTYPE = new Map([
    ['ub', EVENT_SUBTYPE.UB],
    ['me', EVENT_SUBTYPE.ME],
    ['ac', EVENT_SUBTYPE.AC],
    ['fs', EVENT_SUBTYPE.FS],
    ['>', EVENT_SUBTYPE.SUB],
    ['delins', EVENT_SUBTYPE.INDEL],
    ['inv', EVENT_SUBTYPE.INV],
    ['ext', EVENT_SUBTYPE.EXT],
    ['del', EVENT_SUBTYPE.DEL],
    ['dup', EVENT_SUBTYPE.DUP],
    ['ins', EVENT_SUBTYPE.INS],
    ['copygain', EVENT_SUBTYPE.GAIN],
    ['copyloss', EVENT_SUBTYPE.LOSS],
    ['t', EVENT_SUBTYPE.TRANS],
    ['spl', EVENT_SUBTYPE.SPL],
    ['fusion', EVENT_SUBTYPE.FUSION]
]);


const getPrefix = (string) => {
    const prefix = string[0];
    const expectedPrefix = ['g', 'c', 'e', 'y', 'p'];
    if (! expectedPrefix.includes(prefix)) {
        throw new ParsingError(`'${prefix}' is not an accepted prefix. Expected: ${expectedPrefix}`);
    }
    if (string[1] != '.') {
        throw new ParsingError(`Missing '.' separator after prefix: ${string}`);
    }
    return prefix;
};


const parse = (string) => {
    if (string.length < 3) {
        throw new ParsingError(`Too short. Must be a minimum of three characters: ${string}`);
    }

    const prefix = getPrefix(string);
    string = string.slice(prefix.length + 1);
    const p = '([A-Z0-9\\*\\?\\+\\-]*[0-9\\?]|[pq][0-9\\.\?]*)';
    let regex = nRegex(
        `^(?<break1>${p}|(\\(${p}_${p}\\)))`
        + `(_(?<break2>${p}|(\\(${p}_${p}\\))))?`
        + '(?<tail>[^_\\(\\)]+)$'
    );
    let match = regex.exec(string);
    if (match === null) {
        throw new ParsingError(`Input string did not match the expected pattern: ${string}`);
    }

    let m;
    const result = {};
    if (m = /\(([^_]+)_([^_]+)\)/.exec(match.group('break1'))) {
        result.break1Start = parsePosition(prefix, m[1]);
        result.break1End =  parsePosition(prefix, m[2]);
    } else {
        result.break1Start = parsePosition(prefix, match.group('break1'));
    }
    if (match.group('break2') !== undefined) {
        if (m = /\(([^_]+)_([^_]+)\)/.exec(match.group('break2'))) {
            result.break2Start = parsePosition(prefix, m[1]);
            result.break2End = parsePosition(prefix, m[2]);
        } else {
            result.break2Start = parsePosition(prefix, match.group('break2'));
        }
    }

    const tail = match.group('tail');
    result.break1Repr = breakRepr(prefix, result.break1Start, result.break1End);
    if (result.break2Start) {
        result.break2Repr = breakRepr(prefix, result.break2Start, result.break2End);
    }

    if (match = /^del([A-Z\?\*]+)?ins([A-Z\?\*]+|\d+)?$/.exec(tail)) {  // indel
        result.type = 'delins';
        if (match[1]) {
            result.refSeq = match[1];
        }
        if (parseInt(match[2])) {
            result.untemplatedSeqSize = parseInt(match[2]);
        } else if (match[2] && match[2] !== '?') {
            result.untemplatedSeq = match[2];
        }
    } else if (match = /^(del|inv|ins|dup)([A-Z\?\*]+|\d+)?$/.exec(tail)) {  // deletion
        result.type = match[1];
        if (parseInt(match[2])) {
            if (result.type === 'ins' || result.type === 'dup') {
                result.untemplatedSeqSize = parseInt(match[2]);
            }
        } else if (match[2] && match[2] !== '?') {
            if (result.type === 'dup') {
                result.untemplatedSeq = match[2];
                result.refSeq = match[2];
            } else if (result.type === 'ins') {
                result.untemplatedSeq = match[2];
            } else {
                result.refSeq = match[2];
            }
        }
    } else if (match = /^[A-Z\?\*]$/.exec(tail)) {
        if (prefix !== 'p') {
            throw new ParsingError('only protein notation does not use ">" for a substitution');
        }
        result.type = '>';
        result.untemplatedSeq = tail;
    } else if (match = /^([A-Z\?])>([A-Z\?])$/.exec(tail)) {
        if (prefix === 'p') {
            throw new ParsingError('protein notation does not use ">" for a substitution');
        } else if (prefix === 'e') {
            throw new ParsingError('Cannot defined substitutions at the exon coordinate level');
        }
        result.type = '>';
        result.refSeq = match[1];
        result.untemplatedSeq = match[2];
    } else if (match = /^([A-Z\?])?fs(\*(\d+))?$/.exec(tail)) {
        if (prefix !== 'p') {
            throw new ParsingError('only protein notation can notate frameshift variants');
        }
        result.type = 'fs';
        if (match[1] !== undefined && match[1] !== '?') {
            result.untemplatedSeq = match[1];
        }
        if (match[3] !== undefined) {
            result.truncation = parseInt(match[3]);
        }
    } else if (tail == 'spl'){
        result.type = 'spl';
    } else {
        throw new ParsingError(`Did not recognize type: ${tail}`);
    }
    if (! NOTATION_TO_SUBTYPE.has(result.type)) {
        throw new ParsingError(`unsupported event type: ${result.type}`);
    }
    result.type = NOTATION_TO_SUBTYPE.get(result.type);
    if (result.untemplatedSeq && result.untemplatedSeqSize === undefined) {
        result.untemplatedSeqSize = result.untemplatedSeq.length;
    }
    // check for innapropriate types
    if (prefix === 'y') {
        if (result.refSeq || result.untemplatedSeq) {
            throw new ParsingError('cannot define sequence elements at the cytoband level');
        } else if (! [EVENT_SUBTYPE.DUP, EVENT_SUBTYPE.DEL, EVENT_SUBTYPE.GAIN, EVENT_SUBTYPE.LOSS, EVENT_SUBTYPE.INV].includes(result.type)) {
            throw new ParsingError({
                message: 'Invalid type for cytoband level event notation',
                parsed: result
            });
        }
    } else if (prefix === 'e') {
        if (result.refSeq || result.untemplatedSeq) {
            throw new ParsingError('cannot define sequence elements at the exon level');
        } else if (! [EVENT_SUBTYPE.DUP, EVENT_SUBTYPE.DEL].includes(result.type)) {
            throw new ParsingError({
                message: 'only duplication and deletion events can be declared at the exon level',
                parsed: result
            });
        }
    }
    // special case refSeq protein substitutions
    if (prefix === 'p' && ! result.break1End && ! result.break2Start && ! result.break2End && result.break1Start.refAA) {
        result.refSeq = result.break1Start.refAA;
    }
    return result;
};


module.exports = {parse, NOTATION_TO_SUBTYPE, EVENT_SUBTYPE};
