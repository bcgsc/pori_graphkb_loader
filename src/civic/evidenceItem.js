const fs = require('fs');
const path = require('path');

const _ = require('lodash');
const Ajv = require('ajv');
//const { error: { ErrorMixin } } = require('@bcgsc-pori/graphkb-parser');
const { ParsingError, ErrorMixin, InputValidationError } = require('@bcgsc-pori/graphkb-parser');
const { checkSpec, request } = require('../util');
const { logger } = require('../logging');
const { civic: SOURCE_DEFN } = require('../sources');
const { EvidenceItem: evidenceSpec } = require('./specs.json');
const _entrezGene = require('../entrez/gene');
const { processVariantRecord } = require('./variant');
const { processMolecularProfile } = require('./profile');
const { addOrFetchTherapy, resolveTherapies } = require('./therapy');
const { rid } = require('../graphkb');


class NotImplementedError extends ErrorMixin { }

// Spec compiler
const ajv = new Ajv();
const validateEvidenceSpec = ajv.compile(evidenceSpec);

/**
 * Requests evidence items from CIViC using their graphql API
 *
 * @param {string} url the query url
 * @param {object} opt the query options
 * @returns {object[]} an array of EvidenceItem records
 */
const requestEvidenceItems = async (url, opt) => {
    const body = { ...opt };
    const allRecords = [];
    let hasNextPage = true;

    while (hasNextPage) {
        try {
            const page = await request({
                body,
                json: true,
                method: 'POST',
                uri: url,
            });
            allRecords.push(...page.data.evidenceItems.nodes);
            body.variables = {
                ...body.variables,
                after: page.data.evidenceItems.pageInfo.endCursor,
            };
            hasNextPage = page.data.evidenceItems.pageInfo.hasNextPage;
        } catch (err) {
            logger.error(err);
            throw (err);
        }
    }
    return allRecords;
};

/**
 * Fetch CIViC approved evidence entries
 * as well as those submitted by trusted curators
 *
 * @param {string} url the url for the request
 * @param {string[]} trustedCurators a list of curator IDs for submitted-only EvidenceItems
 * @returns {object} an object with the validated records and the encountered errors
 */
const downloadEvidenceItems = async (url, trustedCurators) => {
    const evidenceItems = [];
    const query = fs.readFileSync(path.join(__dirname, 'evidenceItems.graphql')).toString();

    // Get accepted evidenceItems
    const accepted = await requestEvidenceItems(url, {
        query,
        variables: {
            status: 'ACCEPTED',
        },
    });
    logger.info(`${accepted.length} accepted entries from ${SOURCE_DEFN.name}`);
    evidenceItems.push(...accepted);

    // Get submitted evidenceItems from trusted curators
    for (const curator of Array.from(new Set(trustedCurators))) {
        if (!Number.isNaN(curator)) {
            const submittedByATrustedCurator = await requestEvidenceItems(url, {
                query,
                variables: {
                    status: 'SUBMITTED',
                    userId: parseInt(curator, 10),
                },
            });
            evidenceItems.push(...submittedByATrustedCurator);
            logger.info(`${submittedByATrustedCurator.length} submitted entries by trusted curator ${curator} from ${SOURCE_DEFN.name}`);
        }
    }

    logger.info(`${evidenceItems.length} total records from ${SOURCE_DEFN.name}`);

    // Validation
    const validatedRecords = [],
        errors = [];

    for (const record of evidenceItems) {
        try {
            checkSpec(validateEvidenceSpec, record);
        } catch (err) {
            errors.push({ error: err, errorMessage: err.toString(), record });
            logger.error(err);
            continue;
        }
        validatedRecords.push(record);
    }

    logger.info(`${validatedRecords.length}/${evidenceItems.length} validated records`);
    return { errors, records: validatedRecords };
};

/**
 * Format one combination from a CIViC EvidenceItem into an object
 * ready to be compared with a corresponding GraphKB statement
 *
 * @param {ApiConnection} conn the API connection object for GraphKB
 * @param {object} param1
 * @param {object} param1.record the unparsed record from CIViC
 * @param {object} param1.sourceRid the souce rid for CIViC in GraphKB
 * @returns {object} the formatted content from one combination
 */
const processCombination = async (conn, {
    record: rawRecord,
    sourceRid,
}) => {
    /*
        PROCESSING EVIDENCEITEM DATA SPECIFIC TO THAT COMBINATION/STATEMENT
    */

    // THERAPY
    // Get corresponding GraphKB Therapies
    let therapy;

    if (rawRecord.therapies) {
        try {
            therapy = await addOrFetchTherapy(
                conn,
                sourceRid,
                rawRecord.therapies, // therapiesRecords
                (rawRecord.therapyInteractionType || '').toLowerCase(), // combinationType
            );
        } catch (err) {
            throw new Error(`failed to fetch therapy: ${JSON.stringify(rawRecord.therapies)}\nerr:${err}`);
        }
    }

    // VARIANTS
    // Note: the combination can have more than 1 variant
    // if the Molecular profile was using AND operators
    const { variants: civicVariants } = rawRecord;
    const variants = [];

    for (const variant of civicVariants) {
        // Variant's Feature
        const { feature: { featureInstance } } = variant;

        // TODO: Deal with __typename === 'Factor'. No actual case as April 22nd, 2024
        if (featureInstance.__typename !== 'Gene') {
            throw new NotImplementedError(
                'unable to process variant\'s feature of type other than Gene (e.g. Factor)',
            );
        }

        let feature;

        try {
            [feature] = await _entrezGene.fetchAndLoadByIds(conn, [featureInstance.entrezId]);
        } catch (err) {
            logger.error(`failed to fetch variant's feature: ${featureInstance.entrezId}`);
            throw err;
        }

        // Variant
        try {
            const processedVariants = await processVariantRecord(conn, variant, feature);
            logger.verbose(`converted variant name (${variant.name}) to variants (${processedVariants.map(v => v.displayName).join(', and ')})`);
            variants.push(...processedVariants);
        } catch (err) {
            logger.error(`unable to process the variant (id=${rawRecord.variant.id}, name=${rawRecord.variant.name})`);
            throw err;
        }
    }

    /*
        FORMATTING CONTENT FOR GRAPHKB STATEMENT
    */

    const { content } = rawRecord;

    // SUBJECT
    // Adding Disease as subject
    if (rawRecord.evidenceType === 'DIAGNOSTIC' || rawRecord.evidenceType === 'PREDISPOSING') {
        if (!content.disease) {
            throw new Error('unable to create a diagnostic or predisposing statement without a corresponding disease');
        }
        content.subject = content.disease;
    }

    // Adding Therapy as subject
    if (rawRecord.evidenceType === 'PREDICTIVE' && therapy) {
        content.subject = rid(therapy);
    }

    // Adding 'patient' Vocabulary as subject
    if (rawRecord.evidenceType === 'PROGNOSTIC') {
        try {
            content.subject = rid(
                // get the patient vocabulary object
                await conn.getVocabularyTerm('patient'),
            );
        } catch (err) {
            logger.error('unable to fetch Vocabulary record for term patient');
            throw err;
        }
    }

    // Adding feature (reference1) or Variant (1st variant as the default) as subject.
    if (rawRecord.evidenceType === 'FUNCTIONAL') {
        content.subject = rid(variants[0].reference1);
    }
    if (rawRecord.evidenceType === 'ONCOGENIC') {
        content.subject = variants.length === 1
            ? rid(variants[0])
            : rid(variants[0].reference1);
    }

    // Checking for Subject
    if (!content.subject) {
        throw Error('unable to determine statement subject');
    }

    // CONDITIONS
    // Adding variants as conditions
    content.conditions = [...variants.map(v => rid(v))];

    // Adding Disease as condition
    if (content.disease) {
        content.conditions.push(content.disease);
    }
    delete content.disease; // Removing unwanted properties no longer needed

    // Adding content's subject as condition if not already
    if (content.subject && !content.conditions.includes(content.subject)) {
        content.conditions.push(content.subject);
    }
    // Sorting conditions for downstream object comparison
    content.conditions.sort();

    return content;
};

/**
 * Process an EvidenceItem from CIViC into an array of one or more combinations
 *
 * @param {object} evidenceItem the CIViC EvidenceItem
 * @returns {object[]} an array of combinations
 */
const processEvidenceItem = async (evidenceItem) => {
    let record = JSON.parse(JSON.stringify(evidenceItem)); // Deep copy
    logger.debug(`processing EvidenceItem ${record.id}`);

    // Resolve therapy combinations if any
    // Updates record.therapies and record.therapyInteractionType properties
    record = resolveTherapies(record);

    // Molecular Profile (conditions w/ variants)
    record.conditions = processMolecularProfile(record.molecularProfile).conditions;

    // PROCESSING EVIDENCEITEM INTO AN ARRAY OF COMBINATIONS
    const combinations = [];

    for (const condition of record.conditions) {
        for (const therapies of record.therapies) {
            const content = JSON.parse(JSON.stringify(record.content)); // Deep copy
            combinations.push({
                ..._.omit(record, ['conditions']),
                content,
                therapies,
                variants: [...condition],
            });
        }
    }

    return combinations;
};

module.exports = {
    downloadEvidenceItems,
    processCombination,
    processEvidenceItem,
    requestEvidenceItems,
};
