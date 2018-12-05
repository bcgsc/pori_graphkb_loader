/**
 * | | |
 * | --- | --- |
 * | Source | Uberon |
 * | About | http://uberon.github.io/about.html |
 * | Source Type | Ontology |
 * | Data Example| http://purl.obolibrary.org/obo/uberon/releases/2018-02-28/uberon.owl |
 * | Data Format| OWL |
 *
 * Module responsible for parsing uberon OWL files and uploading them to the graph KB
 * @module migrations/external/uberon
 */
const rdf = require('rdflib');
const fs = require('fs');
const {
    addRecord, getRecordBy, convertOwlGraphToJson, orderPreferredOntologyTerms, rid
} = require('./util');
const {logger, progress} = require('./logging');

const PREDICATES = {
    CROSS_REF: 'http://www.geneontology.org/formats/oboInOwl#hasDbXref',
    SUBCLASSOF: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    SUBSETOF: 'http://www.geneontology.org/formats/oboInOwl#inSubset',
    LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
    DESCRIPTION: 'http://purl.obolibrary.org/obo/IAO_0000115',
    DEPRECATED: 'http://www.w3.org/2002/07/owl#deprecated'
};
const OWL_NAMESPACE = 'http://purl.obolibrary.org/obo/uberon.owl';
const SOURCE_NAME = 'uberon';

/**
 * Parse the ID from a url
 *
 * @param {string} url the url to be parsed
 * @returns {string} the ID
 * @throws {Error} the ID did not match the expected format
 */
const parseUberonId = (url) => {
    const match = /.*\/UBERON_(\d+)$/.exec(url);
    if (match) {
        return `uberon:${match[1]}`;
    }
    throw new Error(`failed to parser ID from ${url}`);
};

/**
 * Parse the subset ID from a url
 *
 * @param {string} url the url to be parsed
 * @returns {string} the susbet ID
 * @throws {Error} the subset ID did not match the expected format
 */
const parseSubsetName = (url) => {
    const match = /.*\/([^/]+)$/.exec(url);
    if (match) {
        return match[1];
    }
    return url;
};


/**
 * Given the path to an OWL file, upload the parsed ontology
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input OWL file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({filename, conn}) => {
    logger.info('Loading the external uberon data');
    logger.info(`reading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    const graph = rdf.graph();
    const records = {};
    const ncitLinks = [];
    logger.info(`parsing: ${filename}`);
    rdf.parse(content, graph, OWL_NAMESPACE, 'application/rdf+xml');

    const nodesByCode = convertOwlGraphToJson(graph, parseUberonId);

    const subclassEdges = [];
    const source = await addRecord('sources', {name: SOURCE_NAME}, conn, {existsOk: true});

    logger.info(`Adding the uberon ${Object.keys(nodesByCode).length} entity nodes`);
    for (const node of Object.values(nodesByCode)) {
        if (!node[PREDICATES.LABEL] || !node.code) {
            continue;
        }
        const body = {
            source: rid(source),
            name: node[PREDICATES.LABEL][0],
            sourceId: node.code
        };
        if (node[PREDICATES.DESCRIPTION]) {
            body.description = node[PREDICATES.DESCRIPTION][0];
        }
        if (node[PREDICATES.SUBSETOF]) {
            body.subsets = Array.from(node[PREDICATES.SUBSETOF], parseSubsetName);
        }
        if (node[PREDICATES.SUBCLASSOF]) {
            for (const parentCode of node[PREDICATES.SUBCLASSOF]) {
                subclassEdges.push({src: node.code, tgt: parentCode});
            }
        }
        if (node[PREDICATES.CROSS_REF]) {
            for (let aliasCode of node[PREDICATES.CROSS_REF]) {
                aliasCode = aliasCode.toLowerCase();
                if (/^ncit:c\d+$/.exec(aliasCode)) {
                    ncitLinks.push({src: node.code, tgt: aliasCode.slice('ncit:'.length), source: rid(source)});
                }
            }
        }
        if (node[PREDICATES.DEPRECATED] && node[PREDICATES.DEPRECATED][0] === 'true') {
            body.deprecated = true;
        }
        const dbEntry = await addRecord('anatomicalentities', body, conn, {existsOk: true});
        records[dbEntry.sourceId] = dbEntry;
    }
    logger.info(`\nAdding the ${subclassEdges.length} subclassof relationships`);
    for (const {src, tgt} of subclassEdges) {
        if (records[src] && records[tgt]) {
            await addRecord('subclassof', {
                out: records[src]['@rid'],
                in: records[tgt]['@rid'],
                source: rid(source)
            }, conn, {existsOk: true});
        } else {
            progress('x');
        }
    }

    logger.info(`\nAdding the ${ncitLinks.length} uberon/ncit aliasof relationships`);
    for (const {src, tgt} of ncitLinks) {
        if (records[src] === undefined) {
            continue;
        }
        try {
            const ncitRecord = await getRecordBy('anatomicalentities', {source: {name: 'ncit'}, sourceId: tgt}, conn, orderPreferredOntologyTerms);
            await addRecord('aliasof', {
                out: records[src]['@rid'],
                in: rid(ncitRecord),
                source: rid(source)
            }, conn, {existsOk: true});
        } catch (err) {
            // ignore missing vocabulary
            progress('x');
        }
    }
    console.log();
};

module.exports = {uploadFile};
