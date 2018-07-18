const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const {parse: variantParser, NOTATION_TO_SUBTYPE} = require('./../../app/parser/variant');
const request = require('request-promise');
const stringSimilarity = require('string-similarity');
const {getRecordBy, addRecord, orderPreferredOntologyTerms} = require('./util');
const {VOCABULARY} = require('./vocab');


const SOURCE_NAME = 'bcgsc';
const TYPE_MAPPING = {
    MUT: 'mutation',
    SV: 'structural',
    CNV: 'copy number',
    'ELV-RNA': 'RNA expression',
    'ELV-PROT': 'protein expression'
};


const addOrGetPubmedArticle = async (opt) => {
    const {conn, source, article} = opt;

    let result;
    try {
        result = await getRecordBy('publications', {sourceId: article.pubmed, source: source['@rid']}, conn);
        return result;
    } catch (err) {}
    // try getting the title from the pubmed api
    opt = {
        method: 'GET',
        uri: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
        qs: {
            id: article.pubmed,
            retmode: 'json',
            db: 'pubmed'
        },
        headers: {Accept: 'application/json'},
        json: true
    }
    try {
        pubmedRecord = await request(opt);
        if (pubmedRecord && pubmedRecord.result && pubmedRecord.result[article.pubmed]) {
            pubmedRecord = pubmedRecord.result[article.pubmed];
            if (article.title && stringSimilarity.compareTwoStrings(article.title, pubmedRecord.title) < 0.8 ) {
                console.error(pubmedRecord.title);
                console.error(article.title);
                console.error(`disimilar titles: ${stringSimilarity.compareTwoStrings(article.title, pubmedRecord.title)}`);
                return;
            }
            //sortpubdate: '1992/06/01 00:00'
            let match = /^(\d\d\d\d)\//.exec(pubmedRecord.sortpubdate);
            if (! match) {
                console.error(pubmedRecord);
                console.error(article);
                console.error(`could not get year from sortpubdate ${pubmedRecord.sortpubdate}`);
                return;
            }
            Object.assign(article, {
                title: pubmedRecord.title,
                journalName: pubmedRecord.fulljournalname,
                year: parseInt(match[1])
            });
            // now post this to the kb
            result = await addRecord('publications', {name: article.title, source: source['@rid'], sourceId: article.pubmed}, conn, true);
            return result;
        }
    } catch (err) {
        console.log(err.error);
        throw err;
    }
    throw new Error(`failed to add or retrieve ${article.pubmed} (${article.title})`);
}


const uploadEvent = async (event, token) => {
    let reference, reference2;
    try {
        reference = await getActiveFeature({name: event.reference}, token);
        event.reference = reference['@rid'];

        if (event.reference2) {
            reference2 = await getActiveFeature({name: event.reference2}, token);
            event.reference2 = reference2['@rid'];
        }
    } catch (err) {
        throw err;
    }
    let opt = {
        method: 'POST',
        uri: `http://localhost:8080/api/${event.value ? 'category' : 'positional'}variants`,
        headers: {
            Authorization: token
        },
        body: event,
        json: true
    };
    const record = await request(opt);
    return record;

}


const uploadChromosomes = async (conn) => {
    const grc = await addRecord('sources', {name: 'GRCh37'}, conn, true);
    for (let chr of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 'X', 'Y']) {
        await addRecord('features', {
            biotype: 'chromosome',
            source: grc['@rid'].toString(),
            sourceId: `${chr}`,
            name: `${chr}`
        }, conn, true);
    }
}


/**
 * Parse CategoryVariants and convert deprecated PositionalVariant syntax
 */
const parseDeprecated = (string) => {
    string = string.trim();
    let result = {
        '@class': 'PositionalVariant',
        string: string
    };
    let zygosity = /.*(_(ns|heterozygous|homozygous|na|any)(\s*\(germline\))?)$/.exec(string);
    if (zygosity) {
        if (zygosity[3]) {
            result.germline = true;
        }
        if (zygosity[2] === 'heterozygous' || zygosity[2] === 'homozygous') {
            result.zygosity = zygosity[2];
        }
        string = string.slice(0, string.length - zygosity[1].length).trim();
        result.string = string;
    }
    let match = null;
    if (string.startsWith('FANN_')) {
        string = string.slice(5);
    }
    if (match = /^SV_e.([^\(]+)\(([^,]+)(,\s*([^\)]+))?\)\(([^,]+),([^\)]+)\)$/.exec(string)) {
        // exon level structural variant
        result.type = 'structural variant';
        let cytobandPattern = /^(1[0-9]|2[0-2]|[1-9]|X|Y)([pq]\d+(\.\d+)?)$/;
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
        if (match.pos1 === '?' && match.pos2 === '?') {
            result.subtype = match.type;
            result.reference1 = match.reference1;
            result.reference2 = match.reference2;
            result['@class'] = 'CategoryVariant';
        }
        string = `(${match.reference1},${match.reference2}):${match.type}(${match.pos1Prefix}.${match.pos1},${match.pos2Prefix}.${match.pos2})`;
    } else if (match = /^(SV|CNV|MUT)_([^_:]+)(_([^_]+))?$/.exec(string)) {
        if (match[1] === 'CNV') {
            result.type = 'copy variant';
        } else if (match[1] === 'SV') {
            result.type = 'structural variant';
        } else {
            result.type = 'mutation';
        }
        result.reference1 = match[2];
        if (match[3]) {
            result.type = match[4];
        }
        result['@class'] = 'CategoryVariant';
    } else if (match = /^ELV-(PROT|RNA)_([^_]+)_([^_]+)$/.exec(string)) {
        result.type = match[1] === 'PROT' ? 'protein expression variant' : 'RNA expression variant';
        result.term = match[3];
        result.reference1 = match[2];
        result['@class'] = 'CategoryVariant';
    } else if (string.startsWith('MUT_')) {
        string = string.slice(4);
        if (match = /(X\[(\d+|n)\])$/.exec(string)) {
            string = string.slice(0, string.length - match[1].length);
            if (match[2] !== 'n') {
                string = `${string}${match[2]}`;
            }
        }
        if (match = /^([^_]+)_(not specified|any)$/.exec(string)) {
            result['@class'] = 'CategoryVariant';
            result.reference1 = match[1];
        }
        if (match = /^.+:([^:]+:[^:]+)$/.exec(string)) {  // if multiple features are defined, use the most specific
            string = match[1];
        }
        if (string.endsWith(':p.Xnspl')) {
            string = string.slice(0, string.length - 8);
            result.reference1 = string;
            result.type = 'splice-site';
            result['@class'] = 'CategoryVariant';
        } else if (string.endsWith(':p.Xn*')) {
            string = string.slice(0, string.length - 6);
            result.reference1 = string;
            result.type = 'truncating';
            result['@class'] = 'CategoryVariant';
        } else if (string.endsWith(':p.Xnfs')) {
            string = string.slice(0, string.length - ':p.Xnfs'.length);
            result.reference1 = string;
            result.type = 'frameshift';
            result['@class'] = 'CategoryVariant';
        } else {
            result.type = 'mutation';
        }
    } else if (! string.includes('_')) {
        result.reference1 = string;
        result['@class'] = 'Feature';
    } else if (string.startsWith('SV_')) {
        string = string.slice(3);
        if (string.startsWith('e.fusion')) {
            result.type = 'fusion';
        }
    } else if (string.startsWith('CNV_')) {
        string = string.slice(4);
        result.type = 'copy variant';
    }
    result.string = string;
    return result;
};


const stripRefSeqVersion = (name) => {
    const match = /^(n[mpg]_\d+)\.\d+$/.exec(name);
    return match ? match[1] : name;
};


const loadVocabulary = async (vocab, conn, source) => {
    const termsByName = {};
    // add the records
    for (let term of vocab) {
        const content = {
            name: term.name,
            sourceId: term.name,
            source: source['@rid']
        };
        const record = await addRecord('vocabulary', content, conn, true);
        termsByName[record.name] = record;
    }
    // now add the edge links
    for (let term of vocab) {
        term.name = term.name.toLowerCase();
        for (let parent of term.subclassof || []) {
            await addRecord('subclassof', {
                out: termsByName[term.name]['@rid'],
                in: termsByName[parent.toLowerCase()]['@rid'],
                source: source['@rid']
            }, conn, true);
        }
        for (let parent of term.oppositeof || []) {
            await addRecord('oppositeof', {
                out: termsByName[term.name]['@rid'],
                in: termsByName[parent.toLowerCase()]['@rid'],
                source: source['@rid']
            }, conn, true);
        }
    }
    return termsByName;
};



const uploadKbFlatFile = async (opt) => {
    const {filename, conn} = opt;
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    console.log('parsing into json');
    const json = parse(content, {delimiter: '\t', escape: null, quote: null, comment: '##', columns: true, auto_parse: true});
    const featuresByName = {};
    await uploadChromosomes(conn);
    let errorCount = 0;
    let skipCount = 0;
    const skipped = {};
    const currentSource = await addRecord('sources', {name: 'bc gsc'}, conn, true);
    const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, true);
    const terms = await loadVocabulary(VOCABULARY, conn, currentSource);

    for (let record of json) {
        const variants = [];
        const features = [];
        for (let event of record.events_expression.split(/[\|&]/)) {
            const absence = /(^\s*!\s*)/.exec(event);
            if (absence) {
                event = event.slice(absence[0].length);
            }
            let parsed = parseDeprecated(event);
            try {
                if (parsed['@class'] === 'PositionalVariant') {
                    Object.assign(parsed, variantParser(parsed.string));
                }
            } catch (err) {
                console.log(err.content.subParserError ? err.content.subParserError.message : err.message);
                errorCount++;
                continue;
            }
            try {
                parsed.reference1 = stripRefSeqVersion(parsed.reference1.toLowerCase());
                if (parsed.reference2) {
                    parsed.reference2 = stripRefSeqVersion(parsed.reference2.toLowerCase());
                }
                if (parsed.reference1 === '?') {
                    delete parsed.reference1;
                }
                if (parsed.reference2 === '?') {
                    delete parsed.reference2;
                }
                if (parsed.reference2 && ! parsed.reference1) {
                    parsed.reference1 = parsed.reference2;
                    delete parsed.reference2;
                }
                if (featuresByName[parsed.reference1] === undefined) {
                    let feature;
                    try {
                        feature = await getRecordBy('features', {name: parsed.reference1}, conn, orderPreferredOntologyTerms);
                    } catch (err) {
                        feature = await getRecordBy('features', {sourceId: parsed.reference1}, conn, orderPreferredOntologyTerms);
                    }
                    featuresByName[parsed.reference1] = feature;
                }
                if (parsed.reference2 && featuresByName[parsed.reference2] === undefined) {
                    let feature;
                    try {
                        feature = await getRecordBy('features', {name: parsed.reference2}, conn, orderPreferredOntologyTerms);
                    } catch (err) {
                        feature = await getRecordBy('features', {sourceId: parsed.reference2}, conn, orderPreferredOntologyTerms);
                    }
                    featuresByName[parsed.reference2] = feature;
                }
            } catch(err) {
                console.log(err.message, parsed.reference1, parsed.reference2);
                errorCount++;
            }
        }
        // now get the publication/statement information
        let evidence;
        if (record.id_type != 'pubmed') {
            let notification = `SKIP ${record.id_type} ${record.id}`;
            if (skipped[notification] === undefined){
                console.log(notification);
                skipped[notification] = notification;
            }
            skipCount++;
            continue;
        }
        record.id = `${record.id}`;
        try {
            for (let pubmed of Array.from(record.id.split(/[;\s]+/)).filter(x => x !== '')) {
                evidence = await addOrGetPubmedArticle({conn, source: pubmedSource, article: {title: record.id_title, pubmed}});
            }
        } catch(err) {
            console.log(err.message);
            errorCount++;
        }
        continue;
        // now try to create the events
        for (let variant of variants) {
            //if (variant.type == 'mutation' || variant.type == 'structural') {
            //    continue;
            //}
            try {
                const varRec = await uploadEvent(variant, token);
                process.stdout.write('.');
            } catch (err) {
                if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
                    process.stdout.write('*');
                } else {
                    console.error(err.message);
                    console.error(variant);
                }
            }
        }
    }
    console.log('total entries', json.length);
    console.log('parsing errorCount', errorCount);
    console.log('skipped', skipCount);
}



module.exports = {uploadKbFlatFile};
