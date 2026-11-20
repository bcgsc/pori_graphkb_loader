/* eslint-disable multiline-ternary */
const { convertRecordToQueryFilters, rid } = require('../graphkb');
const { logger } = require('../logging');
const sources = require('../sources');

/** @typedef {import('../graphkb').ApiConnection} ApiConnection */


const LIQUID_TISSUES = [
    'blood', // deprecated term, maintained in GraphKB
    'lymph',
    'myeloid',
];


/**
 * Fetch/upload the GraphKB cancer term Disease record
 * Links to the NCIt cancer term as xRef
 *
 * @param {ApiConnection} conn the api connection object
 * @param {object} opt
 * @param {object} opt.source the GraphKB source record
 * @returns {object} the cancer term record
 */
const cancerTerm = async (conn, { source }) => {
    let cancer,
        cancerNcit;

    // cancer term
    const content = {
        name: 'cancer',
        source: rid(source),
        sourceId: 'cancer',
    };

    try {
        // First try to update former cancer_oncokb term
        cancer = await conn.addRecord({
            content,
            fetchConditions: convertRecordToQueryFilters({ sourceId: 'cancer_oncokb' }),
            target: 'Disease',
            upsert: true,
        });
        logger.info('Fetched/uploaded/updated cancer term');
    } catch (err) {
        // Otherwise fetch/upload. Needs to be done in a seperate query
        // since we were updating the fetching condition in the previous query
        cancer = await conn.addRecord({
            content,
            existsOk: true,
            target: 'Disease',
        });
        logger.info('Fetched/uploaded cancer term');
    }

    // NCIt cancer term
    try {
        cancerNcit = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { source: { filters: { name: 'ncit' }, target: 'Source' } },
                    { name: 'cancer' },
                ],
            },
            target: 'Disease',
        });
    } catch (err) {
        logger.warn('cannot find \'cancer\' term from NCIt. Make sure the NCIt loader has been run!');
    }

    // 3. CrossReferenceOf NCIt cancer
    if (cancer && cancerNcit) {
        await conn.addRecord({
            content: {
                in: rid(cancerNcit),
                out: rid(cancer),
                source: rid(source),
            },
            existsOk: true,
            target: 'CrossReferenceOf',
        });
        logger.info('Linked cancer term to NCIt cancer term');
    }

    return cancer;
};

/**
 * Fetch/upload a grouping term
 * Links to the GraphKB cancer term as SubClassOf
 *
 * @param {ApiConnection} conn the api connection object
 * @param {object} opt
 * @param {object} opt.cancer the cancer record
 * @param {object} opt.source the GraphKB source record
 * @param {string} opt.term the grouping term
 * @returns {object} the grouping term record
 */
const groupingTerm = async (conn, { cancer, source, term }) => {
    let record;
    const body = { name: term, sourceId: term };

    try {
        // First try term from any source; will update former term (e.g. OncoKB) to GraphKB
        record = await conn.addRecord({
            content: {
                ...body,
                source: rid(source),
            },
            fetchConditions: convertRecordToQueryFilters(body),
            target: 'Disease',
            upsert: true,
        });
        logger.info(`Fetched/uploaded/updated grouping term ${term}`);
    } catch (err) {
        // If more than one term, then fetch/upload term sourced from GraphKB
        record = await conn.addRecord({
            content: {
                ...body,
                source: rid(source),
            },
            existsOk: true,
            target: 'Disease',
        });
        logger.info(`Fetched/uploaded grouping term ${term}`);
    }

    // SubClassOf cancer
    if (record && cancer) {
        await conn.addRecord({
            content: {
                in: rid(cancer),
                out: rid(record),
                source: rid(source),
            },
            existsOk: true,
            target: 'SubClassOf',
        });
        logger.info('Linked grouping term to cancer');
    }

    return record;
};

/**
 * Uploads SubClassOf edges.
 *
 * Fetch oncotree tissue-specific terms, get terms directly connected to them
 * and link them all to either all solid/liquide tumors terms.
 *
 * @param {ApiConnection} conn the api connection object
 * @param {object} opt
 * @param {object} opt.allLiquid the all liquid tumors term record
 * @param {object} opt.allSolid the all solid tumors term record
 * @param {object} opt.graphkb the GraphKB source record
 * @param {object} opt.oncotree the OncoTree source record
 * @returns {Set} the fetched/uploaded grouping edge's RIDs
 */
const uploadLinks = async (conn, {
    allLiquid,
    allSolid,
    graphkb,
    oncotree,
}) => {
    const groupingEdges = new Set();

    // root tissue term
    const tissue = await conn.getUniqueRecordBy({
        filters: {
            AND: [
                { source: rid(oncotree) },
                { sourceId: 'tissue' },
            ],
        },
        neighbors: 2, // get whole in_SubClassOf.out records
        target: 'Disease',
    });

    // specific tissues
    const tissues = tissue.in_SubClassOf
        .map((r) => r.out)
        .filter((r) => rid(r.source) === rid(oncotree));

    // grouping by solid/liquid tumors. Default to solid if not explicitly liquid
    const groups = {
        liquid: tissues.filter((r) => LIQUID_TISSUES.includes(r.sourceId)),
        solid: tissues.filter((r) => !LIQUID_TISSUES.includes(r.sourceId)),
    };

    // upload SubCLassOf edges to grouping terms
    for (const [group, records] of Object.entries(groups)) {
        for (const r of records) {
            // Extract incomming SubClassOf edges from children (first-level disease terms)
            for (const edgeRid of r.in_SubClassOf) {
                try {
                    // We only have the edge RID, not the node RID to which it is comming from,
                    // so we need to first query that edge.
                    const { result } = await conn.request({ uri: `SubClassOf/${String(edgeRid).replace('#', '')}` });

                    // Add SubClasssOf to all solid/liquid tumors
                    const newEdge = await conn.addRecord({
                        content: {
                            in: group === 'liquid' ? rid(allLiquid) : rid(allSolid),
                            out: rid(result.out),
                            source: rid(graphkb),
                        },
                        existsOk: true,
                        target: 'SubClassOf',
                    });
                    groupingEdges.add(rid(newEdge));
                    logger.info(`Linked ${result.out} to all ${group} tumors`);
                } catch (err) {
                    logger.warn(`Cannot link child term of ${r.sourceId} to all ${group} tumors (term from edge ${edgeRid})`);
                }
            }
        }
    }

    logger.info(`Uploaded/fetched ${groupingEdges.size} SubClassOf edges to grouping terms`);
    return groupingEdges;
};

/**
 * Check if old grouping links remains.
 *
 * @param {ApiConnection} conn the api connection object
 * @param {object} opt
 * @param {object} opt.groupingEdges ...
 * @param {object} opt.source the oncotree source record
 */
const checkLinks = async (conn, {
    allLiquid,
    allSolid,
    groupingEdges,
    source,
}) => {
    // fetch all existing grouping links
    const result = await conn.getRecords({
        filters: { in: [rid(allLiquid), rid(allSolid)], op: 'IN' },
        target: 'SubClassOf',
    });

    const edges = new Set(
        result
            .filter((r) => r.out.source === rid(source))
            .map((r) => rid(r)),
    );
    const diff = new Set([...edges].filter((edge) => !groupingEdges.has(edge))); // Node16

    if (diff.size > 0) {
        logger.warn(`${diff} extra SubClassOf edges found:`);

        for (const d of diff) {
            logger.warn(`- ${d}`);
        }
    }
};

/**
 * Group each higher-level term from a specific tissue to either all solid or all liquid tumors,
 * given that the Oncotree ontology defines:
 * - a root 'tissue' term
 * - some specific tissues as immediate children (e.g. bone, liver, pancreas, etc.)
 * - a nested graph of terms under each specific tissues
 *
 * Grouping terms have to be tissue-specific.
 *
 * @param {ApiConnection} conn the api connection object
 * @param {object} opt
 * @param {object} opt.source the oncotree source record
 */
const grouping = async (conn, { source }) => {
    const graphkb = await conn.addSource(sources.graphkb);

    // fetch/upload the all solid/liquid tumors terms, and link to cancer term
    const cancer = await cancerTerm(conn, { source: graphkb });
    const allSolid = await groupingTerm(conn, { cancer, source: graphkb, term: 'all solid tumors' });
    const allLiquid = await groupingTerm(conn, { cancer, source: graphkb, term: 'all liquid tumors' });

    // upload links to grouping terms
    const groupingEdges = await uploadLinks(conn, {
        allLiquid,
        allSolid,
        graphkb,
        oncotree: source,
    });

    // check if old links remains
    await checkLinks(conn, {
        allLiquid,
        allSolid,
        groupingEdges,
        source,
    });
};


module.exports = {
    cancerTerm,
    checkLinks,
    grouping,
    groupingTerm,
    uploadLinks,
};
