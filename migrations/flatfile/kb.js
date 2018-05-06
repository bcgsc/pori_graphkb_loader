const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const {parse: variantParser, NOTATION_TO_SUBTYPE} = require('./../../app/parser/variant');
const request = require('request-promise');
const stringSimilarity = require('string-similarity');
const {getActiveFeature} = require('./hgnc');


const TYPE_MAPPING = {
    MUT: 'mutation',
    SV: 'structural',
    CNV: 'copy number',
    'ELV-RNA': 'RNA expression',
    'ELV-PROT': 'protein expression'
}


const eventParser = (eventString) => {
    const inputString = eventString.slice(0);
    eventString = eventString.trim();
    for (let pair of [
        ['copyloss', 'del'],
        ['copygain', 'dup'],
        ['X[n]', '']
    ]) {
        eventString = eventString.replace(pair[0], pair[1]);
    }
    let match = /X\[(\d+)\]/.exec(eventString);
    if (match) {
        eventString = eventString.replace(match[0], match[1]);
    }
    match = /^(MUT|SV|SNV|ELV-RNA|ELV-PROT|CNV)_/.exec(eventString);
    const result = [{}];
    if (match) {
        result[0].type = TYPE_MAPPING[match[1]];
        if (result[0].type === undefined) {
            throw new Error(`bad type: ${match[1]}`);
        }
        eventString = eventString.slice(match[0].length);
    } 
    if (eventString.length == 0) {
        return result;
    }
    // check for zygosity and germline status
    if (eventString.endsWith('(germline)')) {
        result[0].germline = true;
        eventString = eventString.slice(0, eventString.length - '(germline)'.length).trim();
    }
    match = /_(heterozygous|homozygous|hom|het|not specified|any|ns|na)\s*$/.exec(eventString);
    if (match) {
        if (match[1] == 'het' || match[1] == 'heterozygous') {
            result[0].zygosity = 'heterozygous';
        } else if (match[1] == 'hom' || match[1] == 'homozygous') {
            result[0].zygosity = 'homozygous';
        }
        eventString = eventString.slice(0, eventString.length - match[0].length);
    }
    // must now begin with a feature name if it is not breakpoint notation
    if (/^((N[MPC]_)?[^_:\(\)]+)($|_|:)/i.exec(eventString)) {
        let split = eventString.split(':');
        if (! eventString.includes(':')) {
            split = eventString.split('_')
        }
        result[0].reference = split[0];
        for (let feat of split.slice(1, split.length - 1)) {
            result.push(Object.assign({}, result[0], {reference: feat}));
        }
        eventString = split.length > 1 ? split[split.length - 1] : '';
        if (eventString.length == 0) {
            return result;
        }
        
        let variant, value, subtype, repr;
        try {
            repr = eventString.slice(0);
            variant = variantParser(repr);
            subtype = variant.type;
            delete variant.type;
        } catch (err) {
            if (/^[\w\s]+$/.exec(eventString)) {
                value = eventString;
            } else if ('p.Xnspl' === eventString || 'p.??spl' == eventString) {
                value = 'splice variant';
            } else if ('p.??*' === eventString || 'p.Xn*' === eventString) {
                value = 'truncating';
            } else if ('p.Xnfs' == eventString || 'p.??fs' == eventString) {
                value = 'frameshift';
            } else {
                throw err;
            }
        }
        for (let rec of result) {
            if (subtype) {
                rec.subtype = subtype;
            } else if (! value) {
                console.log('did not find a subtype for', inputString, subtype);
            }
            if (repr && variant) {
                rec.break1Repr = repr;
            }
            if (variant) {
                Object.assign(rec, variant);
            } else {
                rec.value = value;
            }
        }
    } else {  // must be breakpoint notation
        match = /^([a-z])\.([^\(]+)\(([^,]+)(,([^\)]+))?\)\(([^,]+),([^\)]+)\)/.exec(eventString);
        if (match) {
            let [prefix, subtype, reference, _, reference2, break1, break2] = match.slice(1);
            let altRef1, altRef2;
            result[0].reference = reference;
            result[0].reference2 = reference2 || reference;

            if (break1.includes(':') && break2.includes(':')){  // multi-feature variant
                [altRef1, break1] = break1.split(':');
                [altRef2, break2] = break2.split(':');
                result.push(Object.assign({}, result[0], {reference: altRef1, reference2: altRef2}));
            } else if (break1.includes(':')) {
                [altRef1, break1] = break1.split(':');
                result.push(Object.assign({}, result[0], {reference: altRef1}));
            } else if (break2.includes(':')) {
                [altRef2, break2] = break2.split(':');
                result.push(Object.assign({}, result[0], {reference2: altRef2}));
            }
            let pos = {};
            try {
                pos = variantParser(`${subtype}(${prefix}.${break1},${prefix}.${break2})`);
                pos.subtype = pos.type;
                delete pos.type;
            } catch (err) {
                if (break1 !== '?' || break2 !== '?') {
                    throw err;
                }
            }
            for (let parsedRecord of result) {
                Object.assign(parsedRecord, pos);
            }
        } else {
            throw new Error(`${eventString}, ${inputString}`);
        }
    }
    return result;
}

const addOrGetArticle = async (article, token) => {
    let opt = {
        method: 'GET',
        uri: `http://localhost:8080/api/publications`,
        headers: {
            Authorization: token
        },
        qs: {pubmed: article.pubmed, deletedAt: null},
        json: true
    };

    try {
        let rec = await request(opt);
        if (rec.length == 1) {
            return rec[0];
        } 
    } catch (err) {
        console.log(err.error);
        throw err;
    }
    // try getting the title from the pubmed api
    opt = {
        method: 'GET',
        uri: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
        qs: {
            id: article.pubmed,
            retmode: 'json',
            db: 'pubmed'
        },
        json: true
    }
    try {
        rec = await request(opt);
        rec = rec.result[article.pubmed];
        if (rec) {
            if (article.title && stringSimilarity.compareTwoStrings(article.title, rec.title) < 0.8 ) {
                console.error(rec.title);
                console.error(article.title);
                console.error(`disimilar titles: ${stringSimilarity.compareTwoStrings(article.title, rec.title)}`);
                return;
            }
            //sortpubdate: '1992/06/01 00:00'
            let match = /^(\d\d\d\d)\//.exec(rec.sortpubdate);
            if (! match) {
                console.error(rec);
                console.error(article);
                console.error(`could not get year from sortpubdate ${rec.sortpubdate}`);
                return;
            }
            for (let altid of rec.articleids) {
                // { idtype: 'pmc', idtypen: 8, value: 'PMC1682556' }
                if (altid.idtype == 'pmc') {
                    article.pmcid = altid.value;
                    break;
                }
            }
            Object.assign(article, {
                title: rec.title,
                journalName: rec.fulljournalname,
                year: parseInt(match[1])
            })
            // now post this to the kb
            opt = {
                method: 'POST',
                uri: `http://localhost:8080/api/publications`,
                headers: {
                    Authorization: token
                },
                body: article,
                json: true
            }
            rec = await request(opt);
            process.stdout.write('.');
            return rec;
        } 
    } catch (err) {
        console.log(err.error);
        throw err;
    }
    throw new Error(`failed ${article}`);
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


const uploadChromosomes = async (token) => {
    for (let chr of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 'X', 'Y', 'MT']) {
        const opt = {
            method: 'POST',
            uri: 'http://localhost:8080/api/independantfeatures',
            headers: {Authorization: token},
            body: {
                source: 'Genome Reference Consortium',
                name: `${chr}`,
                biotype: 'chromosome'
            },
            json: true
        }
        try {
            const record = await request(opt);
        } catch (err) {
            if (err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
                process.stdout.write('*');
            } else {
                console.error(err.message);
                console.error(opt.body);
                throw err;
            }
        }
    }
}


const uploadKbFlatFile = async (filepath, token) => {
    await uploadChromosomes(token);
    console.log(`loading: ${filepath}`);
    const content = fs.readFileSync(filepath, 'utf8');
    console.log('parsing into json');
    const json = parse(content, {delimiter: '\t', escape: null, quote: null, comment: '##', columns: true, auto_parse: true});
    let errorCount = 0;
    for (let record of json) {
        const variants = [];
        const features = [];
        for (let event of record.events_expression.split(/[\|&]/)) {
            const absence = /(^\s*!\s*)/.exec(event);
            if (absence) {
                event = event.slice(absence[0].length);
            }
            try {
                for (let parsed of eventParser(event)) {
                    if (parsed.reference && Object.keys(parsed).length === 1) {
                        features.push(parsed.reference);
                    } else {
                        variants.push(parsed);
                    }
                }
            } catch(err) {
                console.error(err, event);
                errorCount++;
            }
        }
        
        if (record.id_type === 'pubmed') {
            let evidence;
            try {
                evidence = await addOrGetArticle({title: record.id_title, pubmed: record.id}, token);
            } catch(err) {
                console.log(err);
            }
        }
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
    console.log('parsing errorCount', errorCount);

}



module.exports = {uploadKbFlatFile};
