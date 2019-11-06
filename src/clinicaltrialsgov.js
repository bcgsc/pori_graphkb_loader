/**
 * Module to import clinical trials data exported from clinicaltrials.gov
 *
 * 1. Perform a search on their site, for example https://clinicaltrials.gov/ct2/results?cond=Cancer&cntry=CA&Search=Apply&recrs=b&recrs=a&age_v=&gndr=&type=Intr&rslt=
 * 2. Click their Download link/Button
 * 3. Adjust the settings in the Pop up dialog (Include all studies, all columns, and export as XML)
 * 4. Download and save the file
 * 5. Upload the file to GraphKB using this module
 *
 * @module importer/clinicaltrialsgov
 */
const Ajv = require('ajv');
const _ = require('lodash');

const {
    loadXmlToJson,
    parseXmlToJson,
    checkSpec,
    requestWithRetry,
} = require('./util');
const {
    orderPreferredOntologyTerms,
    rid,
    convertRecordToQueryFilters,
} = require('./graphkb');
const { logger } = require('./logging');

const SOURCE_DEFN = {
    name: 'clinicaltrials.gov',
    url: 'https://clinicaltrials.gov',
    usage: 'https://clinicaltrials.gov/ct2/about-site/terms-conditions#Use',
    description: 'ClinicalTrials.gov is a database of privately and publicly funded clinical studies conducted around the world',
};

const BASE_URL = 'https://clinicaltrials.gov/ct2/show';
const CACHE = {};


const ajv = new Ajv();


const singleItemArray = (spec = { type: 'string' }) => ({
    type: 'array', maxItems: 1, minItems: 1, items: { ...spec },
});

const validateDownloadedTrialRecord = ajv.compile({
    type: 'object',
    required: [
        'nct_id',
        'title',
        'last_update_posted',
        'url',
        'phases',
        'interventions',
        'conditions',
    ],
    properties: {
        nct_id: singleItemArray({ pattern: '^NCT\\d+$' }),
        title: singleItemArray(),
        url: singleItemArray(),
        last_update_posted: singleItemArray(),
        phases: singleItemArray({
            type: 'object',
            required: ['phase'],
            properties: {
                phase: { type: 'array', minItems: 1, items: { type: 'string' } },
            },
        }),
        conditions: singleItemArray({
            type: 'object',
            required: ['condition'],
            properties: {
                condition: { type: 'array', minItems: 1, items: { type: 'string' } },
            },
        }),
        interventions: singleItemArray({
            type: 'object',
            required: ['intervention'],
            properties: {
                intervention: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['_', 'type'],
                        properties: {
                            _: { type: 'string' },
                            type: singleItemArray(),
                        },
                    },
                },
            },
        }),
    },
});


const validateAPITrialRecord = ajv.compile({
    type: 'object',
    required: ['clinical_study'],
    properties: {
        clinical_study: {
            type: 'object',
            required: [
                'id_info',
                'official_title',
                'phase',
                'condition',
                'intervention',
                'last_update_posted',
                'required_header',
                'location',
            ],
            properties: {
                required_header: singleItemArray({
                    type: 'object',
                    required: ['url'],
                    properties: { url: singleItemArray() },
                }),
                start_date: singleItemArray({
                    oneOf: [
                        {
                            type: 'object',
                            required: ['_'],
                            properties: {
                                _: { type: 'string' },
                            },
                        },
                        { type: 'string' },
                    ],
                }),
                completion_date: singleItemArray({
                    type: 'object',
                    required: ['_'],
                    properties: {
                        _: { type: 'string' },
                    },
                }),
                id_info: singleItemArray({
                    type: 'object',
                    required: ['nct_id'],
                    properties: { nct_id: singleItemArray({ pattern: '^NCT\\d+$' }) },
                }),
                official_title: singleItemArray(),
                phase: singleItemArray(),
                condition: {
                    type: 'array',
                    items: { type: 'string' },
                },
                intervention: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [
                            'intervention_type',
                            'intervention_name',
                        ],
                        properties: {
                            intervention_name: singleItemArray(),
                            intervention_type: singleItemArray(),
                        },
                    },
                },
                last_update_posted: singleItemArray({
                    type: 'object',
                    required: ['_'],
                    properties: { _: { type: 'string' } },
                }),
                location: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['facility'],
                        properties: {
                            facility: singleItemArray({
                                type: 'object',
                                required: ['address'],
                                properties: {
                                    address: singleItemArray({
                                        type: 'object',
                                        required: ['city', 'country'],
                                        properties: {
                                            city: singleItemArray(),
                                            country: singleItemArray(),
                                        },
                                    }),
                                },
                            }),
                        },
                    },
                },
            },
        },
    },
});


const standardizeDate = (dateString) => {
    const dateObj = new Date(Date.parse(dateString));
    const month = dateObj.getMonth() + 1 < 10
        ? `0${dateObj.getMonth() + 1}`
        : dateObj.getMonth() + 1;
    const date = dateObj.getDate() < 10
        ? `0${dateObj.getDate()}`
        : dateObj.getDate();
    return `${dateObj.getFullYear()}-${month}-${date}`;
};


/**
 * Given some records from the API, convert its form to a standard represention
 */
const convertAPIRecord = (rawRecord) => {
    checkSpec(validateAPITrialRecord, rawRecord, rec => rec.clinical_study.id_info[0].nct_id);
    const { clinical_study: record } = rawRecord;

    let startDate,
        completionDate;

    try {
        startDate = standardizeDate(record.start_date[0]._ || record.start_date[0]);
    } catch (err) {}

    try {
        completionDate = standardizeDate(record.completion_date[0]._);
    } catch (err) {}

    const content = {
        sourceId: record.id_info[0].nct_id[0],
        name: record.official_title[0],
        url: record.required_header[0].url[0],
        sourceIdVersion: standardizeDate(record.last_update_posted[0]._),
        diseases: record.condition,
        drugs: [],
        startDate,
        completionDate,
        locations: [],
    };

    if (record.phase) {
        content.phases = record.phase;
    }

    for (const { intervention_name: [name], intervention_type: [type] } of record.intervention || []) {
        if (type.toLowerCase() === 'drug' || type.toLowerCase() === 'biological') {
            content.drugs.push(name);
        }
    }

    for (const location of record.location || []) {
        const { facility: [{ address: [{ country: [country], city: [city] }] }] } = location;
        content.locations.push({ country: country.toLowerCase(), city: city.toLowerCase() });
    }
    return content;
};


/**
 * Convert the downloaded form to a standard form
 */
const convertDownloadedRecord = (record) => {
    checkSpec(validateDownloadedTrialRecord, record, rec => rec.nct_id[0]);
    const content = {
        phases: record.phases[0].phase || [],
        drugs: [],
        diseases: [],
        sourceId: record.nct_id[0],
        url: record.url[0],
        name: record.title[0],
        sourceIdVersion: standardizeDate(record.last_update_posted[0]),
    };

    for (const { _: name, type: [rawType] } of record.interventions[0].intervention) {
        const type = rawType.trim().toLowerCase();

        if (type === 'drug' || type === 'biological') {
            content.drugs.push(name);
        }
    }

    for (const raw of record.conditions[0].condition) {
        const disease = raw.trim().toLowerCase();
        content.diseases.push(disease);
    }
    return content;
};


const processPhases = (phaseList) => {
    const phases = [];

    for (const raw of phaseList || []) {
        const cleanedPhaseList = raw.trim().toLowerCase().replace(/\bn\/a\b/, '').split(/[,/]/);

        for (const phase of cleanedPhaseList) {
            if (phase !== '' && phase !== 'not applicable') {
                const match = /^(early )?phase (\d+)$/.exec(phase);

                if (!match) {
                    throw new Error(`unrecognized phase description (${phase})`);
                }
                phases.push(match[2]);
            }
        }
    }
    return phases.sort().join('/');
};


/**
 * Process the XML trial record. Attempt to link the drug and/or disease information
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the GraphKB connection object
 * @param {object} opt.record the XML record (pre-parsed into JSON)
 * @param {object|string} opt.source the 'source' record for clinicaltrials.gov
 */
const processRecord = async ({
    conn, record, source,
}) => {
    const content = {
        sourceId: record.sourceId,
        url: record.url,
        name: record.name,
        sourceIdVersion: record.sourceIdVersion,
        source: rid(source),
        displayName: record.sourceId.toUpperCase(),
    };
    const phase = processPhases(record.phases);

    if (phase) {
        content.phase = phase;
    }
    if (record.startDate) {
        content.startDate = record.startDate;
    }
    if (record.completionDate) {
        content.completionDate = record.completionDate;
    }
    // check if single location or at least single country
    let consensusCountry,
        consensusCity;

    for (const { city, country } of record.locations) {
        if (consensusCountry) {
            if (consensusCountry !== country.toLowerCase()) {
                consensusCountry = null;
                consensusCity = null;
                break;
            }
        } else {
            consensusCountry = country.toLowerCase();
        }
        if (consensusCity !== undefined) {
            if (consensusCity !== city.toLowerCase()) {
                consensusCity = null;
            }
        } else {
            consensusCity = city.toLowerCase();
        }
    }

    if (consensusCountry) {
        content.country = consensusCountry;

        if (consensusCity) {
            content.city = consensusCity;
        }
    }

    const links = [];

    for (const drug of record.drugs) {
        try {
            const intervention = await conn.getUniqueRecordBy({
                target: 'Therapy',
                filters: { name: drug },
                sort: orderPreferredOntologyTerms,
            });
            links.push(intervention);
        } catch (err) {
            logger.warn(`[${record.sourceId}] failed to find drug by name`);
            logger.warn(err);
        }
    }

    for (const diseaseName of record.diseases) {
        try {
            const disease = await conn.getUniqueRecordBy({
                target: 'Disease',
                filters: { name: diseaseName },
                sort: orderPreferredOntologyTerms,
            });
            links.push(disease);
        } catch (err) {
            logger.warn(`[${record.sourceId}] failed to find disease by name`);
            logger.warn(err);
        }
    }
    // create the clinical trial record
    const trialRecord = await conn.addRecord({
        target: 'ClinicalTrial',
        content,
        existsOk: true,
        fetchFirst: true,
        fetchConditions: convertRecordToQueryFilters(_.omit(content, ['sourceIdVersion'])), // if sourceIdVersion is the only thing different then don't update
    });

    // link to the drugs and diseases
    for (const link of links) {
        await conn.addRecord({
            target: 'ElementOf',
            content: { out: rid(link), in: rid(trialRecord), source: rid(source) },
            existsOk: true,
            fetchExisting: false,
        });
    }
    return trialRecord;
};


/**
 * Given some NCT ID, fetch and load the corresponding clinical trial information
 *
 * https://clinicaltrials.gov/ct2/show/NCT03478891?displayxml=true
 */
const fetchAndLoadById = async (conn, nctID) => {
    const url = `${BASE_URL}/${nctID}`;

    if (CACHE[nctID.toLowerCase()]) {
        return CACHE[nctID.toLowerCase()];
    }

    // try to get the record from the gkb db first
    try {
        const trial = await conn.getUniqueRecordBy({
            target: 'ClinicalTrial',
            filters: {
                AND: [
                    { source: { target: 'Source', filters: { name: SOURCE_DEFN.name } } },
                    { sourceId: nctID },
                ],
            },
            sort: orderPreferredOntologyTerms,
        });
        CACHE[trial.sourceId] = trial;
        return trial;
    } catch (err) {}
    logger.info(`loading: ${url}`);
    // fetch from the external api
    const resp = await requestWithRetry({
        method: 'GET',
        uri: url,
        qs: { displayxml: true },
        headers: { Accept: 'application/xml' },
        json: true,
    });
    const result = await parseXmlToJson(resp);

    // get or add the source
    if (!CACHE.source) {
        CACHE.source = rid(await conn.addRecord({
            target: 'Source',
            content: SOURCE_DEFN,
            existsOk: true,
        }));
    }
    const trial = await processRecord({
        conn,
        record: convertAPIRecord(result),
        source: CACHE.source,
    });
    CACHE[trial.sourceId] = trial;
    return trial;
};


/**
 * Uploads a file exported from clinicaltrials.gov as XML
 * @param {object} opt
 * @param {ApiConnection} opt.conn the GraphKB connection object
 * @param {string} opt.filename the path to the XML export
 */
const uploadFile = async ({ conn, filename }) => {
    logger.info(`loading: ${filename}`);
    const data = await loadXmlToJson(filename);
    const source = await conn.addRecord({
        target: 'Source',
        content: SOURCE_DEFN,
        fetchConditions: { name: SOURCE_DEFN.name },
        existsOk: true,
    });

    const { search_results: { study: records } } = data;
    logger.info(`loading ${records.length} records`);
    const counts = {
        success: 0, error: 0,
    };

    for (const record of records) {
        try {
            const stdContent = convertDownloadedRecord(record);
            await processRecord({
                conn, record: stdContent, source,
            });
            counts.success++;
        } catch (err) {
            logger.error(`[${record.nct_id[0]}] ${err}`);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = {
    uploadFile, SOURCE_DEFN, kb: true, fetchAndLoadById, convertAPIRecord,
};
