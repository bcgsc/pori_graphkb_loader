/**
 * Load a custom JSON file
 *
 * @module importer/ontology
 */

const Ajv = require('ajv');
const fs = require('fs');
const jsonpath = require('jsonpath');

const {schema: {schema: kbSchema}} = require('@bcgsc/knowledgebase-schema');


const {logger} = require('./logging');
const {rid} = require('./util');

const ajv = new Ajv();


const EDGE_CLASSES = [
    'AliasOf',
    'SubClassOf',
    'ElementOf',
    'GeneralizationOf',
    'OppositeOf',
    'DeprecatedBy'
];
const INPUT_ERROR_CODE = 2;


const validateSpec = ajv.compile({
    type: 'object',
    properties: {
        defaultNameToSourceId: {type: 'boolean'},
        source: {
            type: 'object',
            required: ['name'],
            properties: {
                name: {type: 'string', minLength: 1},
                usage: {type: 'string', format: 'uri'},
                version: {type: 'string'},
                description: {type: 'string'},
                url: {type: 'string', format: 'uri'}
            }
        },
        class: {
            type: 'string',
            enum: kbSchema.Ontology.descendantTree(true).map(model => model.name)
        },
        records: {
            type: 'object',
            additionalProperties: {
                type: 'object',
                properties: {
                    name: {type: 'string'},
                    sourceIdVersion: {type: 'string'},
                    url: {type: 'string', format: 'uri'},
                    description: {type: 'string'},
                    comment: {type: 'string'},
                    // edges
                    links: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['class', 'target'],
                            properties: {
                                class: {type: 'string', enum: EDGE_CLASSES},
                                target: {type: 'string', minLength: 1},
                                additionalProperties: false
                            }
                        }
                    }
                }
            }
        }
    }
});


/**
 * Upload the JSON ontology file
 *
 * @param {object} opt
 * @param {string} opt.data the JSON data to be loaded
 * @param {ApiConnection} opt.conn the graphKB api connection
 */
const uploadFromJSON = async ({data, conn}) => {
    const counts = {success: 0, errors: 0, skipped: 0};
    // validate that it follows the expected pattern
    if (!validateSpec(data)) {
        logger.error(
            `Spec Validation failed #${
                validateSpec.errors[0].dataPath
            } ${
                validateSpec.errors[0].message
            } found ${
                jsonpath.query(data, `$${validateSpec.errors[0].dataPath}`)
            }`
        );
        process.exit(INPUT_ERROR_CODE);
    }
    // build the specification for checking records
    // check that all the keys make sense for linking
    const {
        records, source, class: recordClass, defaultNameToSourceId
    } = data;
    for (const sourceId of Object.keys(records)) {
        const record = records[sourceId];
        record.sourceId = sourceId;
        if (!record.name && defaultNameToSourceId) {
            record.name = sourceId;
        }
        for (const {target, class: edgeClass} of record.links || []) {
            if (records[target] === undefined) {
                logger.log('error', `Invalid link (${edgeClass}) from ${sourceId} to undefined record ${target}`);
                counts.errors++;
            }
        }
    }
    if (counts.errors) {
        logger.log('error', 'There are errors in the JSON file, will not attempt to upload');
        process.exit(INPUT_ERROR_CODE);
    }

    // try to create/fetch the source record
    let sourceRID;
    try {
        sourceRID = rid(await conn.addRecord({
            endpoint: 'sources',
            content: source,
            existsOk: true
        }));
    } catch (err) {
        console.error(err);
        logger.log('error', `unable to create the source record ${err}`);
        process.exit(INPUT_ERROR_CODE);
    }

    const dbRecords = {}; // store the created/fetched records from the db
    const {routeName} = kbSchema[recordClass];
    // try to create all the records
    logger.log('info', 'creating the records');
    for (const {links, ...record} of Object.values(records)) {
        try {
            const dbRecord = await conn.addRecord({
                endpoint: routeName.slice(1),
                content: {...record, source: sourceRID},
                existsOk: true
            });
            dbRecords[record.sourceId] = rid(dbRecord);
            counts.success++;
        } catch (err) {
            logger.log('error', err);
            counts.errors++;
        }
    }
    // try to create all the links
    logger.log('info', 'creating the record links');
    for (const {links = [], sourceId} of Object.values(records)) {
        for (const {class: edgeType, target} of links) {
            const {routeName: edgeRoute} = kbSchema[edgeType];
            if (dbRecords[target] === undefined || dbRecords[sourceId] === undefined) {
                counts.skipped++;
                continue;
            }
            try {
                await conn.addRecord({
                    endpoint: edgeRoute.slice(1),
                    content: {out: dbRecords[sourceId], in: dbRecords[target], source: sourceRID},
                    existsOk: true,
                    fetchExisting: false
                });
                counts.success++;
            } catch (err) {
                logger.log('error', err);
                counts.errors++;
            }
        }
    }
    // report the success rate
    logger.log('info', JSON.stringify(counts));
};


/**
 * Upload the JSON ontology file
 *
 * @param {object} opt
 * @param {string} opt.filename the path to the JSON input file
 * @param {ApiConnection} opt.conn the graphKB api connection
 */
const uploadFile = async ({filename, conn}) => {
    logger.log('info', `reading: ${filename}`);
    const data = JSON.parse(fs.readFileSync(filename));

    await uploadFromJSON({data, conn});
};


module.exports = {uploadFile, uploadFromJSON};
