/**
 * @module
 * @ignore
 */
const request = require('request-promise');
const jc = require('json-cycle');
const jwt = require('jsonwebtoken');
const { schema } = require('@bcgsc/knowledgebase-schema');
const _ = require('lodash');

const { graphkb: { name: INTERNAL_SOURCE_NAME } } = require('./sources');


const { logger } = require('./logging');


const epochSeconds = () => Math.floor(new Date().getTime() / 1000);

const rid = (record, nullOk) => {
    if (nullOk && !record) {
        return null;
    }
    return (record['@rid'] || record).toString();
};


const simplifyRecordsLinks = (content, level = 0) => {
    if (typeof content === 'object' && content !== null) {
        const simple = {};

        if (level && content['@rid']) {
            // convert linked objects to their record Ids for comparison
            return content['@rid'].toString();
        }

        for (const [key, value] of Object.entries(content)) {
            if (Array.isArray(value)) {
                simple[key] = value.map(simplifyRecordsLinks, level + 1);
            } else {
                simple[key] = simplifyRecordsLinks(value, level + 1);
            }
        }
        return simple;
    }
    return content;
};


const shouldUpdate = (model, originalContentIn, newContentIn, upsertCheckExclude = []) => {
    const originalContent = simplifyRecordsLinks(originalContentIn);
    const formatted = model.formatRecord(simplifyRecordsLinks(newContentIn), {
        addDefaults: false,
        dropExtra: true,
        ignoreMissing: true,
    });

    for (const key of Object.keys(formatted)) {
        if (upsertCheckExclude.includes(key)) {
            continue;
        }
        if (!_.isEqual(originalContent[key], formatted[key])) {
            logger.info(`should update record (${
                originalContent['@rid']
            }) on model (${
                model.name}) because the property ${
                key
            } has changed from (${
                originalContent[key]
            }) to (${
                formatted[key]
            })`);
            return true;
        }
    }
    return false;
};

const generateCacheKey = (record) => {
    if (record.sourceIdVersion !== undefined && record.sourceIdVersion !== null) {
        return `${record.sourceId}-${record.sourceIdVersion}`.toLowerCase();
    }
    return `${record.sourceId}`.toLowerCase();
};


const nullOrUndefined = value => value === undefined || value === null;


const convertRecordToQueryFilters = (record) => {
    const filters = [];

    for (const [prop, value] of Object.entries(record).sort()) {
        if (value !== undefined) {
            filters.push({ [prop]: value });
        }
    }
    return { AND: filters };
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
        // use source rank to sort results
        if (term1.source.sort < term2.source.sort) {
            return -1;
        } if (term1.source.sort > term2.source.sort) {
            return 1;
        } if (term1.source.version < term2.source.version) {
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
        this.created = {};
        this.updated = {};
        this.pendingRequests = 0;
    }

    async setAuth({ username, password }) {
        this.username = username;
        this.password = password;
        await this.login();
    }

    async login() {
        logger.log('info', `login to ${this.baseUrl}`);
        const token = await request({
            body: { password: this.password, username: this.username },
            json: true,
            method: 'POST',
            uri: `${this.baseUrl}/token`,
        });
        this.headers.Authorization = token.kbToken;
        const tokenContent = jwt.decode(token.kbToken);
        this.exp = tokenContent.exp;
    }

    /**
     * Make a request to the currently connected API
     * @param {object} opt
     * @param {string} opt.method the request method
     * @param {string} opt.uri the uri target
     * @param {object} opt.body the request body
     * @param {object} opt.qs the query parameters
     */
    async request(opt) {
        if (this.exp <= epochSeconds()) {
            await this.login();
        }
        this.pendingRequests += 1;
        const startTime = new Date().getTime();
        const req = {
            headers: this.headers,
            json: true,
            method: opt.method || 'GET',
            uri: `${this.baseUrl}/${opt.uri.replace(/^\//, '')}`,
        };

        if (opt.body) {
            req.body = opt.body;
        }
        if (opt.qs) {
            req.qs = opt.qs;
        }

        const logResponseTime = (returnCode = 200) => {
            this.pendingRequests -= 1;
            const respTime = new Date().getTime() - startTime;

            if (respTime > 2000) {
                logger.warn(`${respTime}ms [${req.method}] ${req.uri} ${JSON.stringify(req.body)}`);
            }
            logger.debug(`[${req.method}] ${req.uri} ${this.pendingRequests} ${returnCode} - ${respTime} ms`);
        };

        try {
            const result = await request(req);
            logResponseTime();
            return result;
        } catch (err) {
            let errorMessage = err.message;

            try {
                const errorContent = err.error;
                errorMessage = `${errorContent.name}: ${errorContent.message}`;
            } catch (err2) {}

            if (err.statusCode === 400) {
                logger.error(`bad request ${opt.method || 'GET'} ${opt.uri} ${JSON.stringify(opt.body)}`);
                logger.error(errorMessage);
            }
            logResponseTime(err.statusCode);
            throw err;
        }
    }

    getCreatedCounts() {
        const created = {};

        for (const key of Object.keys(this.created)) {
            created[key] = { created: this.created[key].length };
        }

        for (const key of Object.keys(this.updated)) {
            created[key] = { ...(created[key] || {}), updated: this.updated[key].length };
        }
        return created;
    }

    async getRecords(opt) {
        const {
            filters,
            target,
            limit = 1000,
            neighbors = 1,
            returnProperties = null,
        } = opt;

        const result = [];
        let lastFetch = limit,
            skip = 0;

        while (lastFetch === limit) {
            const { result: records } = await this.request({
                body: {
                    filters,
                    limit,
                    neighbors,
                    returnProperties,
                    skip,
                    target,
                },
                method: 'POST',
                uri: '/query',
            });
            result.push(...records);
            lastFetch = records.length;
            skip += limit;
        }
        return result;
    }

    async getUniqueRecord(opt) {
        const { result } = await this.request(opt);

        if (result.length !== 1) {
            throw new Error('Did not find unique record');
        }
        return result[0];
    }

    /**
     *
     * @param {object} opt
     * @param {object} opt.filters the conditions/query parameters for the selection
     * @param {string} opt.target the target to query
     * @param {function} opt.sort the function to use in sorting if multiple results are found
     */
    async getUniqueRecordBy(opt) {
        const {
            target,
            filters,
            sort: sortFunc = () => 0,
            neighbors = 1,
        } = opt;

        const { result: records } = await this.request({
            body: { filters, neighbors, target },
            method: 'POST',
            uri: '/query',
        });
        records.sort(sortFunc);

        if (records.length > 1) {
            if (sortFunc(records[0], records[1]) === 0) {
                throw new Error(`expected a single ${target} record but found multiple: [${rid(records[0])}, ${rid(records[1])}] where ${JSON.stringify(filters)}`);
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
                    { sourceId: term },
                    { name: term },
                ],
            };

        if (source) {
            filters = { AND: [{ source }, filters] };
        }

        try {
            return await this.getUniqueRecordBy({
                filters,
                sort: orderPreferredOntologyTerms,
                target: 'Therapy',
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
                        { sourceId: alternateTerm },
                        { name: alternateTerm },
                    ],
                };

                if (source) {
                    filters = { AND: [{ source }, filters] };
                }
                return await this.getUniqueRecordBy({
                    filters,
                    sort: orderPreferredOntologyTerms,
                    target: 'Therapy',
                });
            } catch (err) {
                error = err;
            }
        }
        throw error;
    }

    async getVocabularyTerm(term, sourceName = INTERNAL_SOURCE_NAME) {
        return this.getUniqueRecordBy({
            filters: {
                AND: [
                    { sourceId: term },
                    { source: { filters: { name: sourceName }, target: 'Source' } },
                ],
            },
            sortFunc: orderPreferredOntologyTerms,
            target: 'Vocabulary',
        });
    }

    async updateRecord(target, recordId, newContent) {
        const model = schema.get(target);
        const { result } = jc.retrocycle(await this.request({
            body: newContent,
            method: 'PATCH',
            uri: `${model.routeName}/${recordId.replace(/^#/, '')}`,
        }));

        if (this.updated[model.name] === undefined) {
            this.updated[model.name] = [];
        }
        this.updated[model.name].push(result['@rid']);
        return result;
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
            sortFunc = () => 0,
            upsert = false,
            upsertCheckExclude = [],
        } = opt;
        const model = schema.get(target);
        const filters = fetchConditions || convertRecordToQueryFilters(content);

        if (fetchFirst) {
            try {
                const result = await this.getUniqueRecordBy({
                    filters,
                    sortFunc,
                    target,
                });

                if (upsert && shouldUpdate(model, result, content, upsertCheckExclude)) {
                    return await this.updateRecord(target, result['@rid'], content);
                }
                return result;
            } catch (err) { }
        }


        if (!model) {
            throw new Error(`cannot find model from target (${target})`);
        }

        try {
            const { result } = jc.retrocycle(await this.request({
                body: content,
                method: 'POST',
                uri: model.routeName,
            }));

            if (this.created[model.name] === undefined) {
                this.created[model.name] = [];
            }
            this.created[model.name].push(result['@rid']);
            return result;
        } catch (err) {
            if (err.statusCode === 409 && (existsOk || upsert)) {
                if (fetchExisting || upsert) {
                    const result = await this.getUniqueRecordBy({
                        filters,
                        sortFunc,
                        target,
                    });

                    if (upsert && shouldUpdate(model, result, content, upsertCheckExclude)) {
                        return this.updateRecord(target, result['@rid'], content);
                    }
                    return result;
                }
                return null;
            }
            throw err;
        }
    }

    /**
     * @param {object} opt
     * @param {object} opt.content
     * @param {string} opt.target
     */
    async addVariant(opt) {
        const {
            content,
            target,
        } = opt;
        const fetchConditions = {
            germline: null,
            reference2: null,
            zygosity: null,
        };

        if (target === 'PositionalVariant') {
            Object.assign(fetchConditions, {
                assembly: null,
                break1Repr: null,
                break2Repr: null,
                refSeq: null,
                truncation: null,
                untemplatedSeq: null,
            });
        }
        const {
            break1Start, break1End, break2Start, break2End, ...rest
        } = content;

        return this.addRecord({
            ...opt,
            fetchConditions: convertRecordToQueryFilters({ ...fetchConditions, ...rest }),
        });
    }

    async addTherapyCombination(source, therapyName, opt = {}) {
        const { matchSource = false } = opt;

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
                content: { name, source: rid(source), sourceId },
                existsOk: true,
                target: 'Therapy',
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
    ApiConnection,
    INTERNAL_SOURCE_NAME,
    convertRecordToQueryFilters,
    generateCacheKey,
    orderPreferredOntologyTerms,
    rid,
};
