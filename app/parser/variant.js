"use strict";
const nRegex = require("named-js-regexp");
const {ParsingError} = require('./../repo/error');
const {PositionalEvent, EVENT_SUBTYPE, NOTATION_TO_SUBTYPE} = require('./../repo/event');
const {parsePosition} = require('./position');
const {parseFeature} = require('./feature');


const parseContinuous  = (prefix, string) => {
    const p = '([A-Z0-9\\*\\?\\+\\-]*[0-9\\?]|[pq][0-9\\.\?]*)'
    let regex = nRegex(
        `^(?<break1>${p}|(\\(${p}_${p}\\)))`
        + `(_(?<break2>${p}|(\\(${p}_${p}\\))))?`
        + '(?<tail>[^_\\(\\)]+)$'
    );
    let match = regex.exec(string);
    if (match === null) {
        throw new ParsingError(`Input string did not match the expected pattern: ${string}`);
    }
    const result = {break1: null, break2: null, prefix};
    let m;
    if (m = /\(([^_]+)_([^_]+)\)/.exec(match.group('break1'))) {
        result.break1 = {start: parsePosition(prefix, m[1]), end: parsePosition(prefix, m[2])};
    } else {
        result.break1 = parsePosition(prefix, match.group('break1'));
    }
    if (match.group('break2') === undefined) {
        result.break2 = undefined;
    } else if (m = /\(([^_]+)_([^_]+)\)/.exec(match.group('break2'))) {
        result.break2 = {start: parsePosition(prefix, m[1]), end: parsePosition(prefix, m[2])};
    } else {
        result.break2 = parsePosition(prefix, match.group('break2'));
    }

    const tail = match.group('tail');
    if (match = /^del([A-Z\?\*]+)?ins([A-Z\?\*]+)?$/.exec(tail)) {  // indel
        result.type = 'delins';
        result.reference_seq = match[1];
        result.untemplated_seq = match[2];
    } else if (match = /^(del|inv|ins|dup)([A-Z\?\*]+)?$/.exec(tail)) {  // deletion
        result.type = match[1];
        result.reference_seq = match[2];
    } else if (match = /^[A-Z\?\*]$/.exec(tail)) {
        if (prefix !== 'p') {
            throw new ParsingError('only protein notation does not use ">" for a substitution');
        }
        result.type = '>';
        result.untemplated_seq = tail;
    } else if (match = /^([A-Z\?])>([A-Z\?])$/.exec(tail)) {
        if (prefix === 'p') {
            throw new ParsingError('protein notation does not use ">" for a substitution');
        }
        result.type = '>';
        result.reference_seq = match[1];
        result.untemplated_seq = match[2];
    } else if (match = /^([A-Z]?)?fs(\*(\d+))?$/.exec(tail)) {
        if (prefix !== 'p') {
            throw new ParsingError('only protein notation can notate frameshift variants');
        }
        result.type = 'fs';
        result.untemplated_seq = match[1];
        result.truncation = match[3] === undefined ? undefined : parseInt(match[3]);
    } else {
        throw new ParsingError(`Did not recognize type: ${string}`);
    }
    

    let validTypes = [];

    if (! NOTATION_TO_SUBTYPE.has(result.type)) {
        throw new ParsingError(`unsupported event type: ${result.type}`);
    }
    try {
        PositionalEvent.subtypeValidation(result.prefix, NOTATION_TO_SUBTYPE.get(result.type));
    } catch(e) {
        throw new ParsingError(e.message);
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

/**
 * parses discontinuous variants. These variants are expected to be in the form of
 * <type>(<feature 1>,<feature 2>)(<position 1>,<position 2>)
 *
 * @param  {string} prefix denotes the position type
 * @param  {string} string the input string to be parsed
 * @return {[type]}        [description]
 */
const parseDiscontinuous = (prefix, string) => {
    const exp = '<type>(<5\' feature>,<3\' feature>)(<position 1>,<position 2>)';
    const regex = nRegex(
        '(?<type>[^\\)\\(]*)'
        + '\\('
        + '(?<feature1>[^,]+)'
        + '(,(?<feature2>[^,]+))?'
        + '\\)'
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
    const acceptableTypes = ['del', 'inv', 'dup', 't', 'fusion', 'itrans', '?'];
    if (! acceptableTypes.includes(match.type)) {
        throw new ParsingError(`unexpected type: ${match.type}. Expected: ${acceptableTypes}`);
    }
    return {
        type: match.type,
        break1: parsePosition(prefix, match.position1),
        break2: parsePosition(prefix, match.position2),
        feature1: parseFeature(match.feature1),
        feature2: match.feature2 == undefined ? parseFeature(match.feature1) : parseFeature(match.feature2)
    };
};


const parse = (string) => {
    if (string.length < 3) {
        throw new AttributeError(`Too short. Must be a minimum of three characters: ${string}`);
    }
    const prefix = string[0];
    const expectedPrefix = ['g', 'c', 'e', 'y', 'p'];
    if (expectedPrefix.includes(prefix)) {
        throw new ParsingError(`'${prefix}' is not an accepted prefix. Expected: ${expectedPrefix}`);
    }
    if (string[1] != '.') {
        throw new ParsingError(`Missing '.' separator after prefix: ${string}`);
    }
    string = string.slice(2);
    try {
        return parseContinuous(prefix, string);
    } catch(ParsingError) {
        return parseDiscontinuous(prefix, string);
    }
}

module.exports = {parsePosition, parseContinuous, parseDiscontinuous, parseHistoneVariant};
