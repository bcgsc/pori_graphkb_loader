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
const jwt = require('jsonwebtoken');
const sleep = require('sleep-promise');
const HTTP_STATUS_CODES = require('http-status-codes');


const {logger} = require('./logging');

const epochSeconds = () => Math.floor(new Date().getTime() / 1000);

const rid = record => (record['@rid'] || record).toString();

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

/**
 * wrapper to make requests less verbose
 */
class ApiConnection {
    constructor(opt) {
        this.baseUrl = `http://${opt.host}:${opt.port}/api`;
        this.headers = {};
        this.username = null;
        this.password = null;
        this.exp = null;
    }

    async setAuth({username, password}) {
        this.username = username;
        this.password = password;
        await this.login();
    }

    async login() {
        const token = await request({
            method: 'POST',
            uri: `${this.baseUrl}/token`,
            json: true,
            body: {username: this.username, password: this.password}
        });
        this.headers.Authorization = token.kbToken;
        const tokenContent = jwt.decode(token.kbToken);
        this.exp = tokenContent.exp;
    }

    /**
     * Make a request to the currently connected API
     * @param {object} opt
     * @param {string} opt.method the request method
     * @param {string} opt.uri the uri endpoint
     * @param {object} opt.body the request body
     * @param {object} opt.qs the query parameters
     */
    async request(opt) {
        if (this.exp < epochSeconds()) {
            await this.login();
        }
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

    async getUniqueRecord(opt) {
        const {result} = await this.request(opt);
        if (result.length !== 1) {
            throw new Error('Did not find unique record');
        }
        return result[0];
    }

    /**
     *
     * @param {object} opt
     * @param {object} opt.where the conditions/query parameters for the selection
     * @param {string} opt.endpoint the endpoint to query
     * @param {function} opt.sortFunc the function to use in sorting if multiple results are found
     */
    async getUniqueRecordBy(opt) {
        const {
            where,
            endpoint,
            sort: sortFunc = () => 0
        } = opt;

        const queryParams = convertNulls(where);
        let newRecord;
        try {
            newRecord = await this.request({
                uri: endpoint,
                qs: Object.assign({neighbors: 1}, queryParams)
            });
            newRecord = jc.retrocycle(newRecord).result;
        } catch (err) {
            throw err;
        }
        newRecord.sort(sortFunc);
        if (newRecord.length > 1) {
            if (sortFunc(newRecord[0], newRecord[1]) === 0) {
                throw new Error(`expected a single ${endpoint} record but found multiple: ${rid(newRecord[0])} and ${rid(newRecord[1])}`);
            }
        } else if (newRecord.length === 0) {
            throw new Error(`missing ${endpoint} record where ${JSON.stringify(where)}`);
        }
        [newRecord] = newRecord;
        return newRecord;
    }

    /**
     * @param {object} opt
     * @param {string} opt.endpoint
     * @param {boolean} [opt.existsOk=false] do not error if a record cannot be created because it already exists
     * @param {object} [opt.fetchConditions=null] the where clause to be used in attempting to fetch this record
     * @param {boolean} [opt.fetchExisting=true] return the record if it already exists
     * @param {boolean} [opt.fetchFirst=false] attempt to fetch the record before trying to create it
     * @param {function} opt.sortFunc function to be used in order records if multiple are returned to limit the result to 1
     */
    async addRecord(opt) {
        const {
            content,
            endpoint,
            existsOk = false,
            fetchConditions = null,
            fetchExisting = true,
            fetchFirst = false,
            sortFunc = () => 0
        } = opt;

        if (fetchFirst) {
            try {
                return this.getUniqueRecordBy({
                    where: fetchConditions || content,
                    endpoint,
                    sortFunc
                });
            } catch (err) {}
        }

        try {
            const {result} = jc.retrocycle(await this.request({
                method: 'POST',
                uri: endpoint,
                body: content
            }));
            return result;
        } catch (err) {
            if (err.statusCode === 409 && existsOk) {
                if (fetchExisting) {
                    return this.getUniqueRecordBy({
                        where: fetchConditions || content,
                        endpoint,
                        sortFunc
                    });
                }
                return null;
            }
            throw err;
        }
    }
}


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
 * Given two ontology terms, return the newer, non-deprecated, independant, term first.
 *
 * @param {object} term1 the first term record
 * @param {object} term2 the second term record
 *
 * @returns {Number} the sorting number (-1, 0, +1)
 */
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


const preferredSources = (sourceRank, term1, term2) => {
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


const preferredVocabulary = (term1, term2) => {
    const sourceRank = {
        bcgsc: 0,
        'sequence ontology': 1,
        'variation ontology': 2
    };
    return preferredSources(sourceRank, term1, term2);
};


const preferredDiseases = (term1, term2) => {
    const sourceRank = {
        oncotree: 0,
        'disease ontology': 1
    };
    return preferredSources(sourceRank, term1, term2);
};

const preferredDrugs = (term1, term2) => {
    const sourceRank = {
        drugbank: 0,
        ncit: 1
    };
    return preferredSources(sourceRank, term1, term2);
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

/**
 *  Try again for too many requests errors. Helpful for APIs with a rate limit (ex. pubmed)
 */
const requestWithRetry = async (requestOpt, {waitSeconds = 2, retries = 1} = {}) => {
    try {
        const result = await request(requestOpt);
        return result;
    } catch (err) {
        if (err.statusCode === HTTP_STATUS_CODES.TOO_MANY_REQUESTS && retries > 0) {
            await sleep(waitSeconds);
            return requestWithRetry(requestOpt, {waitSeconds, retries: retries - 1});
        }
        throw err;
    }
};


module.exports = {
    rid,
    convertOwlGraphToJson,
    orderPreferredOntologyTerms,
    preferredDiseases,
    preferredDrugs,
    preferredVocabulary,
    loadDelimToJson,
    loadXmlToJson,
    ApiConnection,
    requestWithRetry
};
