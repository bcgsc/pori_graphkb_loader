/* eslint-disable multiline-ternary */
/**
 * @module importer/oncokb
 *
 * Given some OncoKB input files (see README.md), upload the OncoKB statements into GraphKB
 *
 * Input files are validated as a whole instead of record-per-record
 * and there is some hardcoded fixes to the data (see data.js).
 *
 * Referenced ontologies (incl. biomarkers) are addressed first,
 * then OncoKB records are processed into statement's content,
 * then statements get uploaded|updated|deleted accordingly.
 */
const fs = require('fs');

const { getDataAndApplyFixes } = require('./data');
const {
    ACTIONABLE_RELEVANCE_TERMS,
    getEvidences,
    ontologyMappings,
    parseLevelIntoRelevanceTerm,
    vocabMapping,
} = require('./ontologies');
const { fetchPrevious, hashContentToSourceId, hashOncokbRecordToId } = require('./util');
const { logger } = require('../logging');
const { rid, shouldUpdate } = require('../graphkb');
const { oncokb: SOURCE_DEFN } = require('../sources');

/** @typedef {import('../graphkb').ApiConnection} ApiConnection */


const DEFAULT_REVIEW_STATUS = 'not required';


/**
 * Process an ACTIONABLE record into Statement(s) content
 *
 * If sensitivity|resistance to a therapy; one statement per drug or combination.
 * If diagnostic|prognostic of a disease; one statement.
 *
 * @param {object} opt
 * @param {object} opt.content the common content already processed
 * @param {object} opt.ontologies the ontology mappings object
 * @param {object} opt.record the record object
 * @param {object} opt.terms the relevance object for mapping actionable relevance terms to GraphKB
 * @returns {Array<object>}
 */
const processActionable = ({
    content: common,
    ontologies,
    record: r,
    terms = ACTIONABLE_RELEVANCE_TERMS,
}) => {
    const disease = ontologies.diseases.get(r.cancerType);
    const evidenceLevel = ontologies.evidenceLevels.get(r.level);
    const relevanceTerm = parseLevelIntoRelevanceTerm(r.level);
    const relevance = ontologies.relevances.get(relevanceTerm);

    if (!disease) {
        throw new Error(`cancerType ${r._original.cancerType} cannot be mapped to a disease record`);
    }
    if (!evidenceLevel || !relevance) {
        throw new Error(`level ${r._original.level} cannot be mapped to an evidenceLevel and/or a relevance record`);
    }

    const { comments, evidences } = getEvidences({ ontologies, record: r });
    const content = {
        ...common,
        comment: common.comment + comments,
        conditions: [...common.conditions, disease],
        evidence: evidences,
        evidenceLevel: [evidenceLevel],
        relevance,
    };
    const statements = [];

    if ([terms.sensitivity, terms.resistance].includes(relevanceTerm)) {
        // sensitivity|resistance to a therapy (drug)
        const drugs = r.drugs
            .split(',')
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean);

        if (drugs.length === 0) {
            throw new Error(`${relevanceTerm} records must have at least one parsable drug: ${r._original.drugs} `);
        }

        // one statement per drug or combination
        for (const drug of drugs) {
            const therapy = ontologies.therapies.get(drug);

            if (therapy) {
                statements.push({
                    ...JSON.parse(JSON.stringify(content)),
                    conditions: [...content.conditions, therapy],
                    subject: therapy,
                });
            } else {
                logger.warn(`Cannot map drug ${drug} to a Therapy record`);
            }
        }

        if (statements.length === 0) {
            throw new Error(`Cannot map any drugs ${r._original.drugs} from ${relevanceTerm} actionable record`);
        }
    } else if ([terms.diagnostic, terms.prognostic].includes(relevanceTerm)) {
        // diagnostic|prognostic of a disease
        statements.push({ ...content, subject: disease }); // disease already in conditions
    } else {
        // shouldn't happen...
        throw new Error(`relevance ${relevanceTerm} from level ${r._original.level} is not a supported actionable relevance`);
    }

    return statements;
};

/**
 * Process an ANNOTATED record into Statement(s) content
 *
 * One statement for oncogenicity-related relevance and/or one for mutation effects.
 * Oncogenicity refers to the biomarker, mutation effect refers to the gene.
 * No conditional disease and no evidenceLevel.
 *
 * @param {object} opt
 * @param {object} opt.content the common content already processed
 * @param {object} opt.ontologies the ontology mappings object
 * @param {object} opt.record the record object
 * @returns {Array<object>}
 */
const processAnnotated = ({ content: common, ontologies, record: r }) => {
    const oncogenicity = ontologies.relevances.get(r.oncogenicity);
    const mutationEffect = ontologies.relevances.get(r.mutationEffect);

    const statements = [];

    if (oncogenicity) {
        const { comments, evidences } = getEvidences({ ontologies, record: r }, true);
        statements.push({
            ...JSON.parse(JSON.stringify(common)),
            comment: common.comment + comments,
            evidence: evidences,
            relevance: oncogenicity,
            subject: common.conditions[0], // the biomarker
        });
    } else {
        logger.warn(`No support for oncogenicity: ${r._original.oncogenicity}`);
    }

    if (mutationEffect) {
        const { comments, evidences } = getEvidences({ ontologies, record: r });
        const gene = ontologies.genes.get(r.entrezGeneId);
        statements.push({
            ...JSON.parse(JSON.stringify(common)),
            comment: common.comment + comments,
            conditions: [...common.conditions, gene], // gene needed here
            evidence: evidences,
            relevance: mutationEffect,
            subject: gene,
        });
    } else {
        logger.warn(`No support for mutationEffect: ${r._original.mutationEffect}`);
    }

    return statements;
};

/**
 * Processes an individual OncoKB variant record (actionable or annotated)
 * and returns one or more ready-to-upload GraphKB Statement content
 *
 * Ontology mappings to GraphKB RIDs, incl. variants, are processed upstream.
 *
 * @param {object} opt
 * @param {object} opt.ontologies the ontology mappings object
 * @param {object} opt.record the record object
 * @param {string} [opt.reviewStatus=DEFAULT_REVIEW_STATUS] the default reviewStatus for new Statements
 * @param {object} opt.type the record type (actionable|annotated)
 * @returns {Map<string, string>}
 */
const processRecord = ({
    ontologies,
    record: r,
    reviewStatus = DEFAULT_REVIEW_STATUS,
    type,
}) => {
    const id = hashOncokbRecordToId(r); // for variants lookup only

    if (!ontologies.variants.has(id) || ontologies.variants.get(id) === undefined) {
        throw new Error(`No supported biomarker for ${type} record: { gene: "${r._original.gene}", proteinChange: "${r._original.proteinChange}", variant: "${r._original.variant}" }`);
    }

    const content = {
        comment: r._comments || '',
        conditions: [ontologies.variants.get(id)],
        description: r.description,
        reviewStatus,
        source: rid(ontologies.source),
    };
    const statements = type === 'actionable'
        ? processActionable({ content, ontologies, record: r })
        : processAnnotated({ content, ontologies, record: r });

    return new Map([
        ...statements
            .map((c) => ({ ...c, sourceId: hashContentToSourceId(c) }))
            .map((c) => [c.sourceId, c]),
    ]);
};

/**
 * Given some OncoKB input files (see README.md),
 * upload the OncoKB records as Statements into GraphKB.
 * Some missing referenced ontology records may also be uploaded as needed.
 *
 * To save time and ressources, already acquired Ensembl versions can be fetched/saved
 * from/to a file (opt.ensemblVersions).
 *
 * Variants referencing GRCh37-linked Ensembl transcripts can be recoded to GRCh38:
 * - 'optimistic' recoding keeps original cds/protein notations when recoding fails
 * - 'pessimistic' recoding discard a notation when the recoding fails
 * - 'no' recoding (default) keeps the original GRCh37 notation as-is.
 *
 * Attention!
 * - Make sure all the relevant ontology loaders has been run recently
 * - Make sure the graphkb-parser depedency is up-to-date
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the GraphKB api connection object
 * @param {boolean} [opt.deleteDeprecated=false] if deleting deprecated OncoKB records
 * @param {string} [opt.ensemblVersions='ensembl.json'] the filepath to the stored Ensembl version json file
 * @param {string} [opt.errorLogPrefix] prefix to use for module specific log files
 * @param {string} opt.filename the directory path of the OncoKB input files
 * @param {boolean} [opt.ignoreCache=false] do not check for previously loaded statements
 * @param {number} [opt.maxRecords] maximum number of statement records to upload
 * @param {string} [opt.recode='no'] for recoding variants from GRCh37 to GRCH38
 */
const uploadFile = async ({ conn, filename: dirpath, ...opt }) => {
    const errorList = [];
    const counts = {
        errors: 0,
        existing: 0,
        skip: 0,
        success: 0,
    };

    // OPTIONS
    const {
        deleteDeprecated,
        ensemblVersions,
        errorLogPrefix,
        ignoreCache,
        maxRecords,
        recode,
    } = opt;

    if (!ignoreCache) {
        logger.warn('ignoreCache is set to false; existing records will be updated when needed');
    } else {
        logger.warn('ignoreCache is set to true; existing records will NOT be considered. NO updates NO deletions.');

        if (deleteDeprecated) {
            logger.warn('--deleteDeprecated is ignored when --ignoreCache is set to true');
        }
    }
    if (!ignoreCache && deleteDeprecated) {
        logger.warn('deleteDeprecated is set to true; deprecated OncoKB statements will be deleted');
    } else if (!deleteDeprecated) {
        logger.warn('deleteDeprecated is set to false; deprecated OncoKB statements will NOT be deleted');
    }
    logger.warn(`Variant recoding strategy: ${recode.toUpperCase()} recoding.`);

    // DATA
    const source = await conn.addSource(SOURCE_DEFN);
    const previous = !ignoreCache ? await fetchPrevious({ conn, source }) : new Map();
    const data = getDataAndApplyFixes(dirpath);

    // ONTOLOGIES, incl. VARIANTS/BIOMARKERS
    const ontologies = await ontologyMappings({
        conn, data, ensemblVersions, recode, source,
    });

    // PROCESSING RECORDS INTO STATEMENTS CONTENT
    logger.info('\n\n** PROCESSING ONCOKB RECORDS **');
    const statements = new Map();

    for (const type of ['actionable', 'annotated']) {
        logger.info(`\nProcessing ${data[type].length} ${type.toUpperCase()} variant records...`);

        for (const record of data[type]) {
            if (maxRecords && statements.size >= maxRecords) {
                logger.info(`Reached maxRecords limit (${maxRecords})`);
                counts.skip += (record.length - maxRecords);
                break;
            }

            try {
                const stms = processRecord({ ontologies, record, type });

                if (stms.size > 0) {
                    stms.forEach((content, sourceId) => statements.set(sourceId, content));
                } else {
                    logger.warn(`Skipping record: ${JSON.stringify(record._original)}`);
                    counts.skip++;
                }
            } catch (err) {
                logger.error(err.toString());
                counts.errors++;
                errorList.push({
                    ...record,
                    error: err.error || err,
                    errorMessage: err.toString(),
                });
            }
        }
    }

    // UPLOADS
    const uploads = new Map([...statements].filter(([sourceId]) => !previous.has(sourceId)));
    logger.info('\n\n** CREATE **');
    logger.info(`Uploading ${uploads.size} new Statement records...`);

    // for logging purposes only, to keep track of the uploaded records per relevance term
    const vocab = await vocabMapping(conn);
    const uploaded = {};

    for (const [sourceId, content] of uploads) {
        try {
            const newRecord = await conn.addRecord({
                content,
                existsOk: !!ignoreCache,
                fetchExisting: !!ignoreCache,
                target: 'Statement',
            });
            logger.info(`Succesfully uploaded Statement ${sourceId} (${rid(newRecord)})`);
            counts.success++;
            // count per relevance
            const relevance = String(vocab.get(content.relevance));
            uploaded[relevance] = (uploaded[relevance] || 0) + 1;
        } catch (err) {
            logger.error(`Unexpected error while uploading Statement ${sourceId} (${JSON.stringify(content)}): ${err.toString()}`);
            counts.errors++;
            errorList.push({
                ...content,
                error: err.error || err,
                errorMessage: err.toString(),
            });
        }
    }
    logger.info('Uploaded records per relevance term:');

    for (const [relevance, count] of Object.entries(uploaded)
        .sort(([, a], [, b]) => b - a)) { // DESC count
        logger.info(`- ${relevance}: ${count}`);
    }

    // UPDATES
    logger.info('\n\n** UPDATE **');
    const updates = new Map([...statements].filter(([sourceId]) => previous.has(sourceId)));

    if (!ignoreCache) {
        logger.info(`Checking for updates on ${updates.size} existing Statement records...`);

        for (const [sourceId, content] of updates) {
            try {
                const existing = previous.get(sourceId);

                if (shouldUpdate('Statement', existing, content)) {
                    await conn.updateRecord('Statement', rid(existing), content);
                    logger.info(`Succesfully updated existing Statement ${sourceId} (${rid(existing)})`);
                    counts.success++;
                } else {
                    counts.existing++;
                }
            } catch (err) {
                logger.error(`Unexpected error while updating Statement ${sourceId} (${JSON.stringify(content)}): ${err}`);
                counts.errors++;
                errorList.push({
                    ...content,
                    error: err.error || err,
                    errorMessage: err.toString(),
                });
            }
        }
    } else {
        logger.warn('NOT updating existing Statement records');
    }

    // DELETIONS
    logger.info('\n\n** DELETE **');
    const deletions = new Map([...previous].filter(([sourceId]) => !statements.has(sourceId)));

    if (deleteDeprecated) {
        logger.info(`Deleting ${deletions.size} deprecated Statement records...`);

        for (const [sourceId, record] of deletions) {
            try {
                const deleted = await conn.deleteRecord('Statement', rid(record));
                logger.info(`Succesfully deleted deprecated Statement ${sourceId} (${rid(deleted)})`);
                // counts.success++;
            } catch (err) {
                logger.error(`Unexpected error while deleting Statement ${sourceId} (${rid(record)}): ${err}`);
                counts.errors++;
                errorList.push({
                    error: err.error || err,
                    errorMessage: err.toString(),
                    rid: rid(record),
                });
            }
        }
    } else {
        logger.warn(`NOT deleting ${deletions.size} deprecated Statement records`);

        if ((deletions.size > 0)) {
            const deletionsOutput = `${errorLogPrefix}-deletions-oncokb.json`;
            logger.info(`writing deletion sourceId to ${deletionsOutput}`);
            fs.writeFileSync(
                deletionsOutput,
                JSON.stringify({ sourceId: [...deletions.keys()] }, null, 2),
            );
        }
    }

    // OUTPUT
    logger.info('\n\n** END OF SCRIPT **');
    const errorOutput = `${errorLogPrefix}-oncokb.json`;
    logger.info(`writing errors to ${errorOutput}`);
    fs.writeFileSync(errorOutput, JSON.stringify({ records: errorList }, null, 2));
    logger.info(`GraphKB records processed: ${JSON.stringify(counts)}`);
};

module.exports = {
    DEFAULT_REVIEW_STATUS,
    SOURCE_DEFN,
    processActionable,
    processAnnotated,
    processRecord,
    uploadFile,
};
