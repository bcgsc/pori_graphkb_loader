'use strict';
const nRegex = require('named-js-regexp');
const {ParsingError} = require('./../repo/error');
const {parsePosition} = require('./position');

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


const parseContinuous  = (string) => {
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
        result.break1Start = parsePosition(prefix, m[1])
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
    result.break1Repr = `${prefix}.${string.slice(0, string.length - tail.length)}`;

    if (match = /^del([A-Z\?\*]+)?ins([A-Z\?\*]+|\d+)?$/.exec(tail)) {  // indel
        result.type = 'delins';
        result.refSeq = match[1];
        if (parseInt(match[2])) {
            result.untemplatedSeqSize = parseInt(match[2]);
        } else if (match[2]) {
            result.untemplatedSeq = match[2];
            if (match[2] !== '?') {
                result.untemplatedSeqSize = result.untemplatedSeq.length;
            }
        }
    } else if (match = /^(del|inv|ins|dup)([A-Z\?\*]+|\d+)?$/.exec(tail)) {  // deletion
        result.type = match[1];
        if (/^[A-Z]+/.exec(match[2])) {
            result.refSeq = match[2];
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
    
    return result;
};


const parseHistoneVariant = (string) => {
    /**
     * https://epigeneticsandchromatin.biomedcentral.com/articles/10.1186/1756-8935-5-7
     * function to parse histone modification variant notation
     * @type {string} input string
     */
    const r = nRegex(
        '^(?<histone>H[0-9A-Z-]+)'
        + '(\\.(?<subtype>[A-Z0-9]))?'
        + '(?<aa>K|Lys|Arg|R|Ser|S)'
        + '(?<pos>[0-9]+)'
        + '(?<modification>me|ac|ub)'
        + '(?<count>[1-9][0-9]*|\\?)?$'
    );
    const match = r.exec(string);

    if (match === null) {
        throw new ParsingError(`input string did not match expected pattern: ${string}`);
    }
    const count = parseInt(match.group('count'));

    return {
        histone: match.group('histone'),
        subtype: match.group('subtype'),
        protein_position: {
            ref_aa: match.group('aa'),
            pos: parseInt(match.group('pos')),
            prefix: 'p'
        },
        modification: {
            type: match.group('modification'),
            count: count == undefined ? undefined : count
        }
    };
};


const parseDiscontinuous = (string) => {
    const exp = '<type>(<position 1>,<position 2>)';
    const regex = nRegex(
        '(?<type>[^\\)\\(]*)'
        + '\\('
        + '(?<position1>[^,]+)'
        + ','
        + '(?<position2>[^,]+)'
        + '\\)'
    );
    let match = regex.exec(string);
    if (match == null) {
        throw new ParsingError(`input string: ${string} did not match the expected pattern: ${exp}`);
    }
    match = match.groups();
    
    const result = {type: match.type};

    if (match.position1 !== 'na' && match.position1 !== '?') {

        const prefix1 = getPrefix(match.position1);
        const pos1 = match.position1.slice(prefix1.length + 1);

        result.break1Start = parsePosition(prefix1, pos1);
        result.break1Repr = `${prefix1}.${pos1}`;
    }
    
    if (match.position2 && match.position2 !== '?' && match.position2 !== '?') {
        const prefix2 = getPrefix(match.position2);
        const pos2 = match.position2.slice(prefix2.length + 1);
        if (pos2 !== '?' && pos2 !== 'na') {
            result.break2Start = parsePosition(prefix2, pos2);
            result.break2Repr = `${prefix2}.${pos2}`;
        }
    }
    return result;
};


const parse = (string) => {
    if (string.length < 3) {
        throw new ParsingError(`Too short. Must be a minimum of three characters: ${string}`);
    }
    let result;
    try {
        result = parseContinuous(string);
    } catch (err) {
        if (string.includes(')')) {
            result = parseDiscontinuous(string);
        } else {
            throw err;
        }
    }
    if (! NOTATION_TO_SUBTYPE.has(result.type)) {
        throw new ParsingError(`unsupported event type: ${result.type}`);
    }
    result.type = NOTATION_TO_SUBTYPE.get(result.type);
    return result;
};

module.exports = {parsePosition, parse, NOTATION_TO_SUBTYPE};
