const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const _ = require('lodash');
const OrientDB = require('orientjs');
const moment = require('moment');

const {parse: variantParser} = require('@bcgsc/knowledgebase-parser').variant;

const {createOptionsMenu, fileExists} = require('./../cli');


const {
    ParsingError, RecordExistsError, NoRecordFoundError, MultipleRecordsFoundError
} = require('./../../app/repo/error');
const {select, create} = require('./../../app/repo/base');
const {loadSchema} = require('./../../app/repo/schema');


const SOURCE_NAME = 'bcgsc';
const TYPE_MAPPING = {
    MUT: 'mutation',
    SV: 'structural',
    CNV: 'copy number',
    'ELV-RNA': 'RNA expression',
    'ELV-PROT': 'protein expression'
};
const FEATURE_CACHE = {};
const PUBMED_CACHE = {};
const RELEVANCE_MAP = {
    favourable: 'favourable prognosis',
    oncogene: 'oncogenic',
    unfavourable: 'unfavourable prognosis',
    diagnostic: 'favours diagnosis',
    'putative tumour suppressor': 'likely tumour suppressive',
    'tumour suppressor': 'tumour suppressive',
    'putative oncogene': 'likely oncogenic'
};


/**
 * @param {Object} db the orientjs database connection object
 * @param {Object} opt options
 * @param {Object} opt.user the user creating the record
 * @param {Object.<string,ClassModel>} opt.schema mapping of call database models
 * @param {Object} opt.content the conditions used to create the object
 * @param {Object} [opt.where] the conditions used for the selection (defaults to content if not given)
 */
const selectOrCreate = async (db, opt) => {
    const {
        user, schema, model, content
    } = opt;
    const where = opt.where || content;
    let record;
    try {
        record = await create(db, {content, model, user});
    } catch (err) {
        if (!(err instanceof RecordExistsError)) {
            throw err;
        }
        return select(db, {
            where, activeOnly: true, schema
        });
    }
    return [record];
};

/**
 * @param {Object} db the orientjs database connection object
 * @param {Object.<string,ClassModel>} schema the mapping of all database models
 * @param {Object} user the user creating the records
 */
const createGRCh37 = async (db, schema, user) => {
    const source = await selectOrCreate(db, {
        content: {name: 'GRCh', version: '37'}, schema, user, model: schema.Source
    });
    for (const chr of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 'X', 'Y']) {
        await selectOrCreate(db, {
            user,
            schema,
            model: schema.Feature,
            content: {
                biotype: 'chromosome', name: chr, sourceId: chr, source: source['@rid']
            }
        });
    }
};


/**
 * Parse CategoryVariants and convert deprecated PositionalVariant syntax.
 * Convert them to the current syntax and return them
 */
const convertDeprecatedSyntax = (string) => {
    string = string.toString().trim();
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
            reference2: match[3]
                ? match[4]
                : match[2],
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
        const type = match[1] === 'PROT'
            ? 'protein'
            : 'RNA';
        Object.assign(result, {reference1: match[2], type: match[3].replace(' ', ` ${type} `)});
    } else if (!/[.;,:_]/.exec(string)) {
        Object.assign(result, {name: string, isFeature: true});
    } else if (!/[!&$#]/.exec(string) && string.includes(':')) {
        if (string.startsWith('MUT_')) {
            string = string.slice(4);
        }
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
            if (match = /(:p.[X?][n?](_[X?][n?])?(fs|\*|spl|dup))$/.exec(string)) {
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
            } else if (match = /(:p.[X?]\*)$/.exec(string)) {
                string = string.slice(0, string.length - match[1].length);
                Object.assign(result, {reference1: string, type: 'truncating'});
            } else if (match = /(:p.[X?][n?]fs)$/.exec(string)) {
                string = string.slice(0, string.length - match[1].length);
                Object.assign(result, {reference1: string, type: 'frameshift'});
            } else {
                const [ref, variant] = string.split(':', 2);
                Object.assign(result, {positional: variant, reference1: ref});
            }
        }
    } else {
        throw new ParsingError({message: 'invalid syntax', result, string});
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
    return match
        ? match[1]
        : name;
};


const retrieveOntologyTerm = async (db, model, where, rankedSourceNames) => {
    const sourceRanks = {};
    let terms = await select(db, {model, where, fetchPlan: '*:3'});
    for (const name of rankedSourceNames || []) {
        sourceRanks[name] = Object.keys(rankedSourceNames).length;
    }
    if (terms.length === 0) {
        throw new NoRecordFoundError(`missing record (${where.sourceId || where.name || model.name})`);
    } if (terms.length === 1) {
        return terms[0];
    }
    for (const term of terms) {
        if (sourceRanks[term.source.name] === undefined) {
            sourceRanks[term.source.name] = Object.keys(rankedSourceNames).length + 1;
        }
    }
    const compareTerms = (r1, r2) => {
        if (r1.deprecated !== r2.deprecated) {
            return r1.deprecated
                ? 1
                : -1;
        } if ((r1.dependency === undefined) !== (r2.dependency === undefined)) {
            return r1.dependency
                ? 1
                : -1;
        } if ((r1.out_DeprecatedBy === undefined) !== (r2.out_DeprecatedBy === undefined)) {
            return r1.out_DeprecatedBy
                ? 1
                : -1;
        } if (sourceRanks[r1.source.name] !== sourceRanks[r2.source.name]) {
            return sourceRanks[r1.source.name] > sourceRanks[r2.source.name]
                ? -1
                : 1;
        }
        return 0;
    };
    terms = terms.sort(compareTerms);
    if (compareTerms(terms[0], terms[1]) === 0) {
        throw MultipleRecordsFoundError({
            message: 'Could not resolve the prefferred term',
            records: terms.slice(0, 2)
        });
    }
    return terms[0];
};


const upload = async (opt) => {
    const {filename} = opt;
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    console.log('parsing into json');
    const json = parse(content, {
        delimiter: ',', escape: null, quote: '"', comment: '##', columns: true, auto_parse: true
    });
    const featuresByName = {};
    // await uploadChromosomes(conn);
    const counts = {error: 0, skip: 0, success: 0};
    const skipped = {};
    // const source = await addRecord('sources', {name: 'bc gsc'}, conn, true);
    // const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, true);

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
        if (record.id_type !== 'pubmed') {
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

const cleanHistory = (jsonList) => {
    /**
     * Sort through the record history to retrieve the current state of the record
     * the user who created the record and the user who reviewed the record
     *
     * Removes historical records after assigning a review status and created by user
     */
    // won't be able to port over the old uuid's for any rows that will be split into multiple statements
    // can still find the correct users though
    // will only port review history for now as well as creation date
    const records = {};
    for (const record of jsonList) {
        record.status = record.status.toLowerCase().trim();
        if (records[record.ident] === undefined) {
            records[record.ident] = [];
        }
        record.createdAt = moment(record.createdAt).unix();

        records[record.ident].push(record);
    }
    for (const ident of Object.keys(records)) {
        if (records[ident].length > 1) {
            records[ident] = records[ident].sort((r1, r2) => r2.createdAt - r1.createdAt);
            if (records[ident][0].status === 'reviewed') {
                records[ident][0].history = records[ident].slice(1);
            }
        }
        records[ident] = records[ident][0];
    }
    return Object.values(records);
};

const cleanStringList = (string, delim = ';') => Array.from(
    string.toString().split(delim),
    x => x.trim()
).filter(x => x !== '' && x !== 'not specified');

/**
 * Given a list of json records. Expand statments so that all semi-colon delimited lists are split
 * into separate records
 */
const expandRecords = (jsonList) => {
    const records = [];
    for (const record of jsonList) {
        // columns to product on: context (;), disease_list (;), events_expression (|), ref_id (;)
        for (const context of cleanStringList(record.context)) {
            for (const eventList of cleanStringList(record.events_expression, '|')) {
                const newRecord = {
                    context,
                    variants: cleanStringList(eventList, '&'),
                    id_type: record.id_type,
                    status: record.status,
                    createdBy: record['created by user'].toString().toLowerCase().trim() || 'admin',
                    history: record.history,
                    comment: `import ident: ${record.ident}`
                };
                const pubmed = cleanStringList(record.ref_id);
                if (pubmed.length === 1) {
                    newRecord.support = [{
                        sourceId: pubmed[0],
                        summary: record.summary
                    }];
                } else {
                    newRecord.support = Array.from(pubmed, x => ({sourceId: x}));
                }
                const diseases = cleanStringList(record.disease_list);
                if (diseases.length === 0) {
                    records.push(newRecord);
                } else {
                    for (const disease of diseases) {
                        records.push(Object.assign({}, newRecord, {disease}));
                    }
                }
            }
        }
    }
    return records;
};


const main = async () => {
    const options = createOptionsMenu(
        [
            {
                name: 'input',
                description: 'The CSV flatfile exported from the IPR kb instance',
                alias: 'i',
                type: fileExists,
                required: true
            },
            {
                name: 'host',
                description: 'The database host to load the content into',
                default: 'orientdb02.bcgsc.ca',
                env: 'KB_DB_HOST'
            },
            {
                name: 'port',
                description: 'The port the database host is running the database on',
                default: 2480,
                env: 'KB_DB_PORT',
                type: Number
            },
            {
                name: 'user',
                description: 'The database username',
                default: 'root',
                env: 'KB_DB_USER'
            },
            {
                name: 'pass',
                description: 'The database server password',
                env: 'KB_DB_PASS',
                required: true
            },
            {
                name: 'dbname',
                description: 'The name of the database',
                env: 'KB_DB_NAME',
                required: true
            }
        ],
        {
            title: 'IPR to v0 Migration',
            description: 'Migrate the IPR postgres KB instance to the v0 Graph KB instance'
        }
    );


    // set up the database server
    /* const server = OrientDB({
        host: options.host,
        HTTPport: options.port,
        username: options.user,
        password: options.pass
    }); */
    const counts = {
        error: 0, skip: 0, pass: 0, history: 0
    };
    // const db = await server.use(options.dbname);
    // const schema = await loadSchema(db);
    const users = {};
    const {input: filename} = options;
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    console.log('parsing into json');

    let jsonList = parse(content, {
        delimiter: ',', escape: null, quote: '"', comment: '##', columns: true, auto_parse: true
    });
    console.log(`${jsonList.length} initial records`);
    counts.loaded = jsonList.length;

    jsonList = cleanHistory(jsonList);
    console.log(`${jsonList.length} records after cleaning history`);

    jsonList = expandRecords(jsonList);
    console.log(`${jsonList.length} records after list expansion`);


    for (const record of jsonList) {
        if (record.id_type !== 'pubmed' || record.status === 'flagged-incorrect') {
            counts.skip++;
            continue;
        }
        users[record.createdBy] = (users[record.createdBy] || 0) + 1;
        if (record.history) {
            counts.history++;
        }
        let error = 0;
        for (let i = 0; i < record.variants.length; i++) {
            try {
                const variant = convertDeprecatedSyntax(record.variants[i]);
                record.variants[i] = variant;
            } catch (err) {
                try {
                    const variant = variantParser(record.variants[i]);
                    record.variants[i] = variant;
                } catch (err2) {
                    error = 1;
                    console.log(err2.message);
                    break;
                }
            }
        }
        if (error) {
            counts.error++;
        }
    }
    console.log();
    counts.processed = jsonList.length - counts.skip - counts.error;
    console.log('results', counts);
    console.log(users);
};

main()
    .then(() => {
        process.exit(0);
    });
