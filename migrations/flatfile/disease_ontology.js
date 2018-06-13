/**
 * Given the DOID JSON file. Upload the diseases and relationships to the knowledgebase using the REST API
 */

const _ = require('lodash');
const request = require('request-promise');
const {addRecord, getRecordBy} = require('./util');

const PREFIX_TO_STRIP = 'http://purl.obolibrary.org/obo/';
const SOURCE_NAME = 'disease ontology';

const parseDoid = (ident) => {
    const match = /.*(DOID_\d+)$/.exec(ident);
    if (! match) {
        throw new Error(`invalid DOID: ${ident}`);
    }
    ident = match[1].replace('_', ':').toLowerCase();
    return ident;
};

const parseDoVersion = (version) => {
    // ex. 'http://purl.obolibrary.org/obo/doid/releases/2018-03-02/doid.owl'
    const m = /releases\/(\d\d\d\d-\d\d-\d\d)\//.exec(version);
    return m[1];
};

/**
 * Parses the disease ontology json for disease definitions, relationships to other DO diseases and relationships to NCI disease terms
 *
 * @param {Object} opt
 */
const uploadDiseaseOntology = async ({filename, conn}) => {
    // load the DOID JSON
    const DOID = require(filename);

    // build the disease ontology first
    const nodesByName = {};  // store by name
    const deprecatedNodes = {};
    const synonymsByName = {};
    const ncitAliases = {};

    const doVersion = parseDoVersion(DOID.graphs[0].meta.version);
    const source = await addRecord('sources', {
        name: SOURCE_NAME,
        version: doVersion
    }, conn, true);
    console.log('\nAdding/getting the disease nodes');

    let ncitSource;
    try {
        ncitSource = await getRecordBy('sources', {name: 'ncit'}, conn);
    } catch (err) {}

    for (let node of DOID.graphs[0].nodes) {
        if (node.id === undefined || node.lbl === undefined) {
            continue;
        }
        try {
            node.id = parseDoid(node.id);
        } catch (err) {
            continue;
        }
        node.lbl = node.lbl.toLowerCase();
        nodesByName[node.lbl] = {
            source: source,
            sourceId: node.id,
            name: node.lbl
        };
        synonymsByName[node.lbl] = [];
        if (node.meta === undefined) {
            continue;
        }
        if (node.meta.definition && node.meta.definition.val) {
            nodesByName[node.lbl].description = node.meta.definition.val;
        }
        if (node.meta.subsets) {
            nodesByName[node.lbl].subsets = Array.from(node.meta.subsets, (subset) => {return subset.replace(PREFIX_TO_STRIP, '');});
        }
        deprecatedNodes[node.lbl] = node.meta.deprecated;
        if (node.meta && node.meta.synonyms) {
            for (let {val: alias} of node.meta.synonyms) {
                alias = alias.toLowerCase();
                if (alias !== node.lbl) {
                    synonymsByName[node.lbl].push(alias.toLowerCase());
                }
            }
        }
        if (ncitSource == undefined) {
            continue;
        }
        for (let {val: other} of (node.meta.xrefs || [])) {
            let match;
            if (match = /^NCI:(C\d+)$/.exec(other)) {
                try {
                    const ncitId = `ncit:${match[1].toLowerCase()}`;
                    const ncitNode = await getRecordBy('diseases', {source: ncitSource, sourceId: ncitId}, conn);
                    if (ncitAliases[node.id] === undefined) {
                        ncitAliases[node.id] = [];
                    }
                    ncitAliases[node.id].push(ncitNode);
                    process.stdout.write('.');
                } catch (err) {
                    process.stdout.write('x');
                }
            }
        }
    }
    console.log(`\nparsed ncit links: ${Object.keys(ncitAliases).length}`);

    const diseaseRecords = {};
    for (let name of Object.keys(nodesByName)) {
        const node = nodesByName[name];
        let newRecord = await addRecord('diseases', node, conn, true);

        if (diseaseRecords[newRecord.sourceId] !== undefined) {
            console.log(newRecord);
            console.log(diseaseRecords[newRecord.sourceId]);
            console.log(Object.keys(diseaseRecords));
            throw new Error(`expected source id to be unique for this load: ${newRecord.sourceId}`);
        }
        diseaseRecords[newRecord.sourceId] = newRecord;
    }
    console.log('\nAdding the aliasof and deprecatedby links');

    for (let record of _.values(diseaseRecords)) {
        for (let synonym of synonymsByName[record.name]) {
            // get the synonym record
            try {
                synonym = await getRecordBy('diseases', {name: synonym, deletedAt: 'null', source: record.source}, conn);
            } catch (err) {
                synonym = await addRecord('diseases', {
                    name: synonym,
                    sourceId: record.sourceId,
                    source: source
                }, conn);
                process.stdout.write('.');
            }
            try {
                await request(conn.request({
                    method: 'POST',
                    uri: 'aliasof',
                    body: {out: synonym['@rid'], in: record['@rid'], source: source}
                }));
                process.stdout.write('.');
            } catch (err) {
                if (! err.error || ! err.error.message || ! err.error.message.startsWith('Cannot index')) {
                    console.log({out: synonym['@rid'], in: record['@rid']});
                    console.log(err.error);
                } else {
                    process.stdout.write('*');
                }
            }
        }
    }
    // add the ncit edges
    console.log('\nadding the doid => ncit aliasof links', Object.keys(ncitAliases).length);
    for (let nodeLbl of Object.keys(ncitAliases)) {
        if (! diseaseRecords[nodeLbl]) {
            continue;
        }
        const curr = diseaseRecords[nodeLbl]['@rid'];
        for (let other of ncitAliases[nodeLbl]) {
            await addRecord('aliasof', {out: curr, in: other['@rid'], source: source}, conn, true);
        }
    }

    await loadEdges({DOID, conn, records: diseaseRecords, source});
};

/* now add the edges to the kb
{
  "sub" : "http://purl.obolibrary.org/obo/DOID_5039",
  "pred" : "is_a",
  "obj" : "http://purl.obolibrary.org/obo/DOID_461"
}
*/
const loadEdges = async ({DOID, records, conn, source}) => {
    const relationshipTypes = {};
    console.log('\nAdding the subclass relationships');
    for (let edge of DOID.graphs[0].edges) {
        const {sub, pred, obj} = edge;
        if (pred === 'is_a') {  // currently only loading this class type
            let src, tgt;
            try {
                src = parseDoid(sub).toLowerCase();
                tgt = parseDoid(obj).toLowerCase();
            } catch (err) {
                continue;
            }
            if (! records[src] || ! records[tgt]) {
                //console.log(`missing entries for ${src} ==is_a=> ${tgt}`);
            } else {
                try {
                    await request(conn.request({
                        method: 'POST',
                        uri: 'subclassof',
                        body: {out: records[src]['@rid'], in: records[tgt]['@rid'], source: source}
                    }));
                    process.stdout.write('.');
                } catch (err) {
                    if (! err.error || ! err.error.message || ! err.error.message.startsWith('Cannot index')) {
                        console.log({out: records[src]['@rid'], in: records[tgt]['@rid']});
                        console.log(err.error);
                    } else {
                        process.stdout.write('*');
                    }
                }
            }
        } else {
            relationshipTypes[pred] = null;
        }
    }
};

module.exports = {uploadDiseaseOntology};
