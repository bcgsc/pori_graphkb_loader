/**
 * Module to import active clinical trials from clinicaltrials.gov
 *
 * Use their REST API to retrieve XML data and download it, then upload it here
 */

const {
    loadXmlToJson, preferredDrugs, preferredDiseases, rid
} = require('./util');
const {logger} = require('./logging');

const SEARCH_URL = 'https://clinicaltrials.gov/ct2/results?displayxml=true&type=Intr&recrs=ab&cond=cancer&cntry=CA';


/**
 * Process the XML trial record. Attempt to link the drug and/or disease information
 */
const processRecord = async ({
    conn, record, source, counts
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
        const {_: name, $: {type}} = raw;
        if (type.trim().toLowerCase() === 'drug') {
            try {
                const intervention = await conn.getUniqueRecordBy({
                    endpoint: 'therapies',
                    where: {name},
                    sort: preferredDrugs
                });
                links.push(intervention);
            } catch (err) {
                counts.drugErrors.add(name);
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
            counts.diseaseErrors.add(disease);
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


const uploadFile = async ({conn, filename}) => {
    logger.info(`loading: ${filename}`);
    const data = await loadXmlToJson(filename);
    const source = await conn.addRecord({
        endpoint: 'sources',
        content: {
            name: 'clinicaltrials.gov',
            url: 'https://clinicaltrials.gov',
            usage: 'https://clinicaltrials.gov/ct2/about-site/terms-conditions#Use',
            description: 'ClinicalTrials.gov is a database of privately and publicly funded clinical studies conducted around the world'
        },
        fetchConditions: {name: 'clinicaltrials.gov'},
        existsOk: true
    });

    const {search_results: {study: records}} = data;
    logger.info(`loading ${records.length} records`);
    const counts = {
        sucess: 0, error: 0, drugErrors: new Set(), diseaseErrors: new Set()
    };
    for (const record of records) {
        try {
            await processRecord({
                conn, record, source, counts
            });
            counts.sucess++;
        } catch (err) {
            logger.error(`[${record.nct_id[0]}] ${err}`);
            console.error(err);
            counts.error++;
        }
    }
    counts.diseaseErrors = counts.diseaseErrors.size;
    counts.drugErrors = counts.drugErrors.size;
    logger.info(JSON.stringify(counts));
};

module.exports = {uploadFile};
