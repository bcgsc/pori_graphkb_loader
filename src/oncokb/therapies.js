/* eslint-disable multiline-ternary */

/**
 * @module oncokb/therapies
 *
 * OncoKB drugs.json input file is assumed to list all individual drugs (therapies)
 * that are referenced in allActionableVariants.json, along with their NCIt id.
 * Drugs may also be described as combinations (+) of individual drugs.
 *
 * Corresponding NCIt Therapy records are expected to be already loaded into GraphKB.
 * Combinations will be uploaded as needed.
 */


const { logger } = require('../logging');
const { orderPreferredOntologyTerms, rid } = require('../graphkb');

/** @typedef {import('../graphkb').ApiConnection} ApiConnection */


/**
 * Compare two therapy records with the same sourceId (NCIt id)
 * and returns true if the first one is prefered.
 *
 * Based on deprecated & alias flags and the actual drugName from OncoKB
 *
 * @param {object} a new Therapy record to compare
 * @param {object} b the current Therapy record to compare with
 * @param {string} drugname the name of the OncoKB drug
 * @returns {boolean}
 */
const preferredTherapy = (a, b, drugName) => {
    const rank = (rec, name) => [
        rec.deprecated === true ? 0 : 1,
        rec.alias === true ? 0 : 1,
        rec.name === name ? 1 : 0,
    ];

    const ra = rank(a, drugName);
    const rb = rank(b, drugName);

    for (let i = 0; i < ra.length; i++) {
        if (ra[i] !== rb[i]) {
            return ra[i] > rb[i];
        }
    }

    return false;
};

/**
 * Given some NCIt drugs mapping from OncoKB drugs.json input file,
 * returns a new mapping from drug names to GraphKB therapy record RIDs
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {Map<string, string>} opt.drugs a mapping from NCIt ids to drug names
 * @returns {Promise<Map<string, string>>}
 */
const fetchTherapies = async ({ conn, drugs }) => {
    // Corresponding GraphKB Therapy records
    // this grab all the aliases & deprecated terms as well
    const therapies = await conn.getRecords({
        filters: {
            AND: [
                { source: { filters: { name: 'ncit' }, target: 'Source' } },
                { sourceId: Array.from(drugs.keys()) }, // NCIt ids
            ],
        },
        returnProperties: [
            '@rid',
            'alias',
            'deprecated',
            'name',
            'sourceId',
        ],
        target: 'Therapy',
    });

    // Select a preferred Therapy record per sourceId (NCIt id)
    const therapiesById = new Map();

    for (const therapy of therapies) {
        const { sourceId } = therapy;
        const current = therapiesById.get(sourceId);
        const drugName = drugs.get(sourceId);

        if (!current || preferredTherapy(therapy, current, drugName)) {
            therapiesById.set(sourceId, therapy);
        }
    }
    logger.info(`Found ${therapiesById.size}/${drugs.size} corresponding therapies in GraphKB`);

    // Check if all listed NCIt drugs have a corresponding GraphKB Therapy record
    for (const [ncitCode, drugName] of drugs) {
        if (!therapiesById.has(ncitCode)) {
            logger.warn(`No therapy record found for drug ${drugName} (${ncitCode})`);
        }
    }

    // Mapping from drug names to GraphKB therapy record RIDs
    return new Map(
        [...therapiesById].map(([sourceId, r]) => [
            drugs.get(sourceId),
            rid(r),
        ]),
    );
};

/**
 * Parse a string of OncoKB actionable variants drugs into an array of drug names.
 * Case is kept as-is.
 *
 * @param {string} drugs a string of drug names delimited by commas
 * @returns {Array.<string>}
 */
const parseDrugs = (drugs) => drugs
    .split(',')
    .map((el) => (el.trim()))
    .filter((el) => el !== '');

/**
 * Given a drug combination, fetches the corresponding GraphKB therapy records
 * or uploads a new combination therapy if it does not exist yet.
 *
 * Returns the RID of the combination therapy record.
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {string} opt.drug the drug combination
 * @param {object} opt.source the GraphKB Source record for OncoKB
 * @param {Map<string, string>} opt.therapies the mapping from individual drug name to RID
 * @returns {Promise<string|undefined>}
 */
const fetchAndLoadTherapyCombination = async ({
    conn, drug, source, therapies,
}) => {
    const terms = drug
        .split(' + ')
        .map((el) => el.trim())
        .filter((el) => el !== '')
        .sort();

    if (terms.length < 2) {
        logger.warn(`Cannot process combination therapy (${drug}); expected at least 2 terms`);
        return undefined;
    }

    // All are assumed to be 'combination' (concurrent), not sequential
    const combinationType = 'combination';

    // fetch combination therapy if already exists
    try {
        const therapy = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { combinationType },
                    { name: terms.join(' + ').toLowerCase() },
                    { source: rid(source) },
                ],
            },
            neighbors: 0,
            sort: orderPreferredOntologyTerms,
            target: 'Therapy',
        });
        return rid(therapy);
    } catch (err) { }


    const combination = [];

    // fetch individual therapies
    for (const term of terms) {
        try {
            const { result } = await conn.request({
                uri: `/therapies/${therapies.get(term.toLowerCase()).replace('#', '')}`,
            });
            combination.push(result);
        } catch (err) {
            logger.warn(`Cannot process combination therapy (${drug}); cannot fetch term ${term}`);
            return undefined;
        }
    }

    let combinedTherapy;

    // Upload Therapy
    try {
        // Add Therapy Vertice for the combination therapy
        const sourceId = combination.map(e => e.sourceId).join(' + ');
        const displayName = `${terms.join(' + ')} [${sourceId}]`;

        logger.info(`Uploading new combination therapy ${displayName}`);
        combinedTherapy = await conn.addRecord({
            content: {
                combinationType,
                displayName,
                name: terms.join(' + ').toLowerCase(),
                source: rid(source),
                sourceId,
            },
            target: 'Therapy',
        });
    } catch (err) {
        logger.warn(`Cannot upload combination therapy (${drug})`);
        return undefined;
    }

    // Add ElementOf edges between corresponding records
    for (const therapy of combination) {
        try {
            await conn.addRecord({
                content: {
                    in: rid(combinedTherapy),
                    out: rid(therapy),
                    source: rid(source),
                },
                target: 'ElementOf',
            });
        } catch (err) {
            logger.warn(`Cannot upload ${rid(therapy)} --ElementOf--> ${rid(combinedTherapy)} edge`);
        }
    }

    return rid(combinedTherapy);
};

/**
 * Mapping between OncoKB drug names and GraphKB therapies (RID)
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB file contents
 * @param {object} opt.source the GraphKB Source record for OncoKB
 * @returns {Promise<Map<string, string>>}
 */
const therapyMapping = async ({ conn, data, source }) => {
    logger.info('\nTHERAPIES:');

    // ncit codes mapping to drug names from OncoKB drugs input file (NCIt -> name)
    const drugs = new Map(
        data.drugs.map((r) => [
            r.ncitCode
                .trim()
                .toLowerCase(),
            r.drugName
                .trim()
                .toLowerCase(),
        ]),
    );
    logger.info(`${drugs.size} NCIt drugs from OncoKB`);

    // corresponding GraphKB therapies (name -> RID)
    const therapies = await fetchTherapies({ conn, drugs });

    // referenced drug names in OncoKB actionable variants input file
    const referencedDrugs = data.actionable.map((r) => parseDrugs(r.drugs));

    const noMapping = new Set();
    const combinations = new Map();

    for (const referenced of referencedDrugs) {
        for (const drug of referenced) {
            // add combinaison to therapies
            if (drug.includes(' + ')) {
                const combination = await fetchAndLoadTherapyCombination({
                    conn,
                    drug,
                    source,
                    therapies,
                });

                if (combination) {
                    // Keys in its original sorting order
                    combinations.set(drug.toLowerCase(), combination);
                } else {
                    noMapping.add(drug);
                }
                continue;
            }

            // check if individual referenced drug is mapped
            if (!therapies.has(drug.toLowerCase())) {
                noMapping.add(drug);
            }
        }
    }

    // update therapies with combinations
    for (const [k, v] of combinations) {
        therapies.set(k, v);
    }

    // warning on non-mapping drugs
    if (noMapping.size !== 0) {
        for (const drug of noMapping) {
            logger.warn(`${drug}: Cannot map OncoKB drug to a GraphKB therapy`);
        }
    }

    return therapies;
};

module.exports = {
    fetchAndLoadTherapyCombination,
    fetchTherapies,
    parseDrugs,
    preferredTherapy,
    therapyMapping,
};
