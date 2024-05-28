const { logger } = require('../logging');
const { ncit: NCIT_SOURCE_DEFN } = require('../sources');
const { orderPreferredOntologyTerms, rid } = require('../graphkb');


/**
 * Given a CIViC EvidenceItem record,
 * compile a list of its therapies into a list of combination of therapies, and
 * returns modified 'therapies' & 'therapyInteractionType' properties
 *
 * record.therapies will be transformed into:
 * - a list of 1 list of 1-or-many therapies ('COMBINATION' || 'SEQUENTIAL'), or
 * - a list of 1-or-many lists of 1 therapy ('SUBSTITUTES'), or
 * - a list of 1 null
 *
 * @param {object} evidenceItem the original CIViC EvidenceItem
 * @returns {object} the modified EvidenceItem
 */
const resolveTherapies = (evidenceItem) => {
    const record = JSON.parse(JSON.stringify(evidenceItem)); // Deep copy

    // No therapy
    if (record.therapies === null || record.therapies.length === 0) {
        record.therapies = [null];
        return record;
    }

    // One or more therapies
    if (record.therapies.length === 1 || record.therapyInteractionType === 'SUBSTITUTES') {
        record.therapies = record.therapies.map(therapy => [therapy]);
        record.therapyInteractionType = null;
    } else if (
        record.therapyInteractionType === 'COMBINATION'
        || record.therapyInteractionType === 'SEQUENTIAL'
    ) {
        record.therapies = [record.therapies];
    } else {
        logger.error(`(evidence: ${record.id}) unsupported therapy interaction type (${record.therapyInteractionType}) for a multiple therapy (${record.therapies.length}) statement`);
        throw new Error('Did not find unique record');
    }

    // Since duplicates can occure (from civic !?), lets remove them
    // Need to strignify/parse since we're comparing arrays of objects
    const unique = new Set();
    record.therapies.forEach(therapy => unique.add(JSON.stringify(therapy)));
    record.therapies = [];
    unique.forEach(therapy => record.therapies.push(JSON.parse(therapy)));

    return record;
};

/**
 * Given a Therapy record from CIViC,
 * returns a Therapy record from GraphKB
 *
 * @param {ApiConnection} conn the API connection object for GraphKB
 * @param {object} therapyRecord a therapy from CIViC
 * @returns {object} Therapy record from GraphKB
 */
const getTherapy = async (conn, therapyRecord) => {
    const name = therapyRecord.name.toLowerCase().trim();
    const ncitId = therapyRecord.ncitId && typeof therapyRecord.ncitId === 'string'
        ? therapyRecord.ncitId.toLowerCase().trim()
        : therapyRecord.ncitId;

    let originalError;

    if (ncitId) {
        // Trying with the ncitId and the name
        try {
            return await conn.getUniqueRecordBy({
                filters: [
                    { source: { filters: { name: NCIT_SOURCE_DEFN.name }, target: 'Source' } },
                    { sourceId: ncitId },
                    { name },
                ],
                sort: orderPreferredOntologyTerms,
                target: 'Therapy',
            });
        } catch (err) {
            logger.warn(`Failed to fetch therapy with NCIt id (${ncitId}) & name (${therapyRecord.name}) from graphkb`);
        }

        // Trying with the ncitId only
        // Choosing the most recently created one
        try {
            const matchingTherapies = await conn.getRecords({
                filters: {
                    AND: [
                        { source: { filters: { name: NCIT_SOURCE_DEFN.name }, target: 'Source' } },
                        { sourceId: ncitId },
                    ],
                },
                target: 'Therapy',
            });
            // In-place sorting
            matchingTherapies.sort((a, b) => b.createdAt - a.createdAt);
            // returning 1st one (latest created)
            return matchingTherapies[0];
        } catch (err) {
            logger.error(`Failed to fetch therapy with NCIt id (${ncitId}) from graphkb`);
            throw err;
        }
    }

    // Trying instead with the name
    // Using the getTherapy method from the connection object
    try {
        // With the name as-is first
        return await conn.getTherapy(name);
    } catch (err) {
        originalError = err;
    }

    try {
        // Then with the name parsed
        const match = /^\s*(\S+)\s*\([^)]+\)$/.exec(name);

        if (match) {
            return await conn.getTherapy(match[1]);
        }
    } catch (err) { }

    // Logging errors
    logger.error(originalError);
    throw originalError;
};

/**
 * Given a list of CIViC Therapy Records,
 *
 * (If one therapy)
 * returns the corresponding Therapy record from GraphKB
 *
 * (If a combination of therapies)
 * will add a therapy combination if there is not an existing record,
 * will link the therapy combination to its individual elements with 'ElementOf' edges, then
 * returns the corresponding Therapy record from GraphKB
 *
 * @param {ApiConnection} conn the API connection object for GraphKB
 * @param {string} sourceRid
 * @param {object[]} therapiesRecords
 * @param {string} combinationType
 * @returns {object} the corresponding Therapy record from GraphKB
 */
const addOrFetchTherapy = async (conn, sourceRid, therapiesRecords, combinationType) => {
    /* ONE OR NO THERAPY */

    if (therapiesRecords.length === 0) {
        return null;
    }
    if (therapiesRecords.length === 1) {
        if (therapiesRecords[0] === null) {
            return null;
        }
        // Get the corresponding Therapy record from GraphKB
        return getTherapy(conn, therapiesRecords[0]);
    }

    /* COMBINATION OF THERAPIES */

    // For each therapy, get the corresponding Therapy record from GraphKB
    const therapies = await Promise.all(
        therapiesRecords.map(
            async therapy => getTherapy(conn, therapy),
        ),
    );
    // concatenating sourceIds and names
    const sourceId = therapies.map(e => e.sourceId).sort().join(' + ');
    const name = therapies.map(e => e.name).sort().join(' + ');

    // Add a Therapy Vertice for the combined therapies
    const combinedTherapy = await conn.addRecord({
        content: {
            combinationType, name, source: sourceRid, sourceId,
        },
        existsOk: true,
        target: 'Therapy',
    });

    // Add ElementOf Edges between corresponding records
    for (const therapy of therapies) {
        await conn.addRecord({
            content: {
                in: rid(combinedTherapy),
                out: rid(therapy),
                source: sourceRid,
            },
            existsOk: true,
            target: 'ElementOf',
        });
    }

    return combinedTherapy;
};

module.exports = {
    addOrFetchTherapy,
    getTherapy,
    resolveTherapies,
};
