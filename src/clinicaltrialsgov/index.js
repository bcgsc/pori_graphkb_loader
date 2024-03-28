/**
 * Module to import clinical trials data exported from clinicaltrials.gov
 * @module importer/clinicaltrialsgov
 */
const path = require('path');
const Ajv = require('ajv');

const {
    checkSpec,
    requestWithRetry,
} = require('../util');
const {
    orderPreferredOntologyTerms,
    rid,
} = require('../graphkb');
const { logger } = require('../logging');
const { clinicalTrialsGov: SOURCE_DEFN } = require('../sources');
const { api: apiSpec, rss: rssSpec } = require('./specs.json');

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';
const CACHE = {};

const ajv = new Ajv();
const validateAPITrialRecord = ajv.compile(apiSpec);
const validateRssFeed = ajv.compile(rssSpec);


/**
 * Given some records from the API, convert its form to a standard represention
 */
const convertAPIRecord = (rawRecord) => {
    checkSpec(validateAPITrialRecord, rawRecord, rec => rec.protocolSection.identificationModule.nctId);

    const { protocolSection: record } = rawRecord;
    let startDate,
        completionDate;


    try {
        startDate = record.statusModule.startDateStruct.date;
    } catch (err) {}

    try {
        completionDate = record.statusModule.completionDateStruct.date;
    } catch (err) {}

    const title = record.identificationModule.officialTitle || record.identificationModule.briefTitle;

    const { nctId } = record.identificationModule;
    const url = `${BASE_URL}/${nctId}`;

    const content = {
        completionDate,
        diseases: record.conditionsModule.conditions,
        displayName: title,
        drugs: [],
        locations: [],
        name: title,
        recruitmentStatus: record.statusModule.overallStatus,
        sourceId: nctId,
        sourceIdVersion: record.statusModule.lastUpdatePostDateStruct.date,
        startDate,
        url,
    };

    if (record.designModule.phases) {
        content.phases = record.designModule.phases;
    }

    for (const { name, type } of record.armsInterventionsModule.interventions || []) {
        if (type.toLowerCase() === 'drug' || type.toLowerCase() === 'biological') {
            content.drugs.push(name);
        }
    }

    if (record.contactsLocationsModule) {
        for (const { country, city } of record.contactsLocationsModule.locations || []) {
            if (city && country) {
                content.locations.push({ city: city.toLowerCase(), country: country.toLowerCase() });
            }
            if (city && !country) {
                content.locations.push({ city: city.toLowerCase() });
            }
            if (!city && country) {
                content.locations.push({ country: country.toLowerCase() });
            }
        }
    }

    return content;
};


const processPhases = (phaseList) => {
    const phases = [];

    for (const raw of phaseList || []) {
        const cleanedPhaseList = raw.trim().toLowerCase().replace(/\bn\/a\b/, '').split(/[,/]/);

        for (const phase of cleanedPhaseList) {
            if (phase !== '' && phase !== 'na' && phase !== 'ph') {
                const match = /^(early_)?phase(\d+)$/.exec(phase);

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
 * Process the record. Attempt to link the drug and/or disease information
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the GraphKB connection object
 * @param {object} opt.record the record (pre-parsed into JSON)
 * @param {object|string} opt.source the 'source' record for clinicaltrials.gov
 *
 * @todo: handle updates to existing clinical trial records
 */
const processRecord = async ({
    conn, record, source, upsert = false,
}) => {
    const content = {
        displayName: record.displayName,
        name: record.name,
        recruitmentStatus: record.recruitmentStatus.replace(/_/g, ' '),
        source: rid(source),
        sourceId: record.sourceId,
        sourceIdVersion: record.sourceIdVersion,
        url: record.url,
    };

    // temperory mapping to avoid schema change
    if (content.recruitmentStatus && content.recruitmentStatus.toLowerCase() === 'active not recruiting') {
        content.recruitmentStatus = 'active, not recruiting';
    }

    if (content.recruitmentStatus && content.recruitmentStatus.toLowerCase() === 'unknown status') {
        content.recruitmentStatus = 'unknown';
    }
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
        if (country && consensusCountry) {
            if (consensusCountry !== country.toLowerCase()) {
                consensusCountry = null;
                consensusCity = null;
                break;
            }
        } else if (country) {
            consensusCountry = country.toLowerCase();
        }
        if (city && consensusCity) {
            if (consensusCity !== city.toLowerCase()) {
                consensusCity = null;
            }
        } else if (city) {
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
    const missingLinks = [];

    for (const drug of record.drugs) {
        try {
            const intervention = await conn.getUniqueRecordBy({
                filters: { name: drug },
                sort: orderPreferredOntologyTerms,
                target: 'Therapy',
            });
            links.push(intervention);
        } catch (err) {
            logger.warn(`[${record.sourceId}] failed to find drug by name`);
            logger.warn(err);
            missingLinks.push(`Therapy(${drug})`);
        }
    }


    for (const diseaseName of record.diseases) {
        try {
            const disease = await conn.getUniqueRecordBy({
                filters: { name: diseaseName },
                sort: orderPreferredOntologyTerms,
                target: 'Disease',
            });
            links.push(disease);
        } catch (err) {
            logger.warn(`[${record.sourceId}] failed to find disease by name`);
            logger.warn(err);
            missingLinks.push(`Disease(${diseaseName})`);
        }
    }

    if (missingLinks.length) {
        content.comment = `Missing: ${missingLinks.join('; ')}`;
    }
    // create the clinical trial record
    const trialRecord = await conn.addRecord({
        content,
        existsOk: true,
        fetchConditions: { AND: [{ source: rid(source) }, { sourceId: record.sourceId }] },
        fetchFirst: true,
        target: 'ClinicalTrial',
        upsert,
    });

    // link to the drugs and diseases
    for (const link of links) {
        await conn.addRecord({
            content: { in: rid(trialRecord), out: rid(link), source: rid(source) },
            existsOk: true,
            fetchExisting: false,
            target: 'ElementOf',
        });
    }
    return trialRecord;
};


/**
 * Given some NCT ID, fetch and load the corresponding clinical trial information
 *
 * https://clinicaltrials.gov/api/v2/studies/NCT03478891
 */
const fetchAndLoadById = async (conn, nctID, { upsert = false } = {}) => {
    const url = `${BASE_URL}/${nctID}`;

    if (CACHE[nctID.toLowerCase()]) {
        return CACHE[nctID.toLowerCase()];
    }

    // try to get the record from the gkb db first
    try {
        const trial = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { source: { filters: { name: SOURCE_DEFN.name }, target: 'Source' } },
                    { sourceId: nctID },
                ],
            },
            sort: orderPreferredOntologyTerms,
            target: 'ClinicalTrial',
        });
        CACHE[trial.sourceId] = trial;
        return trial;
    } catch (err) {}
    logger.info(`loading: ${url}`);
    // fetch from the external api
    const result = await requestWithRetry({
        json: true,
        method: 'GET',
        uri: url,
    });

    // get or add the source
    if (!CACHE.source) {
        CACHE.source = rid(await conn.addSource(SOURCE_DEFN));
    }
    const trial = await processRecord({
        conn,
        record: convertAPIRecord(result),
        source: CACHE.source,
        upsert,
    });
    CACHE[trial.sourceId] = trial;
    return trial;
};

const formatDate  = (date) => {
    return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
}

/**
 * Loading all clinical trials related to cancer
 */
const upload = async ({ conn, maxRecords, days }) => {
    const source = await conn.addSource(SOURCE_DEFN);

    let options = {};

    if (days) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        options = {'query.term': `AREA[LastUpdatePostDate]RANGE[${formatDate(startDate)},MAX]`};
        logger.info(`loading records updated from ${formatDate(startDate)} to ${formatDate(new Date())}`);
    }

    let trials = await requestWithRetry({
        json: true,
        method: 'GET',
        qs: {
            aggFilters: 'studyType:int',
            countTotal: true,
            pageSize: 1000,
            sort: 'LastUpdatePostDate',
            'query.cond': 'cancer',
            ...options
        },
        uri: BASE_URL,
    });


    logger.info(`loading ${trials.totalCount} records`);
    const counts = {
        error: 0, success: 0,
    };

    let processCount = 1,
        total;
        
    if (maxRecords) {
        total = maxRecords;
    } else {
        total = trials.totalCount;
    }

    for (const trial of trials.studies) {
        if (processCount > total) {
            break;
        }
        try {
            const record = convertAPIRecord(trial);
            logger.info(`processing (${processCount++}/${total}) record: ${record.sourceId}`);
            await processRecord({
                conn, record, source, upsert: true,
            });
            counts.success++;
        } catch (err) {
            counts.error++;
            logger.error(`[${trial}] ${err}`);
        }
    }

    let next = trials.nextPageToken;

    while (next) {
        if (processCount > total) {
            break;
        }
        trials = await requestWithRetry({
            json: true,
            method: 'GET',
            qs: {
                aggFilters: 'studyType:int',
                countTotal: true,
                pageSize: 1000,
                pageToken: next,
                sort: 'LastUpdatePostDate',
                'query.cond': 'cancer',
                ...options
            },
            uri: BASE_URL,
        });

        for (const trial of trials.studies) {
            if (processCount > total) {
                break;
            }
            try {
                const record = convertAPIRecord(trial);
                logger.info(`processing (${processCount++}/${total}) record: ${record.sourceId}`);
                await processRecord({
                    conn, record, source, upsert: true,
                });
                counts.success++;
            } catch (err) {
                counts.error++;
                logger.error(`[${trial}] ${err}`);
            }
        }

        next = trials.nextPageToken;
    }
    logger.info(JSON.stringify(counts));
};

module.exports = {
    SOURCE_DEFN,
    convertAPIRecord,
    fetchAndLoadById,
    kb: true,
    upload,
};
