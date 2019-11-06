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
    type: 'object',
    required: ['id', 'lbl'],
    properties: {
        id: { type: 'string', pattern: DOID_PATTERN },
        lbl: { type: 'string' },
        meta: {
            type: 'object',
            properties: {
                deprecated: { type: 'boolean' },
                definition: {
                    type: 'object',
                    required: ['val'],
                    properties: { val: { type: 'string' } },
                },
                subsets: {
                    type: 'array',
                    items: {
                        type: 'string',
                    },
                },
                synonyms: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['val'],
                        properties: { val: { type: 'string' } },
                    },
                },
                basicPropertyValues: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['val', 'pred'],
                        properties: {
                            val: { type: 'string' },
                            pred: { type: 'string' },
                        },
                    },
                },
                xrefs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['val'],
                        properties: { val: { type: 'string' } },
                    },
                },
            },
        },
    },
});


const edgeSpec = ajv.compile({
    type: 'object',
    required: ['sub', 'pred', 'obj'],
    properties: {
        sub: { type: 'string', pattern: DOID_PATTERN },
        pred: { type: 'string' },
        obj: { type: 'string', pattern: DOID_PATTERN },
    },
});


const parseDoid = (ident) => {
    const match = /.*(DOID_\d+)$/.exec(ident);

    if (!match) {
        throw new Error(`invalid DOID: ${ident}`);
    }
    return match[1].replace('_', ':').toLowerCase();
};

const parseDoVersion = (version) => {
    // ex. 'http://purl.obolibrary.org/obo/doid/releases/2018-03-02/doid.owl'
    const m = /releases\/(\d\d\d\d-\d\d-\d\d)\//.exec(version);
    return m[1];
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
        ncitLinks,
        hasDeprecated,
        deprecated,
        aliases,
        sourceId: parseDoid(id),
        name,
        description,
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
            } catch (err) {
                logger.warn(err);
                continue;
            }

            if (records[src] && records[tgt]) {
                await conn.addRecord({
                    target: 'SubclassOf',
                    content: {
                        out: records[src]['@rid'],
                        in: records[tgt]['@rid'],
                        source,
                    },
                    existsOk: true,
                    fetchExisting: false,
                });
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

    const doVersion = parseDoVersion(DOID.graphs[0].meta.version);
    let source = await conn.addRecord({
        target: 'Source',
        content: {
            ...SOURCE_DEFN,
            version: doVersion,
        },
        existsOk: true,
        fetchConditions: { AND: [{ name: SOURCE_DEFN.name }, { version: doVersion }] },
    });
    source = rid(source);
    logger.info(`processing ${DOID.graphs[0].nodes.length} nodes`);
    const recordsBySourceId = {};

    const ncitCache = {};

    try {
        const ncitSource = await conn.getUniqueRecordBy({
            target: 'Source',
            filters: { name: ncitName },
        });
        logger.info(`fetched ncit source record ${rid(ncitSource)}`);
        logger.info('getting existing ncit records');
        const ncitRecords = await conn.getRecords({
            target: 'Disease',
            filters: { AND: [{ source: rid(ncitSource) }, { dependency: null }] },
            neighbors: 0,
        });
        logger.info(`cached ${ncitRecords.length} ncit records`);

        for (const record of ncitRecords) {
            ncitCache[generateCacheKey(record)] = rid(record);
        }
    } catch (err) {
        logger.error(err);
    }

    const counts = { error: 0, success: 0, skip: 0 };

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
            target: 'Disease',
            content: {
                source,
                sourceId,
                name,
                deprecated,
                description,
                subsets,
            },
            existsOk: true,
            fetchConditions: {
                AND: [
                    { sourceId }, { deprecated }, { name }, { source },
                ],
            },
        });

        if (recordsBySourceId[record.sourceId] !== undefined) {
            throw new Error(`sourceID is not unique: ${record.sourceId}`);
        }
        recordsBySourceId[record.sourceId] = record;

        // create synonyms and links
        for (const alias of aliases) {
            try {
                const synonym = await conn.addRecord({
                    target: 'Disease',
                    content: {
                        sourceId: record.sourceId,
                        name: alias,
                        dependency: rid(record),
                        source,
                    },
                    existsOk: true,
                });
                await conn.addRecord({
                    target: 'AliasOf',
                    content: {
                        out: rid(synonym),
                        in: rid(record),
                        source,
                    },
                    existsOk: true,
                    fetchExisting: false,
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
                    target: 'Disease',
                    content: {
                        sourceId: alternateId,
                        name: record.name,
                        deprecated: true,
                        dependency: rid(record),
                        source,
                    },
                    existsOk: true,
                });
                await conn.addRecord({
                    target: 'DeprecatedBy',
                    content: { out: rid(alternate), in: rid(record), source },
                    existsOk: true,
                    fetchExisting: false,
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
                    target: 'CrossreferenceOf',
                    content: { out: rid(record), in: rid(ncitCache[key]), source },
                    existsOk: true,
                    fetchExisting: false,
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
    uploadFile, dependencies: [ncitName], SOURCE_DEFN, parseNodeRecord,
};
