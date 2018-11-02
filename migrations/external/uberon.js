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
    addRecord, getRecordBy, convertOwlGraphToJson, orderPreferredOntologyTerms
} = require('./util');


const parseUberonId = (string) => {
    const match = /.*\/UBERON_(\d+)$/.exec(string);
    if (match) {
        return `uberon:${match[1]}`;
    }
    throw new Error(`failed to parser ID from ${string}`);
};

const parseSubsetName = (string) => {
    const match = /.*\/([^/]+)$/.exec(string);
    if (match) {
        return match[1];
    }
    return string;
};


const PRED_MAP = {
    CROSS_REF: 'http://www.geneontology.org/formats/oboInOwl#hasDbXref',
    SUBCLASSOF: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    SUBSETOF: 'http://www.geneontology.org/formats/oboInOwl#inSubset',
    LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
    DESCRIPTION: 'http://purl.obolibrary.org/obo/IAO_0000115',
    DEPRECATED: 'http://www.w3.org/2002/07/owl#deprecated'
};


const uploadFile = async ({filename, conn}) => {
    console.log('Loading the external uberon data');
    console.log(`reading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    const graph = rdf.graph();
    const records = {};
    const ncitLinks = [];
    console.log(`parsing: ${filename}`);
    rdf.parse(content, graph, 'http://purl.obolibrary.org/obo/uberon.owl', 'application/rdf+xml');

    const nodesByCode = convertOwlGraphToJson(graph, parseUberonId);

    const subclassEdges = [];
    const source = await addRecord('sources', {name: 'uberon'}, conn, {existsOk: true});

    console.log(`Adding the uberon ${Object.keys(nodesByCode).length} entity nodes`);
    for (const node of Object.values(nodesByCode)) {
        if (!node[PRED_MAP.LABEL] || !node.code) {
            continue;
        }
        const body = {
            source: source['@rid'],
            name: node[PRED_MAP.LABEL][0],
            sourceId: node.code
        };
        if (node[PRED_MAP.DESCRIPTION]) {
            body.description = node[PRED_MAP.DESCRIPTION][0];
        }
        if (node[PRED_MAP.SUBSETOF]) {
            body.subsets = Array.from(node[PRED_MAP.SUBSETOF], parseSubsetName);
        }
        if (node[PRED_MAP.SUBCLASSOF]) {
            for (const parentCode of node[PRED_MAP.SUBCLASSOF]) {
                subclassEdges.push({src: node.code, tgt: parentCode});
            }
        }
        if (node[PRED_MAP.CROSS_REF]) {
            for (let aliasCode of node[PRED_MAP.CROSS_REF]) {
                aliasCode = aliasCode.toLowerCase();
                if (/^ncit:c\d+$/.exec(aliasCode)) {
                    ncitLinks.push({src: node.code, tgt: aliasCode.slice('ncit:'.length), source: source['@rid']});
                }
            }
        }
        if (node[PRED_MAP.DEPRECATED] && node[PRED_MAP.DEPRECATED][0] === 'true') {
            body.deprecated = true;
        }
        const dbEntry = await addRecord('anatomicalentities', body, conn, {existsOk: true});
        records[dbEntry.sourceId] = dbEntry;
    }
    console.log(`\nAdding the ${subclassEdges.length} subclassof relationships`);
    for (const {src, tgt} of subclassEdges) {
        if (records[src] && records[tgt]) {
            await addRecord('subclassof', {
                out: records[src]['@rid'],
                in: records[tgt]['@rid'],
                source: source['@rid']
            }, conn, {existsOk: true});
        } else {
            process.stdout.write('x');
        }
    }

    console.log(`\nAdding the ${ncitLinks.length} uberon/ncit aliasof relationships`);
    for (const {src, tgt} of ncitLinks) {
        if (records[src] === undefined) {
            continue;
        }
        try {
            const ncitRecord = await getRecordBy('anatomicalentities', {source: {name: 'ncit'}, sourceId: tgt}, conn, orderPreferredOntologyTerms);
            await addRecord('aliasof', {
                out: records[src]['@rid'],
                in: ncitRecord['@rid'],
                source: source['@rid']
            }, conn, {existsOk: true});
        } catch (err) {
            // ignore missing vocabulary
            process.stdout.write('x');
        }
    }
    console.log();
};

module.exports = {uploadFile};
