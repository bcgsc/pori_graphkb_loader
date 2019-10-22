/**
 * Loads the Sequence Ontology OWL files
 *
 * http://www.sequenceontology.org/browser
 *
 * @module importer/sequence_ontology
 */

const rdf = require('rdflib');
const fs = require('fs');

const {convertOwlGraphToJson} = require('./util');
const {rid, convertRecordToQueryFilters} = require('./graphkb');
const {logger} = require('./logging');


const SOURCE_DEFN = {
    name: 'sequence ontology',
    description: 'The Sequence Ontology is a set of terms and relationships used to describe the features and attributes of biological sequence. SO includes different kinds of features which can be located on the sequence.',
    url: 'http://www.sequenceontology.org',
    usage: 'http://www.sequenceontology.org/?page_id=269'
};

const OWL_NAMESPACE = 'http://purl.obolibrary.org/obo/so/so-simple.owl';

const PREDICATES = {
    SUBCLASSOF: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    ALIASOF: 'http://www.geneontology.org/formats/oboInOwl#hasExactSynonym',
    LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
    SUBSETOF: 'http://www.geneontology.org/formats/oboInOwl#inSubset',
    CROSSREF: 'http://www.geneontology.org/formats/oboInOwl#hasDbXref',
    DEPRECATED: 'http://www.w3.org/2002/07/owl#deprecated',
    GENERALIZATION: 'http://www.geneontology.org/formats/oboInOwl#hasBroadSynonym',
    TYPE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    DESCRIPTION: 'http://purl.obolibrary.org/obo/IAO_0000115',
    DEPRECATEDBY: 'http://purl.obolibrary.org/obo/IAO_0100001',
    ID: 'http://www.geneontology.org/formats/oboInOwl#id'
};

/**
 * Parse the ID from a url
 *
 * @param {string} url the url to be parsed
 * @returns {string} the ID
 * @throws {Error} the ID did not match the expected format
 */
const parseId = (url) => {
    const match = /.*\/SO_(\d+)$/.exec(url);
    if (match) {
        return `so:${match[1]}`;
    }
    throw new Error(`failed to parser ID from ${url}`);
};


const parseRecord = (code, rawRecord) => {
    if (!rawRecord[PREDICATES.LABEL] || rawRecord[PREDICATES.LABEL].length === 0) {
        throw new Error('Could not find record label');
    }
    const record = {
        content: {
            sourceId: code.toLowerCase(),
            name: rawRecord[PREDICATES.LABEL][0].replace(/_/g, ' ')
        },
        aliases: rawRecord[PREDICATES.ALIASOF] || [],
        subclassof: []
    };

    if (rawRecord[PREDICATES.DESCRIPTION] && rawRecord[PREDICATES.DESCRIPTION].length) {
        record.content.description = rawRecord[PREDICATES.DESCRIPTION][0];
    }
    if (rawRecord[PREDICATES.DEPRECATED] && rawRecord[PREDICATES.DEPRECATED].length) {
        record.content.deprecated = rawRecord[PREDICATES.DEPRECATED][0] === 'true';
    }

    for (const parent of rawRecord[PREDICATES.SUBCLASSOF] || []) {
        if (/^so:[0-9]+$/i.exec(parent)) {
            record.subclassof.push(parent);
        }
    }
    return record;
};


const uploadFile = async ({filename, conn}) => {
    logger.info('Loading the external sequence ontology data');
    logger.info(`reading: ${filename}`);
    const fileContent = fs.readFileSync(filename).toString();
    const graph = rdf.graph();
    logger.info(`parsing: ${filename}`);
    rdf.parse(fileContent, graph, OWL_NAMESPACE, 'application/rdf+xml');

    const source = await conn.addRecord({
        target: 'Source',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });

    const nodesByCode = convertOwlGraphToJson(graph, parseId);
    logger.info(`loading ${Object.keys(nodesByCode).length} records`);
    const records = {};
    const subclassEdges = [];

    for (const [code, rawRecord] of Object.entries(nodesByCode)) {
        try {
            const {content, subclassof} = parseRecord(code, rawRecord);
            const record = await conn.addRecord({
                target: 'vocabulary',
                existsOk: true,
                content: {...content, source: rid(source)},
                fetchConditions: convertRecordToQueryFilters({sourceId: content.sourceId, name: content.name, source: rid(source)})
            });
            records[record.sourceId] = record;
            for (const parent of subclassof) {
                subclassEdges.push({out: code, in: parent});
            }
        } catch (err) {
            logger.warn(`Failed to create the record (code=${code}): ${err.message}`);
        }
    }
    logger.info(`loading ${subclassEdges.length} subclassof links`);
    for (const edge of subclassEdges) {
        if (records[edge.out] && records[edge.in]) {
            await conn.addRecord({
                target: 'subclassof',
                content: {
                    source: rid(source),
                    out: rid(records[edge.out]),
                    in: rid(records[edge.in])
                },
                existsOk: true,
                fetchExisting: false
            });
        } else {
            logger.warn(`Failed to create  subclassof link from ${edge.out} to ${edge.in}`);
        }
    }
};

module.exports = {uploadFile, SOURCE_DEFN};
