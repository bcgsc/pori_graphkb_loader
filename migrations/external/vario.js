/**
 * @module migrations/external/vario
 */

const rdf = require('rdflib');
const fs = require('fs');


const {
    addRecord, convertOwlGraphToJson, rid
} = require('./util');
const {logging, progress} = require('./logging');


const PREDICATES = {
    name: 'http://www.w3.org/2000/01/rdf-schema#label',
    subclassOf: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    id: 'http://www.geneontology.org/formats/oboInOwl#id',
    description: 'http://purl.obolibrary.org/obo/IAO_0000115'
};

const OWL_NAMESPACE = 'http://purl.obolibrary.org/obo/vario.owl';
const SOURCE_URL = 'http://variationontology.org';
const SOURCE_NAME = 'VariO';

/**
 * Parse the ID from a url string
 *
 * @param {string} url the url to be parsed
 * @returns {string} the ID string
 * @throws {Error} when the string does not match the expected format
 *
 * @example
 * > parseId(http://purl.obolibrary.org/obo/VariO_044)
 * 'VariO_044'
 */
const parseId = (url) => {
    // http://purl.obolibrary.org/obo/VariO_044
    const match = /.*\/(VariO_\d+)$/.exec(url);
    if (match) {
        return `${match[1].toLowerCase().replace('_', ':')}`;
    }
    throw new Error(`failed to parse: ${url}`);
};


/**
 * Parse the input OWL file and upload the ontology to GraphKB via the API
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input OWL file
 * @param {ApiConnection} opt.conn the api request connection object
 */
const uploadFile = async ({filename, conn}) => {
    logging.info(`Loading external ${SOURCE_NAME} data`);
    logging.info(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    logging.info(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, OWL_NAMESPACE, 'application/rdf+xml');
    const nodesByCode = convertOwlGraphToJson(graph, parseId);

    const source = await addRecord('sources', {
        url: SOURCE_URL,
        name: SOURCE_NAME
    }, conn, {existsOk: true});

    const recordsByCode = {};
    const subclassEdges = [];

    for (const [code, original] of Object.entries(nodesByCode)) {
        if (!original[PREDICATES.name]) {
            continue;
        }
        const node = {
            name: original[PREDICATES.name][0],
            sourceId: code,
            description: (original[PREDICATES.description] || [null])[0],
            source: rid(source)
        };
        for (const tgt of original[PREDICATES.subclassOf] || []) {
            subclassEdges.push([code, tgt]);
        }
        recordsByCode[code] = await addRecord('vocabulary', node, conn, {existsOk: true});
    }
    for (const [srcCode, tgtCode] of subclassEdges) {
        const src = recordsByCode[srcCode];
        const tgt = recordsByCode[tgtCode];
        if (src && tgt) {
            await addRecord('subclassof', {
                out: rid(src), in: rid(tgt), source: rid(source)
            }, conn, {existsOk: true});
        }
    }
    console.log();
};

module.exports = {uploadFile};
