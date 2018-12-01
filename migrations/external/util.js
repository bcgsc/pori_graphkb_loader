/**
 * @module
 * @ignore
 */
const request = require('request-promise');
const jc = require('json-cycle');
const fs = require('fs');
const _ = require('lodash');
const parse = require('csv-parse/lib/sync');
const xml2js = require('xml2js');
const {progress, logger} = require('./logging');


/**
 * wrapper to make requests less verbose
 */
class ApiConnection {
    constructor(opt) {
        this.baseUrl = `http://${opt.host}:${opt.port}/api`;
        this.headers = {};
    }

    async setAuth({username, password}) {
        const token = await request({
            method: 'POST',
            uri: `${this.baseUrl}/token`,
            json: true,
            body: {username, password}
        });
        this.headers.Authorization = token.kbToken;
    }

    async request(opt) {
        const req = {
            method: opt.method || 'GET',
            headers: this.headers,
            uri: `${this.baseUrl}/${opt.uri}`,
            json: true
        };
        if (opt.body) {
            req.body = opt.body;
        }
        if (opt.qs) {
            req.qs = opt.qs;
        }
        return request(req);
    }
}


const convertNulls = (where) => {
    const queryParams = {};
    for (const param of Object.keys(where)) {
        if (where[param] === null) {
            queryParams[param] = 'null';
        } else if (typeof where[param] === 'object') {
            queryParams[param] = convertNulls(where[param]);
        } else {
            queryParams[param] = where[param];
        }
    }
    return queryParams;
};

const getRecordBy = async (className, where, conn, sortFunc = () => 0) => {
    const queryParams = convertNulls(where);
    let newRecord;
    try {
        newRecord = await conn.request({
            uri: className,
            qs: Object.assign({neighbors: 1}, queryParams)
        });
        newRecord = jc.retrocycle(newRecord).result;
    } catch (err) {
        throw err;
    }
    newRecord.sort(sortFunc);
    if (newRecord.length > 1) {
        if (sortFunc(newRecord[0], newRecord[1]) === 0) {
            console.log(newRecord[0], newRecord[1]);
            throw new Error(`expected a single ${className} record but found multiple: ${rid(newRecord[0])} and ${rid(newRecord[1])}`);
        }
    } else if (newRecord.length === 0) {
        throw new Error(`\nmissing ${className} record: ${where.name || where.sourceId || Object.entries(where)} (${where.sourceId})`);
    }
    newRecord = newRecord[0];
    return newRecord;
};


const succinctRepresentation = (record) => {
    const succint = {};
    const cleanEdge = (edge, target) => {
        const result = {};
        if (edge[target] && edge[target]['@rid']) {
            result[target] = edge[target]['@rid'];
        } else {
            result[target] = edge[target];
        }
        return succinctRepresentation(Object.assign(result, _.omit(edge, ['in', 'out', 'createdBy', 'uuid', 'createdAt', '@class', '@rid'])));
    };
    for (let [attr, value] of Object.entries(record)) {
        if (['createdBy', 'uuid', 'createdAt'].includes(attr)) {
            continue;
        }
        if (value instanceof Array) {
            for (let i = 0; i < value.length; i++) {
                if (attr.startsWith('out_')) {
                    value[i] = cleanEdge(value[i], 'in');
                } else if (attr.startsWith('in_')) {
                    value[i] = cleanEdge(value[i], 'out');
                }
            }
        } else if (value && value['@rid']) {
            value = value['@rid'];
        }
        succint[attr] = value;
    }
    return succint;
};


/**
 * Add a disease record to the DB
 * @param {object} where
 * @param {ApiConnection} conn
 * @param {boolean} exists_ok
 */
const addRecord = async (className, where, conn, optIn = {}) => {
    const opt = Object.assign({
        existsOk: false,
        getWhere: null,
        verbose: false,
        get: true
    }, optIn);
    try {
        const newRecord = jc.retrocycle(await conn.request({
            method: 'POST',
            uri: className,
            body: where
        }));

        progress(where.out && where.in
            ? '-'
            : '.');
        return newRecord.result;
    } catch (err) {
        err.error = jc.retrocycle(err.error);
        if (opt.verbose || process.env.VERBOSE === '1') {
            logger.error('Record Attempted');
            logger.error(where);
            if (err.error.current) {
                logger.error('vs record(s) retrieved');
                for (const record of err.error ? err.error.current : []) {
                    logger.error(succinctRepresentation(record));
                }
            }
        }
        if (opt.existsOk && err.statusCode === 409) {
            progress(where.out && where.in
                ? '='
                : '*');
            if (opt.get) {
                const result = await getRecordBy(className, opt.getWhere || where, conn);
                return result;
            }
            return null;
        }
        throw err;
    }
};


const orderPreferredOntologyTerms = (term1, term2) => {
    if (term1.deprecated && !term2.deprecated) {
        return 1;
    } if (term2.deprecated && !term1.deprecated) {
        return -1;
    } if (term1.dependency == null & term2.dependency != null) {
        return -1;
    } if (term2.dependency == null & term1.dependency != null) {
        return 1;
    } if (term1.sourceId === term2.sourceId) {
        if (term1.sourceIdVersion < term2.sourceIdVersion) {
            return -1;
        } if (term1.sourceIdVersion > term2.sourceIdVersion) {
            return 1;
        } if (term1.source.version < term2.source.version) {
            return -1;
        } if (term1.source.version > term2.source.version) {
            return 1;
        }
    }
    return 0;
};


const preferredDiseases = (term1, term2) => {
    const sourceRank = {
        oncotree: 0,
        'disease ontology': 1
    };

    if (orderPreferredOntologyTerms(term1, term2) === 0) {
        if (term1.source.name !== term2.source.name) {
            const rank1 = sourceRank[term1.source.name] === undefined
                ? 2
                : sourceRank[term1.source.name];
            const rank2 = sourceRank[term2.source.name] === undefined
                ? 2
                : sourceRank[term2.source.name];
            if (rank1 !== rank2) {
                return rank1 < rank2
                    ? -1
                    : 1;
            }
        }
        return 0;
    }
    return orderPreferredOntologyTerms(term1, term2);
};

const preferredDrugs = (term1, term2) => {
    const sourceRank = {
        drugbank: 0,
        ncit: 1
    };

    if (orderPreferredOntologyTerms(term1, term2) === 0) {
        if (term1.source.name !== term2.source.name) {
            const rank1 = sourceRank[term1.source.name] === undefined
                ? 2
                : sourceRank[term1.source.name];
            const rank2 = sourceRank[term2.source.name] === undefined
                ? 2
                : sourceRank[term2.source.name];
            if (rank1 !== rank2) {
                return rank1 < rank2
                    ? -1
                    : 1;
            }
        }
        return 0;
    }
    return orderPreferredOntologyTerms(term1, term2);
};


const getPubmedArticle = async (pmid) => {
    // try getting the title from the pubmed api
    const opt = {
        method: 'GET',
        uri: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
        qs: {
            id: pmid,
            retmode: 'json',
            db: 'pubmed'
        },
        headers: {Accept: 'application/json'},
        json: true
    };
    try {
        let pubmedRecord = await request(opt);
        if (pubmedRecord && pubmedRecord.result && pubmedRecord.result[pmid]) {
            pubmedRecord = pubmedRecord.result[pmid];
            const article = {
                sourceId: pmid,
                name: pubmedRecord.title,
                journalName: pubmedRecord.fulljournalname
            };
            // sortpubdate: '1992/06/01 00:00'
            const match = /^(\d\d\d\d)\//.exec(pubmedRecord.sortpubdate);
            if (match) {
                article.year = parseInt(match[1], 10);
            }
            return article;
        }
    } catch (err) {}
    throw new Error(`failed to retrieve pubmed article (${pmid})`);
};


const convertOwlGraphToJson = (graph, idParser = x => x) => {
    const initialRecords = {};
    for (const statement of graph.statements) {
        let src;
        try {
            src = idParser(statement.subject.value);
        } catch (err) {
            continue;
        }
        if (initialRecords[src] === undefined) {
            initialRecords[src] = {code: src};
        }
        if (initialRecords[src][statement.predicate.value] === undefined) {
            initialRecords[src][statement.predicate.value] = [];
        }
        initialRecords[src][statement.predicate.value].push(statement.object.value);
    }
    const nodesByCode = {};
    // const initialRecords = require(filename);

    // transform all NCIT codes to std format
    for (const record of Object.values(initialRecords)) {
        nodesByCode[record.code] = record;
        for (const predicate of Object.keys(record)) {
            if (typeof record[predicate] === 'object' && record[predicate] !== null) {
                const formatted = [];
                for (let item of record[predicate]) {
                    try {
                        item = idParser(item);
                    } catch (err) {
                        // ignore, will be unamed n\d+ nodes
                    }
                    formatted.push(item);
                }
                record[predicate] = formatted;
            }
        }
    }
    return nodesByCode;
};


const loadDelimToJson = async (filename, delim = '\t') => {
    logger.info(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    logger.info('parsing into json');
    const jsonList = parse(content, {
        delimiter: delim, escape: null, quote: null, comment: '##', columns: true, auto_parse: true
    });
    return jsonList;
};


const loadXmlToJson = (filename) => {
    logger.info(`reading: ${filename}`);
    const xmlContent = fs.readFileSync(filename).toString();
    logger.info(`parsing: ${filename}`);
    return new Promise((resolve, reject) => {
        xml2js.parseString(xmlContent, (err, result) => {
            logger.error(err);
            if (err !== null) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
};


const rid = record => (record['@rid'] || record).toString();


module.exports = {
    rid,
    addRecord,
    getRecordBy,
    convertOwlGraphToJson,
    orderPreferredOntologyTerms,
    getPubmedArticle,
    preferredDiseases,
    preferredDrugs,
    loadDelimToJson,
    loadXmlToJson,
    ApiConnection
};
