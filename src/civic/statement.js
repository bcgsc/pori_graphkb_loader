const _ = require('lodash');

const { logger } = require('../logging');


/**
 * Evaluate if two statement's content can be matched to one another.
 * Used to map each EvidenceLevel's combination to its corresponding GraphKB statement
 *
 * @param {object} fromCivic new content from CIViC
 * @param {object} fromGkb actual content from GraphKB
 * @returns {boolean} whether both contents are matching or not
 */
const isMatching = ({ fromCivic, fromGkb, p = ['conditions', 'subject'] }) => (
    JSON.stringify(_.pick(fromCivic, ...p)) === JSON.stringify(_.pick(fromGkb, ...p))
);

/**
 * Evaluate if a statement needs to be updated
 * when compared to its matching EvidenceLevel's combination
 *
 * @param {object} param0
 * @param {object} param0.fromCivic new content from CIViC
 * @param {object} param0.fromGkb actual content from GraphKB
 * @returns {boolean} whether the GraphKB record needs to be updated or not
 */
const needsUpdate = ({ fromCivic, fromGkb }) => {
    const isEqual = JSON.stringify(fromCivic) === JSON.stringify(_.omit(fromGkb, ['@rid']));

    // Logging details if not equal
    if (!isEqual) {
        const updatedFields = [];

        for (const [key, value] of Object.entries(fromCivic)) {
            if (JSON.stringify(value) !== JSON.stringify(fromGkb[key])) {
                updatedFields.push(key);
            }
        }
        logger.info(`Update needed on ${updatedFields.toString()}`);
    }

    return !isEqual;
};

/**
 * Given an array of content from civic and an array of actual statements from GraphKG,
 * match corresponding content together
 *
 * @param {object} param0
 * @param {object[]} param0.allFromCivic array of new content from CIViC
 * @param {object[]} param0.allFromGkb array of actual content from GraphKB
 * @param boolean} param0.matchingOnSubjectAlone if additional matching on subject alone
 * @param boolean} param0.matchingWithoutComparing if random matching with remaining records
 * @returns {object} content of records to create, update and delete in GrpahKB
 */
const contentMatching = ({
    allFromCivic,
    allFromGkb,
    matchingOnSubjectAlone = true,
    matchingWithoutComparing = true,
}) => {
    const records = {
        toCreate: [], // Array of content from CIViC to create as GraphKB statements
        toDelete: [], // Array of GraphKB statements to delete
        toUpdate: [], /* Array of CIViC-GraphKB pairs of content for statement update
                         Note: statement will be updated only if needed */
    };

    /*
        MATCHING ONE TO ONE

        Will automatically be submitted for update, without deletion/creation
    */

    if (allFromCivic.length === 1 && allFromGkb.length === 1) {
        records.toUpdate.push({ fromCivic: allFromCivic[0], fromGkb: allFromGkb[0] });
        return records;
    }

    /*
        MATCHING ON CONDITIONS AND SUBJECT
    */

    const remainingFromGkb = [...allFromGkb];
    allFromCivic.forEach(el => {
        let matched = false;

        for (let i = 0; i < remainingFromGkb.length; i++) {
            // matching on conditions and subject (default)
            if (isMatching({
                fromCivic: el,
                fromGkb: remainingFromGkb[i],
            })) {
                records.toUpdate.push({
                    fromCivic: el,
                    fromGkb: remainingFromGkb[i],
                });
                remainingFromGkb.splice(i, 1);
                matched = true;
                break;
            }
        }

        if (!matched) {
            records.toCreate.push(el);
        }
    });
    records.toDelete = [...remainingFromGkb];

    /*
        MATCHING ON SUBJECT ALONE
    */
    if (!matchingOnSubjectAlone) { return records; }

    let numUnmatched = Math.min(
        records.toCreate.length,
        records.toDelete.length,
    );

    if (numUnmatched > 0) {
        const remainingToCreate = [];

        for (let j = 0; j < records.toCreate.length; j++) {
            let matched = false;

            for (let i = 0; i < records.toDelete.length; i++) {
                // matching on subject
                if (isMatching({
                    fromCivic: records.toCreate[j],
                    fromGkb: records.toDelete[i],
                    p: ['subject'],
                })) {
                    records.toUpdate.push({
                        fromCivic: records.toCreate[j],
                        fromGkb: records.toDelete[i],
                    });
                    records.toDelete.splice(i, 1);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                remainingToCreate.push(records.toCreate[j]);
            }
        }
        records.toCreate = [...remainingToCreate];
    }

    /*
        ARTIFICIAL MATCHING WITHOUT COMPARISON

        In order to reduce unnecessary create/delete statements,
        artificially match pairs until only some records.toCreate record(s) remains
        or some records.toDelete record(s) remains.
    */
    if (!matchingWithoutComparing) { return records; }

    numUnmatched = Math.min(
        records.toCreate.length,
        records.toDelete.length,
    );

    // Randomly match remaining content
    if (numUnmatched > 0) {
        for (let i = 0; i < numUnmatched; i++) {
            // 'Artificial' pairing
            records.toUpdate.push(
                { fromCivic: records.toCreate[i], fromGkb: records.toDelete[i] },
            );
        }
        // Remove from records.toCreate and records.toDelete
        records.toCreate.splice(0, numUnmatched);
        records.toDelete.splice(0, numUnmatched);
    }

    return records;
};

/**
 * Given source & list of sourceIds, returns corresponding statements
 *
 * @param {ApiConnection} conn the api connection object for GraphKB
 * @param {object} param1
 * @param {string} param1.source the source RID
 * @param {string[]} param1.sourceIds an array of sourceIds
 * @returns {string[]} a list of statement RIDs
 */
const getStatements = async (conn, { source, sourceIds }) => {
    const records = await conn.getRecords({
        filters: {
            AND: [
                { sourceId: sourceIds },
                { source },
            ],
        },
        target: 'Statement',
    });
    const rids = records.map(
        (el) => el['@rid'],
    );
    return rids;
};

/**
 * Given content from CIViC, try to create the GraphKB record
 *
 * @param {ApiConnection} conn the API connection object for GraphKB
 * @param {object} param1
 * @param {object[]} param1.fromCivic new content from CIViC
 * @returns {object} a count object for error and success
 */
const createStatement = async (conn, { fromCivic }) => {
    const counts = { err: 0, success: 0 };

    try {
        await conn.addRecord({ content: fromCivic, target: 'Statement' });
        counts.success++;
    } catch (err) {
        logger.error(err);
        counts.err++;
    }

    return counts;
};

/**
 * Given content from CIViC and a corresponding GraphKB Statement rid,
 * try to update the GraphKB record
 *
 * @param {ApiConnection} conn the API connection object for GraphKB
 * @param {object} param1
 * @param {object[]} param1.fromCivic new content from CIViC
 * @param {object[]} param1.fromGkb actual content from GraphKB
 * @returns {object} a count object for error and success
 */
const updateStatement = async (conn, { fromCivic, fromGkb }) => {
    const counts = { err: 0, success: 0 };

    try {
        await conn.addRecord({
            content: fromCivic,
            existsOk: true,
            fetchConditions: {
                // Since CIViC content has already been matched
                // to its corresponding GraphKB statement
                '@rid': fromGkb['@rid'],
            },
            target: 'Statement',
            upsert: true,
        });
        counts.success++;
    } catch (err) {
        logger.error(err);
        counts.err++;
    }

    return counts;
};

/**
 * Soft-delete GraphKB Statements from either an array of Statement's RIDs
 * or an array of sourceIds and its corresponding source
 *
 * @param {ApiConnection} conn the api connection object for GraphKB
 * @param {object} param1
 * @param {?string[]} param1.rids an array of Statement's RIDs
 * @param {string} param1.source the source RID
 * @param {string[]} param1.sourceIds an array of sourceIds
 * @returns {object} a count object for error and success
 */
const deleteStatements = async (conn, { rids = [], source, sourceIds }) => {
    const counts = { err: 0, success: 0 };

    // Get rids to delete if none provided
    if (rids.length === 0) {
        logger.info('Loading corresponding GraphKB statement RIDs to delete');
        rids.push(...await getStatements(conn, { source, sourceIds }));
        logger.info(`${rids.length} RIDs found`);
    }

    // Delete statements
    logger.info(`Deleting ${rids.length} statement(s)...`);
    logger.info(rids);

    for (const r of rids) {
        try {
            await conn.deleteRecord('Statement', r);
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.err++;
        }
    }

    return counts;
};

module.exports = {
    contentMatching,
    createStatement,
    deleteStatements,
    getStatements,
    isMatching,
    needsUpdate,
    updateStatement,
};
