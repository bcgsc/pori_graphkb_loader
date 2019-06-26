/**
 * Module for Loading content from the oncotree web API
 * @module importer/oncotree
 */

const request = require('request-promise');

const {rid} = require('./util');
const {logger} = require('./logging');

const ONCOTREE_API = 'http://oncotree.mskcc.org/api';

const CURRENT_VERSION_ID = 'oncotree_latest_stable';

const SOURCE_DEFN = {
    name: 'oncotree',
    url: 'http://oncotree.mskcc.org'
};


class OncotreeAPI {
    constructor(baseurl) {
        this.baseurl = baseurl;
    }

    /**
     * Retrieve version information from the oncotree api
     */
    async getVersions() {
        const versions = await request({
            method: 'GET',
            uri: `${this.baseurl}/versions`,
            json: true
        });

        const versionMapping = {};

        for (const version of versions) {
            if (/^oncotree_\d+_\d+_\d+$/.exec(version.api_identifier) || version.api_identifier === CURRENT_VERSION_ID) {
                versionMapping[version.release_date] = {
                    name: version.release_date,
                    apiKey: version.api_identifier
                };
            }
        }
        const versionList = Array.from(Object.values(versionMapping), v => v.name).sort();
        for (let i = 1; i < versionList.length; i++) {
            versionMapping[versionList[i]].previous = versionMapping[versionList[i - 1]];
        }
        const result = Object.values(versionMapping).sort((v1, v2) => {
            if (v1.name < v2.name) {
                return -1;
            } if (v1.name > v2.name) {
                return 1;
            }
            return 0;
        });
        return result;
    }

    async getRecords(versionApiKey) {
        const records = await request({
            method: 'GET',
            uri: `${this.baseurl}/tumorTypes?version=${versionApiKey}`,
            json: true
        });
        return records;
    }

    /**
     * Retrieve records for each version from the oncotree api
     *
     */
    async getAllRecords(versions) {
        const recordsByCode = {};

        const historicalCodes = (record) => {
            const previous = [];
            for (const dep of record.deprecates) {
                previous.push(...historicalCodes(dep));
            }
            previous.push(record.sourceId);
            return previous;
        };
        for (const version of versions) {
            logger.info(
                `loading version ${
                    version.name
                } [${
                    version.apiKey
                }] (follows: ${
                    version.previous
                        ? version.previous.name
                        : null
                })`
            );
            let records = await this.getRecords(version.apiKey);
            records = Array.from(records, (rec) => {
                const newRec = Object.assign({}, rec);
                newRec.code = rec.code.toLowerCase();
                newRec.history = Array.from(rec.history || [], code => code.toLowerCase());
                if (rec.parent) {
                    newRec.parent = rec.parent.toLowerCase();
                }
                return newRec;
            });
            for (const {name, mainType, code} of records) {
                if (recordsByCode[code] === undefined) {
                    recordsByCode[code] = {
                        name,
                        sourceId: code,
                        sourceIdVersion: version.name,
                        subclassOf: [],
                        crossReferenceOf: [],
                        subsets: [mainType],
                        deprecates: []
                    };
                }
            }
            for (const {
                parent, history, externalReferences, code
            } of records) {
                try {
                    const record = recordsByCode[code];
                    const previous = historicalCodes(record);

                    if (parent) {
                        if (!recordsByCode[parent]) {
                            logger.error(`Could not find parent code (${parent}) record of ${code})`);
                        } else {
                            record.subclassOf.push(recordsByCode[parent]);
                        }
                    }
                    for (const [xrefSource, xrefIdList] of Object.entries(externalReferences)) {
                        for (const sourceId of xrefIdList) {
                            record.crossReferenceOf.push({source: xrefSource, sourceId});
                        }
                    }
                    if (version.previous) {
                        for (const previousCode of history) {
                            if (!previous.includes(previousCode)) {
                            // link to deprecated version
                                const deprecated = recordsByCode[previousCode];
                                if (!deprecated) {
                                    throw new Error(`Cannot deprecate. Previous Code (${previousCode}) not found`);
                                } if (deprecated.deprecatedBy) {
                                    throw new Error(`cannot deprecate (${
                                        code
                                    }) the same record twice. Currently deprecated by ${
                                        deprecated.deprecatedBy.sourceId
                                    } (${
                                        deprecated.deprecatedBy.sourceIdVersion
                                    }) and therefore cannot deprecate with ${
                                        previousCode
                                    }`);
                                }
                                deprecated.deprecatedBy = record;
                                record.deprecates.push(deprecated);
                            }
                        }
                    }
                } catch (err) {
                    logger.error('Failed linking', code);
                    logger.error(err);
                }
            }
        }
        return Object.values(recordsByCode);
    }
}


/**
 * Use the oncotree REST API to pull down ontology information and then load it into the GraphKB API
 *
 * @param {object} opt options
 * @param {ApiConnection} opt.conn the GraphKB API connection object
 * @param {string} opt.url the base url to use in connecting to oncotree
 */
const upload = async (opt) => {
    const {conn} = opt;
    logger.info('Retrieving the oncotree metadata');
    const oncotreeApi = new OncotreeAPI(opt.url || ONCOTREE_API);

    const versions = await oncotreeApi.getVersions();
    const records = await oncotreeApi.getAllRecords(versions);

    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: SOURCE_DEFN
    });

    let ncitSource;
    try {
        ncitSource = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'ncit'}
        });
    } catch (err) {
        logger.log('warn', 'cannot find ncit source. Will not be able to generate cross-reference links');
    }

    const dbRecordsByCode = {};
    const ncitMissingRecords = new Set();
    // upload the results
    for (const record of records) {
        const body = {
            source: rid(source),
            name: record.name,
            sourceId: record.sourceId,
            sourceIdVersion: record.sourceIdVersion
        };
        const rec = await conn.addRecord({
            endpoint: 'diseases',
            content: body,
            existsOk: true
        });
        dbRecordsByCode[record.sourceId] = rec;

        for (const xref of record.crossReferenceOf) {
            if (xref.source === 'NCI' && ncitSource && !ncitMissingRecords.has(xref.sourceId)) {
                try {
                    const ncitXref = await conn.getUniqueRecordBy({
                        endpoint: 'diseases',
                        where: {source: rid(ncitSource), sourceId: xref.sourceId}
                    });
                    await conn.addRecord({
                        endpoint: 'crossReferenceOf',
                        content: {out: rid(rec), in: rid(ncitXref), source: rid(source)},
                        existsOk: true,
                        fetchExisting: false
                    });
                } catch (err) {
                    ncitMissingRecords.add(xref.sourceId);
                }
            }
        }
    }

    for (const record of records) {
        for (const parentRecord of record.subclassOf || []) {
            await conn.addRecord({
                endpoint: 'subclassOf',
                content: {
                    out: rid(dbRecordsByCode[record.sourceId]),
                    in: rid(dbRecordsByCode[parentRecord.sourceId]),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
        for (const deprecated of record.deprecates || []) {
            await conn.addRecord({
                endpoint: 'deprecatedBy',
                content: {
                    out: rid(dbRecordsByCode[deprecated.sourceId]),
                    in: rid(dbRecordsByCode[record.sourceId]),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
    if (ncitMissingRecords.size) {
        logger.warn(`Unable to retrieve ${ncitMissingRecords.size} ncit records for linking`);
    }
};


module.exports = {
    upload, OncotreeAPI, dependencies: ['ncit'], SOURCE_DEFN
};
