const rdf = require('rdflib');
const fs = require('fs');


const {
    addRecord, convertOwlGraphToJson, getRecordBy, rid
} = require('./util');


const parseId = (url) => {
    // http://purl.obolibrary.org/obo/VariO_044
    const match = /.*\/VariO_\d+$/.exec(url);
    if (match) {
        return `${match[1].toLowerCase()}`;
    }
    return new Error(`failed to parse: ${url}`);
};


const uploadFile = async ({filename, conn}) => {
    console.log('Loading external NCIT data');
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    console.log(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, 'http://purl.obolibrary.org/obo/vario.owl', 'application/rdf+xml');
    const nodesByCode = convertOwlGraphToJson(graph);
    console.log(nodesByCode);
};

module.exports = {uploadFile};
