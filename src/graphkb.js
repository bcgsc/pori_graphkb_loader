/**
 * @module
 * @ignore
 */
const request = require('request-promise');
const jc = require('json-cycle');
const jwt = require('jsonwebtoken');
const {schema} = require('@bcgsc/knowledgebase-schema');


const {logger} = require('./logging');

const INTERNAL_SOURCE_NAME = 'graphkb';

const epochSeconds = () => Math.floor(new Date().getTime() / 1000);

const generateCacheKey = (record) => {
    if (record.sourceIdVersion !== undefined && record.sourceIdVersion !== null) {
        return `${record.sourceId}-${record.sourceIdVersion}`.toLowerCase();
    }
    return `${record.sourceId}`.toLowerCase();
};

const rid = (record, nullOk) => {
    if (nullOk && !record) {
        return null;
    }
    return (record['@rid'] || record).toString();
};

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

const nullOrUndefined = value => value === undefined || value === null;


const convertRecordToQueryFilters = (record) => {
    const filters = [];
    for (const [prop, value] of Object.entries(record)) {
        filters.push({[prop]: value});
    }
    return {AND: filters};
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
    // prefer non-deprecated terms
    if (term1.deprecated && !term2.deprecated) {
        return 1;
    } if (term2.deprecated && !term1.deprecated) {
        return -1;
    }
    // prefer terms with independent sourceId
    if (term1.dependency == null & term2.dependency != null) {
        return -1;
    } if (term2.dependency == null & term1.dependency != null) {
        return 1;
    }
    // when terms have the same sourceId and source
    if (term1.sourceId === term2.sourceId && rid(term1.source, true) === rid(term2.source, true)) {
        // prefer generic to versioned terms (will not be together unless version not specified)
        if (nullOrUndefined(term1.sourceIdVersion) && !(term2.sourceIdVersion)) {
            return -1;
        } if (nullOrUndefined(term2.sourceIdVersion) && !(term1.sourceIdVersion)) {
            return 1;
        }
        // prefer newer/later versions
        if (term1.sourceIdVersion < term2.sourceIdVersion) {
            return -1;
        } if (term1.sourceIdVersion > term2.sourceIdVersion) {
            return 1;
        }
        // prefer newer/later source version
        if (term1.source && term2.source) {
            if (term1.source.version < term2.source.version) {
                return -1;
            } if (term1.source.version > term2.source.version) {
                return 1;
            }
        }
        // prefer terms with descriptions
        if (term1.description && !term2.description) {
            return -1;
        } if (!term1.description && term2.description) {
            return 1;
        }
    } if (term1.source && term2.source) {
        if (term1.source.version < term2.source.version) {
            return -1;
        } if (term1.source.version > term2.source.version) {
            return 1;
        } if (term1.description && !term2.description) {
            return -1;
        } if (!term1.description && term2.description) {
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

/**
 * Given some array create an object where elements are mapped to their position in the array
 */
const generateRanks = (arr) => {
    const ranks = {};
    for (let i = 0; i < arr.length; i++) {
        ranks[arr[i]] = i;
    }
    return ranks;
};

const preferredVocabulary = (term1, term2) => {
    const sourceRank = generateRanks([
        INTERNAL_SOURCE_NAME,
        'sequence ontology',
        'variation ontology'
    ]);
    return preferredSources(sourceRank, term1, term2);
};


const preferredDiseases = (term1, term2) => {
    const sourceRank = generateRanks([
        'oncotree',
        'disease ontology',
        'ncit'
    ]);
    return preferredSources(sourceRank, term1, term2);
};

const preferredDrugs = (term1, term2) => {
    const sourceRank = generateRanks([
        'drugbank',
        'chembl',
        'ncit',
        'fda',
        'oncokb',
        'gsc therapeutic ontology'
    ]);
    return preferredSources(sourceRank, term1, term2);
};


const preferredFeatures = (term1, term2) => {
    const sourceRank = generateRanks([
        'grch',
        'entrez',
        'hgnc',
        'ensembl',
        'refseq'
    ]);
    return preferredSources(sourceRank, term1, term2);
};


/**
 * wrapper to make requests less verbose
 */
class ApiConnection {
    /**
     * @param {string} url the base url for the api
     */
    constructor(url) {
        this.baseUrl = url;
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
        logger.log('info', `login to ${this.baseUrl}`);
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
        if (this.exp <= epochSeconds()) {
            await this.login();
        }
        const req = {
            method: opt.method || 'GET',
            headers: this.headers,
            uri: `${this.baseUrl}/${opt.uri.replace(/^\//, '')}`,
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

    async getRecords(opt) {
        const {
            filters,
            target,
            limit = 1000,
            neighbors = 1,
            returnProperties = null
        } = opt;

        const result = [];
        let lastFetch = limit,
            skip = 0;

        while (lastFetch === limit) {
            const {result: records} = await this.request({
                uri: '/query',
                method: 'POST',
                body: {
                    target,
                    filters,
                    neighbors,
                    limit,
                    skip,
                    returnProperties
                }
            });
            result.push(...records);
            lastFetch = records.length;
            skip += limit;
        }
        return result;
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
     * @param {object} opt.filters the conditions/query parameters for the selection
     * @param {string} opt.target the endpoint to query
     * @param {function} opt.sort the function to use in sorting if multiple results are found
     */
    async getUniqueRecordBy(opt) {
        const {
            target,
            filters,
            sort: sortFunc = () => 0
        } = opt;

        const {result: records} = await this.request({
            method: 'POST',
            uri: '/query',
            body: {target, filters}
        });
        records.sort(sortFunc);
        if (records.length > 1) {
            if (sortFunc(records[0], records[1]) === 0) {
                throw new Error(`expected a single ${target} record but found multiple: [${rid(records[0])}, ${rid(records[1])}]`);
            }
        } else if (records.length === 0) {
            throw new Error(`missing ${target} record where ${JSON.stringify(filters)}`);
        }
        const [result] = records;
        return result;
    }

    /**
     * Fetch therapy by name, ignore plurals for some cases
     */
    async getTherapy(term, source) {
        let error,
            filters = {
                OR: [
                    {sourceId: term},
                    {name: term}
                ]
            };
        if (source) {
            filters = {AND: [{source}, filters]};
        }
        try {
            return await this.getUniqueRecordBy({
                target: 'Therapy',
                sort: preferredDrugs,
                filters
            });
        } catch (err) {
            error = err;
        }
        let alternateTerm;
        if (/\binhibitor\b/.exec(term)) {
            alternateTerm = term.replace(/\binhibitor\b/, 'inhibitors');
        } else if (/\binhibitors\b/.exec(term)) {
            alternateTerm = term.replace(/\binhibitors\b/, 'inhibitor');
        }
        if (alternateTerm) {
            try {
                filters = {
                    OR: [
                        {sourceId: alternateTerm},
                        {name: alternateTerm}
                    ]
                };
                if (source) {
                    filters = {AND: [{source}, filters]};
                }
                return await this.getUniqueRecordBy({
                    target: 'Therapy',
                    sort: preferredDrugs,
                    filters
                });
            } catch (err) {
                error = err;
            }
        }
        throw error;
    }

    async getVocabularyTerm(term) {
        return this.getUniqueRecordBy({
            target: 'Vocabulary',
            filters: {
                AND: [
                    {sourceId: term},
                    {source: {target: 'Source', filters: {name: INTERNAL_SOURCE_NAME}}}
                ]
            },
            sortFunc: orderPreferredOntologyTerms
        });
    }

    /**
     * @param {object} opt
     * @param {string} opt.target
     * @param {boolean} [opt.existsOk=false] do not error if a record cannot be created because it already exists
     * @param {object} [opt.fetchConditions=null] the filters clause to be used in attempting to fetch this record
     * @param {boolean} [opt.fetchExisting=true] return the record if it already exists
     * @param {boolean} [opt.fetchFirst=false] attempt to fetch the record before trying to create it
     * @param {function} opt.sortFunc function to be used in order records if multiple are returned to limit the result to 1
     */
    async addRecord(opt) {
        const {
            content,
            target,
            existsOk = false,
            fetchConditions = null,
            fetchExisting = true,
            fetchFirst = false,
            sortFunc = () => 0
        } = opt;

        if (fetchFirst) {
            try {
                const filters = fetchConditions || convertRecordToQueryFilters(content);
                return await this.getUniqueRecordBy({
                    filters,
                    target,
                    sortFunc
                });
            } catch (err) {}
        }

        const model = schema.get(target);

        try {
            const {result} = jc.retrocycle(await this.request({
                method: 'POST',
                uri: model.routeName,
                body: content
            }));
            return result;
        } catch (err) {
            if (err.statusCode === 409 && existsOk) {
                if (fetchExisting) {
                    const filters = fetchConditions || convertRecordToQueryFilters(content);
                    return this.getUniqueRecordBy({
                        filters,
                        target,
                        sortFunc
                    });
                }
                return null;
            }
            throw err;
        }
    }

    /**
     * @param {object} opt
     * @param {object} opt.content
     * @param {string} opt.endpoint
     */
    async addVariant(opt) {
        const {
            content,
            endpoint
        } = opt;
        const fetchConditions = {
            zygosity: null,
            germline: null,
            reference2: null
        };

        if (endpoint === 'positionalvariants') {
            Object.assign(fetchConditions, {
                untemplatedSeq: null,
                refSeq: null,
                break1Repr: null,
                break2Repr: null,
                truncation: null,
                assembly: null
            });
        }
        const {
            break1Start, break1End, break2Start, break2End, ...rest
        } = content;

        return this.addRecord({
            ...opt,
            fetchConditions: {...fetchConditions, ...rest}
        });
    }

    async addTherapyCombination(source, therapyName, opt = {}) {
        const {matchSource = false} = opt;
        // try to get exact name match first
        try {
            let result;
            if (matchSource) {
                result = await this.getTherapy(therapyName, rid(source));
            } else {
                result = await this.getTherapy(therapyName);
            }
            return result;
        } catch (err) {
            if (!therapyName.includes('+')) {
                throw err;
            }
        }
        // if contains + then try to split and find each element by name/sourceId
        try {
            const elements = await Promise.all(therapyName.split(/\s*\+\s*/gi).map((name) => {
                if (matchSource) {
                    return this.getTherapy(name, rid(source));
                }
                return this.getTherapy(name);
            }));
            const sourceId = elements.map(e => e.sourceId).sort().join(' + ');
            const name = elements.map(e => e.name).sort().join(' + ');
            const combinedTherapy = await this.addRecord({
                target: 'therapies',
                content: {sourceId, name, source: rid(source)},
                existsOk: true
            });
            return combinedTherapy;
        } catch (err) {
            logger.error(err);
            logger.error(`Failed to create the combination therapy (${therapyName})`);
            throw err;
        }
    }
}


module.exports = {
    convertRecordToQueryFilters,
    INTERNAL_SOURCE_NAME,
    rid,
    generateCacheKey,
    orderPreferredOntologyTerms,
    preferredDiseases,
    preferredDrugs,
    preferredVocabulary,
    preferredFeatures,
    ApiConnection,
    convertNulls
};
