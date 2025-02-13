/**
 * @module importer/civic
 */
const fs = require('fs');

// const { discardedEvidenceItems } = require('./hardcoded');
const { rid } = require('../graphkb');
const { logger } = require('../logging');
const { civic: SOURCE_DEFN } = require('../sources');
const { getDisease } = require('./disease');
const { getRelevance } = require('./relevance');
const { getEvidenceLevel } = require('./evidenceLevel');
const { getPublication, loadPubmedCache } = require('./publication');
const {
    downloadEvidenceItems,
    processCombination,
    processEvidenceItem,
} = require('./evidenceItem');
const {
    contentMatching,
    createStatement,
    deleteStatements,
    getStatements,
    needsUpdate,
    updateStatement,
} = require('./statement');

const BASE_URL = 'https://civicdb.org/api/graphql';


/**
 * Increment counter on GraphKB Statement CRUD operations
 *
 * @param {object} initial the counter
 * @param {object} updates the increment to apply
 * @returns {object} the incremented counter
 */
const incrementCounts = (initial, updates) => {
    if (!initial) {
        return updates;
    }

    // deep copy
    const updated = JSON.parse(JSON.stringify(initial));

    for (const level1 of Object.keys(updated)) {
        for (const level2 of Object.keys(updated[level1])) {
            updated[level1][level2] += updates[level1][level2];
        }
    }

    return updated;
};

/**
 * Access the CIVic API, parse content, transform and load into GraphKB
 *
 * @param {object} param0
 * @param {ApiConnection} param0.conn the api connection object for GraphKB
 * @param {?boolean} param0.deleteDeprecated delete GraphKB Statements if deprecated evidence(s)
 * @param {string} param0.errorLogPrefix prefix to the generated error json file
 * @param {number} param0.maxRecords limit of EvidenceItem records to be processed and upload
 * @param {?boolean} param0.noDeleteOnUnmatched don't delete GraphKB St. if unmatched combination(s)
 * @param {?boolean} param0.noUpdate no update of existing GraphKB Statements
 * @param {string[]} param0.trustedCurators a list of curator IDs for submitted-only EvidenceItems
 * @param {?string} param0.url url to use as the base for accessing the civic ApiConnection
 */
const upload = async ({
    conn,
    deleteDeprecated = false, // Won't delete deprecated sourceIds by default
    errorLogPrefix,
    maxRecords,
    noDeleteOnUnmatched = false,
    noUpdate = false,
    trustedCurators,
    url = BASE_URL,
}) => {
    const countsEI = {
        error: 0,
        partialSuccess: 0,
        skip: 0,
        success: 0,
    };
    let countsST;

    // Adding CIViC as source if not already in GraphKB
    const source = await conn.addSource(SOURCE_DEFN);
    const sourceRid = rid(source);

    /*
        1. DOWNLOAD & PREPROCESSING
    */

    // GETTING CIVIC EVIDENCEITEMS FROM CIVIC API
    // Evidences accepted, or submitted from a trusted curator
    logger.info(`loading evidenceItems from ${url}`);
    const {
        errors: downloadEvidenceItemsErr,
        records: evidenceItems,
    } = await downloadEvidenceItems(url, trustedCurators);

    // Validation errors
    const validationErrorList = [];

    if (downloadEvidenceItemsErr.length > 0) {
        countsEI.error += downloadEvidenceItemsErr.length;
        validationErrorList.push(...downloadEvidenceItemsErr);
    }

    // GETTING CIVIC STATEMENTS FROM GRAPHKB API
    // Note: One or more GKB Statement can come from the same CIVIC id (sourceId)
    logger.info('loading related statements from GraphKB');
    const statements = await conn.getRecords({
        filters: { source: sourceRid },
        returnProperties: [
            '@rid',
            'conditions',
            'description',
            'evidence',
            'evidenceLevel',
            'relevance',
            'reviewStatus',
            'source',
            'sourceId',
            'subject',
        ],
        target: 'Statement',
    });
    const sourceIdsFromGKB = new Set(statements.map(r => r.sourceId));
    logger.info(`${sourceIdsFromGKB.size} distinct ${SOURCE_DEFN.name} sourceId in GraphKB statements`);
    logger.info(`${statements.length} total statements previously added to GraphKB from ${SOURCE_DEFN.name}`);

    // REFACTORING GRAPHKB STATEMENTS INTO STATEMENTSBYSOURCEID
    // where each sourceId is a key associated with an array
    // of one or more GKB Statement records
    const statementsBySourceId = {};

    for (const record of statements) {
        if (!statementsBySourceId[record.sourceId]) {
            statementsBySourceId[record.sourceId] = [];
        }
        // Sorting conditions for downstream object comparison
        record.conditions.sort();
        statementsBySourceId[record.sourceId].push(record);
    }

    // REFACTORING CIVIC EVIDENCEITEMS INTO EVIDENCEITEMSBYID
    // where each id is a key associated with one CIViC EvidenceItem as value
    logger.info(`Pre-pocessing ${evidenceItems.length} records`);
    const evidenceItemsById = {};

    // Performing some checks. Skipping some records if needed
    // eslint-disable-next-line guard-for-in
    for (const i in evidenceItems) {
        // Check if max records limit has been reached
        if (maxRecords && Object.keys(evidenceItemsById).length >= maxRecords) {
            logger.warn(`Not loading all content due to max records limit (${maxRecords})`);
            countsEI.skip += (evidenceItems.length - i);
            break;
        }
        // Check if record id is unique
        if (evidenceItemsById[evidenceItems[i].id]) {
            logger.error(`Multiple Evidence Items with the same id: ${evidenceItems[i].id}. Violates assumptions. Only the 1st one was kept.`);
            countsEI.skip++;
            continue;
        }
        // Adding EvidenceItem to object for upload
        evidenceItemsById[evidenceItems[i].id] = evidenceItems[i];
    }
    const noRecords = Object.keys(evidenceItemsById).length;
    logger.info(`${noRecords}/${evidenceItems.length} Evidence Items to process`);

    /*
        2. PROCESSING EACH CIVIC EVIDENCEITEM INTO ONE OR MORE GKB STATEMENTS
    */

    // PubMed caching
    logger.info('Caching Pubmed publication');
    await loadPubmedCache(conn);

    // Keeping track of EvidenceItem sourceIds who raised errors during processing
    const errorSourceIds = {
        disease: new Map(),
        evidence: new Map(),
        evidenceLevel: new Map(),
        individualCombinationProcessing: new Map(),
        processingIntoCombinations: new Map(),
        relevance: new Map(),
    };
    const statementsToReviewUnmatchedProcessingError = new Map();
    const statementsToReviewUnmatched = new Map();

    logger.info(`\n\n${'#'.repeat(80)}\n## PROCESSING RECORDS\n${'#'.repeat(80)}\n`);
    let recordNumber = 0;

    // MAIN LOOP
    // Looping through Evidence Items
    for (const [id, evidenceItem] of Object.entries(evidenceItemsById)) {
        // // KBDEV-1277. Known problematic EvidenceItems we want to discard
        // if (discardedEvidenceItems.has(id)) {
        //     continue;
        // }

        /*  PROCESSING EVIDENCEITEMS */

        recordNumber++;
        logger.info();
        logger.info(`***** ${recordNumber}/${noRecords} : processing id ${id} *****`);

        const numberOfStatements = statementsBySourceId[id]
            ? statementsBySourceId[id].length
            : 0;
        logger.info(`${numberOfStatements} related statement(s)`);

        // Base object (properties order matters)
        // Common content will be deep copied downstream for each combination
        evidenceItem.content = {
            conditions: [],
            description: evidenceItem.description || '',
            evidence: [],
            evidenceLevel: [],
            relevance: undefined,
            reviewStatus: (evidenceItem.status === 'ACCEPTED'
                ? 'not required'
                : 'pending'
            ),
            source: sourceRid,
            sourceId: id,
            subject: undefined,
        };

        // PROCESSING DATA COMMON TO ALL COMBINATIONS

        // Removing extra spaces in description. Needed before content comparison
        evidenceItem.content.description = evidenceItem.content.description.replace(/\s+/g, ' ').trim();

        // Get evidence (publication) rid
        try {
            evidenceItem.content.evidence.push(rid(
                await getPublication(conn, evidenceItem),
            ));
        } catch (err) {
            logger.error(err);
            countsEI.error++;
            errorSourceIds.evidence.set(id, err);
            continue;
        }

        // Get evidenceLevel rid
        try {
            evidenceItem.content.evidenceLevel.push(rid(
                await getEvidenceLevel(conn, {
                    rawRecord: evidenceItem,
                    source: sourceRid,
                    sourceDisplayName: SOURCE_DEFN.displayName,
                }),
            ));
        } catch (err) {
            logger.error(err);
            countsEI.error++;
            errorSourceIds.evidenceLevel.set(id, err);
            continue;
        }

        // Get relevance rid
        try {
            evidenceItem.content.relevance = rid(
                await getRelevance(conn, { rawRecord: evidenceItem }),
            );
        } catch (err) {
            logger.error(err);
            countsEI.error++;
            errorSourceIds.relevance.set(id, err);
            continue;
        }

        // Get disease rid
        try {
            // Will be removed downstream after being used as content's subject and/or condition
            evidenceItem.content.disease = rid(
                await getDisease(conn, { rawRecord: evidenceItem }),
                true, // nullOk=true since some EvidenceItems aren't related to any specific disease
            );
        } catch (err) {
            logger.error(err);
            countsEI.error++;
            errorSourceIds.disease.set(id, err);
            continue;
        }

        // PROCESSING INDIVIDUAL EVIDENCEITEM INTO AN ARRAY OF COMBINATIONS
        // (One combination per expected GraphKB statement)
        const combinations = [];

        try {
            combinations.push(...await processEvidenceItem(evidenceItem));
        } catch (err) {
            logger.error(err);
            countsEI.error++;
            errorSourceIds.processingIntoCombinations.set(id, err);
            continue;
        }
        logger.info(`${combinations.length} combination(s)`);

        // PROCESSING INDIVIDUAL COMBINATION
        // Formatting each combination's content for GraphKB statement requirements
        const contents = [];
        let processCombinationErrors = 0;

        for (const combination of combinations) {
            try {
                contents.push(
                    await processCombination(conn, {
                        record: combination,
                        sourceRid,
                    }),
                );
            } catch (err) {
                logger.error(err);
                processCombinationErrors++;

                if (!errorSourceIds.individualCombinationProcessing.get(id)) {
                    errorSourceIds.individualCombinationProcessing.set(id, []);
                }
                const v = errorSourceIds.individualCombinationProcessing.get(id);
                errorSourceIds.individualCombinationProcessing.set(id, [...v, err]);
            }
        }

        const successRatio = `${combinations.length - processCombinationErrors}/${combinations.length}`;
        const processCombinationsMsg = `Processed ${successRatio} combination(s)`;

        // If at least some combinations succeeds, then it's a success
        if (processCombinationErrors === 0) {
            countsEI.success++;
            logger.info(processCombinationsMsg);
        } else if (processCombinationErrors < combinations.length) {
            countsEI.partialSuccess++;
            logger.warn(processCombinationsMsg);
        } else {
            countsEI.error++;
            logger.error(processCombinationsMsg);
        }


        /* MATCHING EVIDENCEITEMS WITH STATEMENTS */

        // Content matching between CIViC and GraphKB records
        // so we know which CRUD operation to perform on each statement
        const { toCreate, toDelete, toUpdate } = contentMatching({
            allFromCivic: contents,
            allFromGkb: statementsBySourceId[id] || [],
        });

        /* CREATE/UPDATE/DELETE STATEMENTS */

        const loaclCountsST = {
            create: { err: 0, success: 0 },
            delete: { err: 0, success: 0 },
            noUpdateNeeded: { success: 0 },
            update: { err: 0, success: 0 },
        };

        // UPDATE
        if (!noUpdate && toUpdate.length > 0) {
            for (let i = 0; i < toUpdate.length; i++) {
                const { fromCivic, fromGkb } = toUpdate[i];

                // Check if an update is needed to avoid unnecessary API calls
                if (needsUpdate({ fromCivic, fromGkb })) {
                    const updatedCount = await updateStatement(conn, { fromCivic, fromGkb });
                    loaclCountsST.update.err += updatedCount.err;
                    loaclCountsST.update.success += updatedCount.success;
                } else {
                    loaclCountsST.noUpdateNeeded.success++;
                }
            }
        }

        // DELETE
        if (toDelete.length > 0) {
            const rids = toDelete.map(el => el['@rid']);

            if (processCombinationErrors > 0) {
                // Do not delete any statements if some combinations have processing errors
                logger.warn(`${toDelete.length} unmatched statement(s). To be reviewed since some processing errors occured`);
                statementsToReviewUnmatchedProcessingError.set(id, rids);
            } else if (noDeleteOnUnmatched) {
                // Do not delete any statements if noDeleteOnUnmatched flag
                logger.warn(`${toDelete.length} unmatched statement(s). To be reviewed since the noDeleteOnUnmatched flag is being used`);
                statementsToReviewUnmatched.set(id, rids);
            } else {
                loaclCountsST.delete = await deleteStatements(conn, { rids });
            }
        }

        // CREATE
        if (toCreate.length > 0) {
            for (let i = 0; i < toCreate.length; i++) {
                const createdCount = await createStatement(conn, { fromCivic: toCreate[i] });
                loaclCountsST.create.err += createdCount.err;
                loaclCountsST.create.success += createdCount.success;
            }
        }

        // logging
        for (const level of Object.keys(loaclCountsST)) {
            if (loaclCountsST[level].err > 0 || loaclCountsST[level].success > 0) {
                logger.info(`${level}: ${JSON.stringify(loaclCountsST[level])}`);
            }
        }
        countsST = incrementCounts(countsST, loaclCountsST);

        // END OF MAIN LOOP
    }
    return;

    logger.info(`\n\n${'#'.repeat(80)}\n## END OF RECORD PROCESSING\n${'#'.repeat(80)}\n`);

    // Logging EvidenceItem processing counts
    logger.info();
    logger.info('***** CIViC EvidenceItem records processing report: *****');
    logger.info(JSON.stringify(countsEI));

    // Logging detailed EvidenceItem processing counts
    logger.info('Processing errors report:');

    for (const [key, value] of Object.entries(errorSourceIds)) {
        logger.info(`${key}: ${value.size}`);
        // Also formatting Maps into objects for saving to file downstream
        errorSourceIds[key] = Object.fromEntries(errorSourceIds[key]);
    }

    // DELETING UNWANTED GRAPHKB STATEMENTS
    // sourceIds no longer in CIViC (not accepted/submitted-by-trustedCurators) but still in GraphKB
    const allIdsFromCivic = new Set(evidenceItems.map(r => r.id.toString()));
    const sourceIdstoDeleteStatementsFrom = Array.from(
        new Set([...sourceIdsFromGKB].filter(x => !allIdsFromCivic.has(x))),
    );
    logger.info();
    logger.info('***** Deprecated items *****');
    logger.warn(`${sourceIdstoDeleteStatementsFrom.length} deprecated ${SOURCE_DEFN.name} Evidence Items still in GraphKB Statement`);

    if (sourceIdstoDeleteStatementsFrom.length > 0) {
        logger.info(`sourceIds: ${sourceIdstoDeleteStatementsFrom}`);
    }

    // GraphKB Statements Soft-deletion
    if (sourceIdstoDeleteStatementsFrom.length > 0) {
        if (!deleteDeprecated) {
            // Do not delete any statements if no deleteDeprecated flag
            const deprecatedStatementRids = await getStatements(
                conn,
                { source: sourceRid, sourceIds: sourceIdstoDeleteStatementsFrom },
            );
            logger.warn(`${deprecatedStatementRids.length} corresponding deprecated statement(s). To be reviewed since no deleteDeprecated flag`);
            const deprecatedStatementsFilepath = `${errorLogPrefix}-civic-deprecatedStatements.json`;
            logger.info(`writing ${deprecatedStatementsFilepath}`);
            fs.writeFileSync(
                deprecatedStatementsFilepath,
                JSON.stringify(deprecatedStatementRids, null, 2),
            );
        } else {
            const deletedCount = await deleteStatements(conn, {
                source: sourceRid,
                sourceIds: sourceIdstoDeleteStatementsFrom,
            });
            const attempts = deletedCount.success + deletedCount.err;
            logger.info(`${deletedCount.success}/${attempts} soft-deleted statements`);

            if (countsST) {
                countsST.delete.err += deletedCount.err;
                countsST.delete.success += deletedCount.success;
            } else {
                countsST = { delete: { err: deletedCount.err, success: deletedCount.success } };
            }
        }
    }

    // Logging processing error cases to be reviewed,
    // so a reviewer can decide if corresponding statements need to be deleted or not
    logger.info();
    logger.info('***** Unmatched cases to be reviewed for deletion *****');
    logger.warn(`${statementsToReviewUnmatchedProcessingError.size} Evidence Item(s) with processing errors leading to unmatched Statement(s)`);
    statementsToReviewUnmatchedProcessingError.forEach((v, k) => logger.info(`${k} -> ${JSON.stringify(v)}`));
    logger.warn(`${statementsToReviewUnmatched.size} Evidence Item(s) with unmatched Statement(s) with no processing error involved`);
    statementsToReviewUnmatched.forEach((v, k) => logger.info(`${k} -> ${JSON.stringify(v)}`));

    // Logging Statement CRUD operations counts
    if (countsST) {
        logger.info();
        logger.info('***** GraphKB Statement records CRUD operations report: *****');

        for (const op of Object.keys(countsST)) {
            logger.info(`${op}: ${JSON.stringify(countsST[op])}`);
        }
    }

    // SAVING LOGGED ERRORS TO FILE
    const errorFileContent = {
        ...errorSourceIds,
        validationErrors: validationErrorList,
    };
    const errorJson = `${errorLogPrefix}-civic.json`;
    logger.info();
    logger.info(`***** Global report: *****\nwriting ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify(errorFileContent, null, 2));
};

module.exports = {
    upload,
};
