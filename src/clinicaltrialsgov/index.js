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
const path = require('path');
const Ajv = require('ajv');
const fs = require('fs');

const {
    loadXmlToJson,
    parseXmlToJson,
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
const RSS_URL = 'https://clinicaltrials.gov/ct2/results/rss.xml';
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
            content.locations.push({ city: city.toLowerCase(), country: country.toLowerCase() });
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
 * Process the XML trial record. Attempt to link the drug and/or disease information
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the GraphKB connection object
 * @param {object} opt.record the XML record (pre-parsed into JSON)
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

/**
 * Uploads a file exported from clinicaltrials.gov as XML
 * @param {object} opt
 * @param {ApiConnection} opt.conn the GraphKB connection object
 * @param {string} opt.filename the path to the XML export
 */
const uploadFiles = async ({ conn, files }) => {
    const source = await conn.addSource(SOURCE_DEFN);

    logger.info(`loading ${files.length} records`);
    const counts = {
        error: 0, success: 0,
    };

    for (const filepath of files) {
        const filename = path.basename(filepath);

        if (!filename.endsWith('.xml')) {
            logger.warn(`ignoring non-xml file: ${filename}`);
            continue;
        }

        try {
            const xml = await loadXmlToJson(filepath);
            const record = convertAPIRecord(xml);
            await processRecord({
                conn, record, source, upsert: true,
            });
            counts.success++;
        } catch (err) {
            logger.error(`[${filename}] ${err}`);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};


/**
 * Parses clinical trial RSS Feed results for clinical trials in Canada and the US
 * which were updated in the last 2 weeks
 */
const loadNewTrials = async ({ conn }) => {
    // ping them both to get the list of recently updated trials
    const recentlyUpdatedTrials = [];

    const resp = await requestWithRetry({
        method: 'GET',
        qs: {
            cond: 'cancer', // cancer related trials
            count: 10000,
            lup_d: 14,
            rcv_d: '',
            recrs: 'abdef',
            sel_rss: 'mod14', // mod14 for last 2 weeks updated
            type: 'Intr', // interventional only
        },
        uri: RSS_URL,
    });
    const xml = await parseXmlToJson(resp);
    fs.writeFileSync('output.json', JSON.stringify(xml, null, 2));
    checkSpec(validateRssFeed, xml);
    recentlyUpdatedTrials.push(
        ...xml.rss.channel[0].item.map(item => item.guid[0]._),
    );

    logger.info(`loading ${recentlyUpdatedTrials.length} recently updated trials`);
    const counts = { error: 0, success: 0 };

    for (const trialId of recentlyUpdatedTrials) {
        try {
            await fetchAndLoadById(conn, trialId, { upsert: true });
            counts.success++;
        } catch (err) {
            counts.error++;
            logger.error(`[${trialId}] ${err}`);
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = {
    SOURCE_DEFN,
    convertAPIRecord,
    fetchAndLoadById,
    kb: true,
    upload: loadNewTrials,
    uploadFiles,
};
