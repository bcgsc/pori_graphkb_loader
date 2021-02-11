/**
 *
 * Given the DOID JSON file. Upload the diseases and relationships to the knowledgebase using the REST API
 *
 * @module importer/disease_ontology
 */
const Ajv = require('ajv');

const { checkSpec } = require('./util');
const { rid, generateCacheKey } = require('./graphkb');
const { logger } = require('./logging');
const { diseaseOntology: SOURCE_DEFN, ncit: { name: ncitName } } = require('./sources');

const ajv = new Ajv();

const PREFIX_TO_STRIP = 'http://purl.obolibrary.org/obo/';
const DOID_PATTERN = `^${PREFIX_TO_STRIP}DOID_\\d+$`;

const nodeSpec = ajv.compile({
    properties: {
        id: { pattern: DOID_PATTERN, type: 'string' },
        lbl: { type: 'string' },
        meta: {
            properties: {
                basicPropertyValues: {
                    items: {
                        properties: {
                            pred: { type: 'string' },
                            val: { type: 'string' },
                        },
                        required: ['val', 'pred'],
                        type: 'object',
                    },
                    type: 'array',
                },
                definition: {
                    properties: { val: { type: 'string' } },
                    required: ['val'],
                    type: 'object',
                },
                deprecated: { type: 'boolean' },
                subsets: {
                    items: {
                        type: 'string',
                    },
                    type: 'array',
                },
                synonyms: {
                    items: {
                        properties: { val: { type: 'string' } },
                        required: ['val'],
                        type: 'object',
                    },
                    type: 'array',
                },
                xrefs: {
                    items: {
                        properties: { val: { type: 'string' } },
                        required: ['val'],
                        type: 'object',
                    },
                    type: 'array',
                },
            },
            type: 'object',
        },
    },
    required: ['id', 'lbl'],
    type: 'object',
});


const edgeSpec = ajv.compile({
    properties: {
        obj: { pattern: DOID_PATTERN, type: 'string' },
        pred: { type: 'string' },
        sub: { pattern: DOID_PATTERN, type: 'string' },
    },
    required: ['sub', 'pred', 'obj'],
    type: 'object',
});


const parseDoid = (ident) => {
    const match = /.*(DOID_\d+)$/.exec(ident);

    if (!match) {
        throw new Error(`invalid DOID: ${ident}`);
    }
    return match[1].replace('_', ':').toLowerCase();
};


const parseNodeRecord = (record) => {
    checkSpec(nodeSpec, record);
    const {
        id,
        lbl,
        meta: {
            deprecated = false,
            definition: { val: description } = {},
            subsets = [],
            synonyms = [],
            basicPropertyValues = [],
            xrefs = [],
        } = {},
    } = record;

    const hasDeprecated = [];
    const name = lbl.toLowerCase().trim();

    for (const { val, pred } of basicPropertyValues) {
        if (pred.toLowerCase().endsWith('#hasalternativeid')) {
            hasDeprecated.push(val);
        }
    }

    const ncitLinks = [];

    for (const { val: other } of xrefs) {
        let match;

        if (match = /^NCI:(C\d+)$/.exec(other)) {
            ncitLinks.push(`${match[1].toLowerCase()}`);
        }
    }

    const aliases = [];

    for (const { val: alias } of synonyms || []) {
        if (alias.toLowerCase().trim() !== name) {
            aliases.push(alias.toLowerCase().trim());
        }
    }

    return {
        aliases,
        deprecated,
        description,
        hasDeprecated,
        name,
        ncitLinks,
        sourceId: parseDoid(id),
        subsets: subsets.map(subset => subset.replace(PREFIX_TO_STRIP, '')),
    };
};


/* now add the edges to the kb
{
  "sub" : "http://purl.obolibrary.org/obo/DOID_5039",
  "pred" : "is_a",
  "obj" : "http://purl.obolibrary.org/obo/DOID_461"
}
*/
const loadEdges = async ({
    DOID, records, conn, source,
}) => {
    logger.info('adding the subclass relationships');

    for (const edge of DOID.graphs[0].edges) {
        const { sub, pred, obj } = edge;

        if (pred === 'is_a') { // currently only loading this class type
            let src,
                tgt;

            try {
                checkSpec(edgeSpec, edge);
                src = parseDoid(sub).toLowerCase();
                tgt = parseDoid(obj).toLowerCase();


                if (records[src] && records[tgt]) {
                    await conn.addRecord({
                        content: {
                            in: records[tgt]['@rid'],
                            out: records[src]['@rid'],
                            source,
                        },
                        existsOk: true,
                        fetchExisting: false,
                        target: 'SubclassOf',
                    });
                }
            } catch (err) {
                logger.warn(err);
                continue;
            }
        }
    }
};

/**
 * Parses the disease ontology json for disease definitions, relationships to other DO diseases and relationships to NCI disease terms
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({ filename, conn }) => {
    // load the DOID JSON
    logger.info('loading external disease ontology data');
    const DOID = require(filename); // eslint-disable-line import/no-dynamic-require,global-require

    // build the disease ontology first
    const nodesByName = {}; // store by name
    const synonymsByName = {};

    let source = await conn.addRecord({
        content: {
            ...SOURCE_DEFN,
        },
        existsOk: true,
        fetchConditions: { AND: [{ name: SOURCE_DEFN.name }] },
        target: 'Source',
    });
    source = rid(source);
    logger.info(`processing ${DOID.graphs[0].nodes.length} nodes`);
    const recordsBySourceId = {};

    const ncitCache = {};

    try {
        const ncitSource = await conn.getUniqueRecordBy({
            filters: { name: ncitName },
            target: 'Source',
        });
        logger.info(`fetched ncit source record ${rid(ncitSource)}`);
        logger.info('getting existing ncit records');
        const ncitRecords = await conn.getRecords({
            filters: { AND: [{ source: rid(ncitSource) }, { alias: false }] },
            neighbors: 0,
            target: 'Disease',
        });
        logger.info(`cached ${ncitRecords.length} ncit records`);

        for (const record of ncitRecords) {
            ncitCache[generateCacheKey(record)] = rid(record);
        }
    } catch (err) {
        logger.error(err);
    }

    const counts = { error: 0, skip: 0, success: 0 };

    for (let i = 0; i < DOID.graphs[0].nodes.length; i++) {
        const node = DOID.graphs[0].nodes[i];
        logger.info(`processing ${node.id} (${i} / ${DOID.graphs[0].nodes.length})`);
        let row;

        try {
            row = parseNodeRecord(node);
        } catch (err) {
            logger.error(err);
            counts.error++;
            continue;
        }

        const {
            name,
            sourceId,
            description,
            deprecated,
            subsets,
            aliases,
            hasDeprecated,
            ncitLinks,
        } = row;

        if (nodesByName[name] !== undefined) {
            throw new Error(`name is not unique ${name}`);
        }
        synonymsByName[name] = [];
        // create the database entry
        const record = await conn.addRecord({
            content: {
                alias: false,
                deprecated,
                description,
                name,
                source,
                sourceId,
                subsets,
            },
            existsOk: true,
            fetchConditions: {
                AND: [
                    { sourceId }, { name }, { source },
                ],
            },
            fetchFirst: true,
            target: 'Disease',
            upsert: true,
            upsertCheckExclude: ['sourceIdVersion'],
        });

        if (recordsBySourceId[record.sourceId] !== undefined) {
            throw new Error(`sourceID is not unique: ${record.sourceId}`);
        }
        recordsBySourceId[record.sourceId] = record;

        // create synonyms and links
        for (const alias of aliases) {
            try {
                const synonym = await conn.addRecord({
                    content: {
                        alias: true,
                        name: alias,
                        source,
                        sourceId: record.sourceId,
                    },
                    existsOk: true,
                    fetchConditions: {
                        AND: [
                            { name: alias },
                            { source },
                            { sourceId: record.sourceId },
                        ],
                    },
                    target: 'Disease',
                    upsert: true,
                });
                await conn.addRecord({
                    content: {
                        in: rid(record),
                        out: rid(synonym),
                        source,
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'AliasOf',
                });
            } catch (err) {
                logger.error(`Failed to create alias (${record.sourceId}, ${record.name}) ${alias}`);
                console.error(err);
                logger.error(err);
            }
        }

        // create deprecatedBy links for the old sourceIDs
        for (const alternateId of hasDeprecated) {
            try {
                const alternate = await conn.addRecord({
                    content: {
                        deprecated: true,
                        name: record.name,
                        source,
                        sourceId: alternateId,
                    },
                    existsOk: true,
                    fetchConditions: {
                        AND: [
                            { source },
                            { sourceId: alternateId },
                            { name: record.name },
                        ],
                    },
                    target: 'Disease',
                    upsert: true,
                });
                await conn.addRecord({
                    content: { in: rid(record), out: rid(alternate), source },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'DeprecatedBy',
                });
            } catch (err) {
                logger.error(`Failed to create deprecated form (${record.sourceId}) ${alternateId}`);
                logger.error(err);
            }
        }

        // link to existing ncit records
        for (const ncit of ncitLinks) {
            const key = generateCacheKey({ sourceId: ncit });

            if (!ncitCache[key]) {
                logger.warn(`failed to link ${record.sourceId} to ${key}. Missing record`);
            } else {
                await conn.addRecord({
                    content: { in: rid(ncitCache[key]), out: rid(record), source },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'CrossreferenceOf',
                });
            }
        }
    }

    await loadEdges({
        DOID, conn, records: recordsBySourceId, source,
    });
    logger.info(JSON.stringify(counts));
};


module.exports = {
    SOURCE_DEFN, parseNodeRecord, uploadFile,
};
