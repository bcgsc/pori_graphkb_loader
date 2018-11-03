const rdf = require('rdflib');
const fs = require('fs');


const {
    addRecord, convertOwlGraphToJson, getRecordBy, rid
} = require('./util');


const PREDICATES = {
    name: 'http://www.w3.org/2000/01/rdf-schema#label',
    subclassOf: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    id: 'http://www.geneontology.org/formats/oboInOwl#id',
    description: 'http://purl.obolibrary.org/obo/IAO_0000115'
};


const parseId = (url) => {
    // http://purl.obolibrary.org/obo/VariO_044
    const match = /.*\/(VariO_\d+)$/.exec(url);
    if (match) {
        return `${match[1].toLowerCase().replace('_', ':')}`;
    }
    throw new Error(`failed to parse: ${url}`);
};


const uploadFile = async ({filename, conn}) => {
    console.log('Loading external NCIT data');
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    console.log(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, 'http://purl.obolibrary.org/obo/vario.owl', 'application/rdf+xml');
    const nodesByCode = convertOwlGraphToJson(graph, parseId);

    const source = await addRecord('sources', {
        url: 'http://variationontology.org',
        name: 'VariO'
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
