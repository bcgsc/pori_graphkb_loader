/**
 * Load a custom JSON file
 *
 * @module importer/ontology
 */

const Ajv = require('ajv');
const fs = require('fs');
const jsonpath = require('jsonpath');
const _ = require('lodash');

const { schema, schema: { schema: kbSchema } } = require('@bcgsc/knowledgebase-schema');


const { logger } = require('./logging');
const { rid, convertRecordToQueryFilters } = require('./graphkb');

const ajv = new Ajv();

const INPUT_ERROR_CODE = 2;


const validateSpec = ajv.compile({
    type: 'object',
    required: ['class', 'sources', 'records'],
    properties: {
        defaultNameToSourceId: { type: 'boolean' },
        sources: {
            type: 'object',
            required: ['default'],
            properties: {
                default: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string', minLength: 1 },
                        usage: { type: 'string', format: 'uri' },
                        version: { type: 'string' },
                        description: { type: 'string' },
                        url: { type: 'string', format: 'uri' },
                    },
                },
            },
            additionalProperties: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', minLength: 1 },
                    usage: { type: 'string', format: 'uri' },
                    version: { type: 'string' },
                    description: { type: 'string' },
                    url: { type: 'string', format: 'uri' },
                },
            },
        },
        class: {
            type: 'string',
            enum: kbSchema.Ontology.descendantTree(true).map(model => model.name),
        },
        records: {
            type: 'object',
            additionalProperties: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    sourceIdVersion: { type: 'string' },
                    sourceId: { type: 'string' }, // defaults to the record key
                    url: { type: 'string', format: 'uri' },
                    description: { type: 'string' },
                    comment: { type: 'string' },
                    // edges
                    links: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['class', 'target'],
                            properties: {
                                class: { type: 'string', enum: schema.getEdgeModels().map(e => e.name) },
                                target: { type: 'string', minLength: 1 },
                                additionalProperties: false,
                            },
                        },
                    },
                },
            },
        },
    },
});


/**
 * Upload the JSON ontology file
 *
 * @param {object} opt
 * @param {string} opt.data the JSON data to be loaded
 * @param {ApiConnection} opt.conn the graphKB api connection
 */
const uploadFromJSON = async ({ data, conn }) => {
    const counts = { success: 0, errors: 0, skipped: 0 };

    // validate that it follows the expected pattern
    if (!validateSpec(data)) {
        logger.error(
            `Spec Validation failed #${
                validateSpec.errors[0].dataPath
            } ${
                validateSpec.errors[0].message
            } found ${
                jsonpath.query(data, `$${validateSpec.errors[0].dataPath}`)
            }`,
        );
        process.exit(INPUT_ERROR_CODE);
    }
    // build the specification for checking records
    // check that all the keys make sense for linking
    const {
        records, sources, class: recordClass, defaultNameToSourceId,
    } = data;

    for (const recordKey of Object.keys(records)) {
        const record = records[recordKey];

        if (!record.sourceId) {
            record.sourceId = recordKey;
        }
        if (record.source && !sources[record.source]) {
            logger.error(`Missing source definition (${record.source})`);
            counts.errors++;
        }

        if (!record.name && defaultNameToSourceId) {
            record.name = record.sourceId;
        }

        for (const { target, class: edgeClass, source } of record.links || []) {
            if (records[target] === undefined) {
                logger.log('error', `Invalid link (${edgeClass}) from ${recordKey} to undefined record ${target}`);
                counts.errors++;
            }
            if (source && !sources[source]) {
                logger.error(`Missing source definition (${record.source})`);
                counts.errors++;
            }
        }
    }

    if (counts.errors) {
        logger.log('error', 'There are errors in the JSON file, will not attempt to upload');
        process.exit(INPUT_ERROR_CODE);
    }

    // try to create/fetch the source record
    const sourcesRecords = {};

    try {
        await Promise.all(Object.entries(sources).map(async ([sourceKey, sourceDefn]) => {
            const sourceRID = rid(await conn.addRecord({
                target: 'Source',
                content: sourceDefn,
                existsOk: true,
                fetchConditions: { name: sourceDefn.name },
            }));
            sourcesRecords[sourceKey] = sourceRID;
        }));
    } catch (err) {
        console.error(err);
        logger.log('error', `unable to create the source records ${err}`);
        process.exit(INPUT_ERROR_CODE);
    }

    const dbRecords = {}; // store the created/fetched records from the db
    // try to create all the records
    logger.log('info', 'creating the records');

    for (const key of Object.keys(records)) {
        const { links, ...record } = records[key];

        if (!record.source) {
            record.source = sourcesRecords.default;
        } else {
            record.source = sourcesRecords[record.source];
        }

        try {
            const dbRecord = await conn.addRecord({
                target: recordClass,
                content: { ...record },
                fetchConditions: convertRecordToQueryFilters(_.omit(record, ['description'])),
                existsOk: true,
            });
            dbRecords[key] = rid(dbRecord);
            counts.success++;
        } catch (err) {
            logger.log('error', err);
            counts.errors++;
        }
    }
    // try to create all the links
    logger.log('info', 'creating the record links');

    for (const key of Object.keys(records)) {
        const { links = [] } = records[key];

        for (const { class: edgeType, target, source = 'default' } of links) {
            if (dbRecords[target] === undefined || dbRecords[key] === undefined) {
                counts.skipped++;
                continue;
            }

            try {
                await conn.addRecord({
                    target: edgeType,
                    content: {
                        out: dbRecords[key],
                        in: dbRecords[target],
                        source: sourcesRecords[source],
                    },
                    existsOk: true,
                    fetchExisting: false,
                });
                counts.success++;
            } catch (err) {
                logger.log('error', err);
                counts.errors++;
            }
        }
    }
    // report the success rate
    logger.info(`processed: ${JSON.stringify(counts)}`);
};


/**
 * Upload the JSON ontology file
 *
 * @param {object} opt
 * @param {string} opt.filename the path to the JSON input file
 * @param {ApiConnection} opt.conn the graphKB api connection
 */
const uploadFile = async ({ filename, conn }) => {
    logger.log('info', `reading: ${filename}`);
    const data = JSON.parse(fs.readFileSync(filename));

    await uploadFromJSON({ data, conn });
};


module.exports = { uploadFile, uploadFromJSON };
