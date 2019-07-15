/**
 * Module to import clinical trials data exported from clinicaltrials.gov
 *
 * 1. Perform a search on their site, for example https://clinicaltrials.gov/ct2/results?recrs=ab&cond=Cancer&term=&cntry=CA&state=&city=&dist=
 * 2. Click their Download link/Button
 * 3. Adjust the settings in the Pop up dialog (Include all studies, all columns, and export as XML)
 * 4. Download and save the file
 * 5. Upload the file to GraphKB using this module
 *
 * @module importer/clinicaltrialsgov
 */
const Ajv = require('ajv');
const {
    loadXmlToJson, preferredDrugs, preferredDiseases, rid
} = require('./util');
const {logger} = require('./logging');

const SOURCE_DEFN = {
    name: 'clinicaltrials.gov',
    url: 'https://clinicaltrials.gov',
    usage: 'https://clinicaltrials.gov/ct2/about-site/terms-conditions#Use',
    description: 'ClinicalTrials.gov is a database of privately and publicly funded clinical studies conducted around the world'
};

const ajv = new Ajv();


const singleItemArray = (spec = {}) => ({
    type: 'array', maxItems: 1, minItems: 1, items: {type: 'string', ...spec}
});

const validateTrialRecord = ajv.compile({
    type: 'object',
    required: ['nct_id', 'title', 'last_update_posted', 'url', 'phases', 'interventions', 'conditions'],
    properties: {
        nct_id: singleItemArray({pattern: '^NCT\\d+$'}),
        title: singleItemArray(),
        url: singleItemArray(),
        last_update_posted: singleItemArray(),
        phases: singleItemArray({
            type: 'object',
            required: ['phase'],
            properties: {
                phase: {type: 'array', minItems: 1, items: {type: 'string'}}
            }
        }),
        conditions: singleItemArray({
            type: 'object',
            required: ['condition'],
            properties: {
                condition: {type: 'array', minItems: 1, items: {type: 'string'}}
            }
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
                            _: {type: 'string'},
                            type: singleItemArray()
                        }
                    }
                }
            }
        })
    }
});


/**
 * Process the XML trial record. Attempt to link the drug and/or disease information
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the GraphKB connection object
 * @param {object} opt.record the XML record (pre-parsed into JSON)
 * @param {object|string} opt.source the 'source' record for clinicaltrials.gov
 */
const processRecord = async ({
    conn, record, source
}) => {
    const content = {
        sourceId: record.nct_id[0],
        url: record.url[0],
        name: record.title[0],
        sourceIdVersion: record.last_update_posted[0],
        source: rid(source)
    };
    const phases = [];
    for (const raw of record.phases[0].phase || []) {
        const phase = raw.trim().toLowerCase();
        if (phase !== 'not applicable') {
            const match = /^(early )?phase (\d+)$/.exec(phase);
            if (!match) {
                throw new Error(`unrecognized phase description (${phase})`);
            }
            phases.push(match[2]);
        }
    }
    if (phases.length) {
        content.phase = phases.sort().join('/');
    }
    const links = [];
    for (const raw of record.interventions[0].intervention) {
        const {_: name, type} = raw;
        if (type[0].trim().toLowerCase() === 'drug') {
            try {
                const intervention = await conn.getUniqueRecordBy({
                    endpoint: 'therapies',
                    where: {name},
                    sort: preferredDrugs
                });
                links.push(intervention);
            } catch (err) {
                logger.error(`[${record.nct_id[0]}] failed to find drug by name`);
                logger.error(err);
            }
        }
    }
    for (const raw of record.conditions[0].condition) {
        let disease = raw.trim().toLowerCase();
        try {
            disease = await conn.getUniqueRecordBy({
                endpoint: 'diseases',
                where: {name: disease},
                sort: preferredDiseases
            });
            links.push(disease);
        } catch (err) {
            logger.error(`[${record.nct_id[0]}] failed to find disease by name`);
            logger.error(err);
        }
    }
    // create the clinical trial record
    const trialRecord = await conn.addRecord({
        endpoint: 'clinicaltrials',
        content,
        existsOk: true
    });

    // link to the drugs and diseases
    for (const link of links) {
        await conn.addRecord({
            endpoint: 'elementof',
            content: {out: rid(link), in: rid(trialRecord), source: rid(source)},
            existsOk: true,
            fetchExisting: false
        });
    }
};


/**
 * Uploads a file exported from clinicaltrials.gov as XML
 * @param {object} opt
 * @param {ApiConnection} opt.conn the GraphKB connection object
 * @param {string} opt.filename the path to the XML export
 */
const uploadFile = async ({conn, filename}) => {
    logger.info(`loading: ${filename}`);
    const data = await loadXmlToJson(filename);
    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        fetchConditions: {name: SOURCE_DEFN.name},
        existsOk: true
    });

    const {search_results: {study: records}} = data;
    logger.info(`loading ${records.length} records`);
    const counts = {
        success: 0, error: 0
    };
    for (const record of records) {
        try {
            await processRecord({
                conn, record, source
            });
            counts.success++;
        } catch (err) {
            logger.error(`[${record.nct_id[0]}] ${err}`);
            console.error(err);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = {uploadFile, SOURCE_DEFN, type: 'kb'};
