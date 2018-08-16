const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const {parse: variantParser, NOTATION_TO_SUBTYPE} = require('./../../app/parser/variant');
const {ParsingError} = require('./../../app/repo/error');
const request = require('request-promise');
const stringSimilarity = require('string-similarity');
const {
    getRecordBy, addRecord, orderPreferredOntologyTerms, getPubmedArticle
} = require('./util');
const _ = require('lodash');


const SOURCE_NAME = 'bcgsc';
const TYPE_MAPPING = {
    MUT: 'mutation',
    SV: 'structural',
    CNV: 'copy number',
    'ELV-RNA': 'RNA expression',
    'ELV-PROT': 'protein expression'
};
const FEATURE_CACHE = {};
const PUBLICATION_CACHE = {};
const RELEVANCE_MAP = {
    favourable: 'favourable prognosis',
    oncogene: 'oncogenic',
    unfavourable: 'unfavourable prognosis',
    diagnostic: 'favours diagnosis',
    'putative tumour suppressor': 'likely tumour suppressive',
    'tumour suppressor': 'tumour suppressive',
    'putative oncogene': 'likely oncogenic'
};


const uploadChromosomes = async (conn) => {
    const grc = await addRecord('sources', {name: 'GRCh37'}, conn, true);
    for (const chr of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 'X', 'Y']) {
        await addRecord('features', {
            biotype: 'chromosome',
            source: grc['@rid'].toString(),
            sourceId: `${chr}`,
            name: `${chr}`
        }, conn, true);
    }
};


/**
 * Parse CategoryVariants and convert deprecated PositionalVariant syntax.
 * Convert them to the current syntax and return them
 */
const convertDeprecatedSyntax = (string) => {
    string = string.trim();
    const result = {};
    const zygosity = /.*(_(ns|heterozygous|homozygous|na|any)(\s*\(germline\))?)$/.exec(string);
    if (zygosity) {
        if (zygosity[3]) {
            result.germline = true;
        }
        if (zygosity[2] === 'heterozygous' || zygosity[2] === 'homozygous') {
            result.zygosity = zygosity[2];
        }
        string = string.slice(0, string.length - zygosity[1].length).trim();
    }
    let match = null;
    if (string.startsWith('FANN_')) {
        Object.assign(result, {name: string.slice(5), isFeature: true});
    } else if (match = /^SV_e.([^\(]+)\(([^,]+)(,\s*([^\)]+))?\)\(([^,]+),([^\)]+)\)$/.exec(string)) {
        // exon level structural variant
        result.type = 'structural variant';
        const cytobandPattern = /^(1[0-9]|2[0-2]|[1-9]|X|Y)([pq]\d+(\.\d+)?)$/;
        let submatch;
        match = {
            type: match[1],
            reference1: match[2],
            reference2: match[3] ? match[4] : match[2],
            pos1Prefix: 'e',
            pos2Prefix: 'e',
            pos1: match[5],
            pos2: match[6]
        };
        if (match.pos1.includes(':')) {
            match.reference1 = match.pos1.slice(0, match.pos1.indexOf(':'));
            match.pos1 = match.pos1.slice(match.pos1.indexOf(':') + 1);
        }
        if (match.pos2.includes(':')) {
            match.reference2 = match.pos2.slice(0, match.pos2.indexOf(':'));
            match.pos2 = match.pos2.slice(match.pos2.indexOf(':') + 1);
        }
        if (match.pos2 === 'na' && (submatch = cytobandPattern.exec(match.reference2))) {
            match.reference2 = submatch[1];
            match.pos2 = submatch[2];
            match.pos2Prefix = 'y';
        }
        if (match.pos1 === 'na' && (submatch = cytobandPattern.exec(match.reference1))) {
            match.reference1 = submatch[1];
            match.pos1 = submatch[2];
            match.pos1Prefix = 'y';
        }
        if (match.pos1.includes('intron')) {
            match.pos1Prefix = 'i';
            match.pos1 = match.pos1.replace('intron', '').trim();
        }
        if (match.pos2.includes('intron')) {
            match.pos2Prefix = 'i';
            match.pos2 = match.pos2.replace('intron', '').trim();
        }
        result.type = match.type;
        if (match.pos1 === '?' && match.pos2 === '?') {
            if (match.reference1 === '?') {
                result.reference1 = match.reference2;
            } else if (match.reference2 === '?') {
                result.reference1 = match.reference1;
            } else {
                result.reference1 = match.reference1;
                result.reference2 = match.reference2;
            }
        } else {
            result.positional = `(${match.reference1},${match.reference2}):${match.type}(${match.pos1Prefix}.${match.pos1},${match.pos2Prefix}.${match.pos2})`;
        }
    } else if (match = /^(SV|CNV|MUT)_([^_:]+)(_([^_]+))?$/.exec(string)) {
        let type;
        if (match[1] === 'CNV') {
            type = 'copy variant';
        } else if (match[1] === 'SV') {
            type = 'structural variant';
        } else {
            type = 'mutation';
        }
        if (match[3] && !['not specified', 'any'].includes(match[4])) {
            type = match[4];
        }
        Object.assign(result, {type, reference1: match[2]});
    } else if (match = /^ELV-(PROT|RNA)_([^_]+)_([^_]+)$/.exec(string)) {
        const type = match[1] === 'PROT' ? 'protein' : 'RNA';
        Object.assign(result, {reference1: match[2], type: match[3].replace(' ', ` ${type} `)});
    } else if (string.startsWith('MUT_')) {
        string = string.slice(4);
        if (match = /(X\[(\d+|n)\])$/.exec(string)) {
            string = string.slice(0, string.length - match[1].length);
            if (match[2] !== 'n') {
                string = `${string}${match[2]}`;
            }
        }
        if (match = /^([^_]+)_(not specified|any)$/.exec(string)) {
            Object.assign(result, {reference1: match[1], type: 'mutation'});
        } else {
            if (match = /^.+:([^:]+:[^:]+)$/.exec(string)) { // if multiple features are defined, use the most specific
                string = match[1];
            }
            if (match = /(:p.[X\?][n\?](_[X\?][n\?])?(fs|\*|spl|dup))$/.exec(string)) {
                result.reference1 = string.slice(0, string.length - match[1].length);
                if (match[3] === 'spl') {
                    result.type = 'splice-site';
                } else if (match[3] === '*') {
                    result.type = 'truncating';
                } else if (match[3] === 'fs') {
                    result.type = 'frameshift';
                } else if (match[3] === 'dup') {
                    result.type = 'duplication';
                }
            } else if (match = /(:p.[X\?]\*)$/.exec(string)) {
                string = string.slice(0, string.length - match[1].length);
                Object.assign(result, {reference1: string, type: 'truncating'});
            } else if (match = /(:p.[X\?][n\?]fs)$/.exec(string)) {
                string = string.slice(0, string.length - match[1].length);
                Object.assign(result, {reference1: string, type: 'frameshift'});
            } else {
                const [ref, variant] = string.split(':', 2);
                Object.assign(result, {positional: variant, reference1: ref});
            }
        }
    } else if (!string.includes('_')) {
        Object.assign(result, {name: string, isFeature: true});
    } else {
        throw new ParsingError(`unrecognized syntax: ${string}`);
    }
    if (result.reference1) {
        result.reference1 = stripRefSeqVersion(result.reference1.toLowerCase().trim());
    }
    if (result.reference2) {
        result.reference2 = stripRefSeqVersion(result.reference2.toLowerCase().trim());
    }
    return result;
};


const stripRefSeqVersion = (name) => {
    const match = /^(n[mpg]_\d+)\.\d+$/.exec(name);
    return match ? match[1] : name;
};


const getRecordByOr = async (className, where1, where2, conn, sortFunc = (x, y) => 0) => {
    let result;
    try {
        result = await getRecordBy(className, where1, conn, sortFunc);
    } catch (err) {
        result = await getRecordBy(className, where2, conn, sortFunc);
    }
    return result;
};


const upload = async (opt) => {
    const {filename, conn} = opt;
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    console.log('parsing into json');
    const json = parse(content, {
        delimiter: ',', escape: null, quote: '"', comment: '##', columns: true, auto_parse: true
    });
    const featuresByName = {};
    await uploadChromosomes(conn);
    const counts = {error: 0, skip: 0, success: 0};
    const skipped = {};
    const source = await addRecord('sources', {name: 'bc gsc'}, conn, true);
    const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, true);

    for (const record of json) {
        let relevance = record.relevance.replace(/-/g, ' ');
        if (['observed', 'not specified', 'test target', 'not determined', 'inconclusive'].includes(relevance)) {
            counts.skip++;
            continue;
        }
        relevance = relevance.replace('inferred', 'likely');
        if (RELEVANCE_MAP[relevance]) {
            relevance = RELEVANCE_MAP[relevance];
        }
        try {
            relevance = await getRecordBy('vocabulary', {name: relevance}, conn);
        } catch (err) {
            console.log(err.message);
            counts.error++;
            continue;
        }
        record.ref_id = record.ref_id.toString().trim();
        // now get the publication/statement information
        const publications = [];
        if (record.id_type != 'pubmed') {
            const notification = `SKIP ${record.id_type} ${record.ref_id}`;
            if (skipped[notification] === undefined) {
                console.log(notification);
                skipped[notification] = notification;
            }
            counts.skip++;
            continue;
        } else if (!/^\d+([\s;]+\d+)*$/.exec(record.ref_id)) {
            const notification = `SKIP ${record.id_type} ${record.ref_id}`;
            if (skipped[notification] === undefined) {
                console.log(notification);
                skipped[notification] = notification;
            }
            counts.skip++;
            continue;
        }
        record.ref_id = record.ref_id.toString();
        try {
            for (const pmid of Array.from(record.ref_id.split(/[;\s]+/)).filter(x => x !== '')) {
                let publication;
                if (PUBLICATION_CACHE[pmid]) {
                    publication = PUBLICATION_CACHE[pmid];
                } else {
                    try {
                        publication = await getRecordBy('publications', {sourceId: pmid, source: {name: 'pubmed'}}, conn);
                    } catch (err) {
                        publication = await getPubmedArticle(pmid);
                        publication = await addRecord('publications', Object.assign(publication, {
                            source: pubmedSource['@rid']
                        }), conn, true);
                    }
                }
                PUBLICATION_CACHE[pmid] = publication;
                publications.push(publication);
            }
        } catch (err) {
            console.log(err.message);
            counts.error++;
        }
        const impliedby = [];
        for (let event of record.events_expression.split(/[\|&]/)) {
            const absence = /(^\s*!\s*)/.exec(event);
            if (absence) {
                event = event.slice(absence[0].length);
            }
            let parsed;
            try {
                parsed = convertDeprecatedSyntax(event);
            } catch (err) {
                console.log(err.message);
                counts.error++;
                continue;
            }
            const positional = parsed.positional;
            const defaults = {
                zygosity: null,
                germline: null,
                reference2: null
            };
            if (positional) {
                Object.assign(defaults, {
                    untemplatedSeq: null,
                    refSeq: null,
                    break2Repr: null
                });
            }
            if (parsed.isFeature) {
                try {
                    impliedby.push(await getRecordBy('features', {name: parsed.name}, conn, orderPreferredOntologyTerms));
                } catch (err) {
                    console.log(err.message);
                    counts.error++;
                }
                continue;
            } else if (positional) {
                try {
                    parsed = Object.assign(_.omit(parsed, ['positional']), variantParser(positional));
                } catch (err) {
                    console.log(err.message);
                    counts.error++;
                }
            }
            try {
                parsed.type = (await getRecordBy('vocabulary', {name: parsed.type}, conn))['@rid'];
            } catch (err) {
                console.log(err.message);
                console.log(parsed);
                counts.error++;
                continue;
            }
            try {
                parsed.reference1 = (await getRecordByOr('features', {name: parsed.reference1}, {sourceId: parsed.reference1}, conn, orderPreferredOntologyTerms))['@rid'];
                if (parsed.reference2) {
                    parsed.reference2 = (await getRecordByOr('features', {name: parsed.reference2}, {sourceId: parsed.reference2}, conn, orderPreferredOntologyTerms))['@rid'];
                }
            } catch (err) {
                counts.error++;
                continue;
            }
            impliedby.push(await addRecord(
                positional
                    ? 'positionalvariants'
                    : 'categoryvariants',
                parsed, conn, true, Object.assign(defaults, parsed)
            ));
        }
        // figure out what the 'appliesTo' is based on the relevance and all the elements in impliedBy
        // make the actual statement
        const statement = {
            uuid: record.ident, // copy the record ID from IPR to make back tracking easier
            relevance: relevance['@rid'],
            impliedBy: Array.from(impliedby, r => ({target: r['@rid']})),
            supportedBy: Array.from(publications, r => ({target: r['@rid']}))
        };
    }
    console.log(counts);
};


module.exports = {upload, convertDeprecatedSyntax};
