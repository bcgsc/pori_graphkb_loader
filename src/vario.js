/**
 * @module importer/vario
 */

const rdf = require('rdflib');
const fs = require('fs');


const { convertOwlGraphToJson } = require('./util');
const { rid } = require('./graphkb');
const { logger } = require('./logging');


const PREDICATES = {
    name: 'http://www.w3.org/2000/01/rdf-schema#label',
    subclassOf: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    id: 'http://www.geneontology.org/formats/oboInOwl#id',
    description: 'http://purl.obolibrary.org/obo/IAO_0000115',
};

const OWL_NAMESPACE = 'http://purl.obolibrary.org/obo/vario.owl';

const SOURCE_DEFN = {
    name: 'vario',
    usage: 'http://variationontology.org/citing.shtml',
    url: 'http://variationontology.org',
    description: 'Variation Ontology, VariO, is an ontology for standardized, systematic description of effects, consequences and mechanisms of variations. VariO allows unambiguous description of variation effects as well as computerized analyses over databases utilizing the ontology for annotation. VariO is a position specific ontology that can be used to describe effects of variations on DNA, RNA and/or protein level, whatever is appropriate.',
};

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
const uploadFile = async ({ filename, conn }) => {
    logger.info(`Loading external ${SOURCE_DEFN.name} data`);
    logger.info(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    logger.info(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, OWL_NAMESPACE, 'application/rdf+xml');
    const nodesByCode = convertOwlGraphToJson(graph, parseId);

    const source = await conn.addRecord({
        target: 'Source',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
    });

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
            source: rid(source),
        };

        for (const tgt of original[PREDICATES.subclassOf] || []) {
            subclassEdges.push([code, tgt]);
        }
        recordsByCode[code] = await conn.addRecord({ target: 'vocabulary', content: node, existsOk: true });
    }

    for (const [srcCode, tgtCode] of subclassEdges) {
        const src = recordsByCode[srcCode];
        const tgt = recordsByCode[tgtCode];

        if (src && tgt) {
            await conn.addRecord({
                target: 'subclassof',
                content: {
                    out: rid(src), in: rid(tgt), source: rid(source),
                },
                existsOk: true,
                fetchExisting: false,
            });
        }
    }
};

module.exports = { uploadFile, SOURCE_DEFN };
