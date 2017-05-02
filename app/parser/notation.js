"use strict";
const nRegex = require("named-js-regexp");
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
                throw new ParsingError(`failed to match expected pattern: ${string}`);
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
                throw new ParsingError(`failed to match expected pattern: ${string}`);
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
                throw new ParsingError(`failed to match expected pattern: ${string}`);
            }
            return {
                arm: m[1],
                major_band: m[3] === undefined ? undefined : parseInt(m[3]),
                minor_band: m[5] === undefined ? undefined : parseInt(m[5]),
                prefix
            };
        }
        default: {
            throw new ParsingError(`Prefix not recognized: ${prefix} from ${string}`);
            break;
        }
    }
}

const parseContinuous  = (prefix, string) => {
    const p = '([A-Z0-9\\*\\?\\+\\-]*[0-9\\?])'
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
    switch(prefix) {
        case 'p': {
            validTypes.push('fs');
        }
        case 'g':
        case 'c': {
            Array.prototype.push.apply(validTypes, ['ins', '>']);
        }
        case 'y': {
            validTypes.push('inv');
        }
        case 'e': {
            Array.prototype.push.apply(validTypes, ['del', 'dup']);
            break;
        }
        default: {
            throw new ParsingError(`invalid type '${result.type} for the given prefix notation '${prefix}'`);
        }
    }
    return result;
}


const parse = (string) => {
    if (string.length < 3) {
        throw new AttributeError(`Too short. Must be a minimum of three characters: ${string}`);
    }
    const prefix = string[0];
    if (string[1] != '.') {
        throw new ParsingError(`Missing '.' separator after prefix: ${string}`);
    }
    string = string.slice(2);
    try {
        return parseContinuous(prefix, string);
    } catch(ParsingError) {
    }

}

module.exports = {parse, parsePosition, parseContinuous};
