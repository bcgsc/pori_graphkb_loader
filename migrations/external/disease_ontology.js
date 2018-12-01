/**
 * | | |
 * | --- | --- |
 * |Source | Disease Ontology |
 * | About | http://disease-ontology.org/about/ |
 * | Source Type |  Ontology |
 * | Data Example | https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/v2018-07/05/src/ontology/releases/2018-07-05/doid.json |
 * | Data Format | JSON |
 *
 * Given the DOID JSON file. Upload the diseases and relationships to the knowledgebase using the REST API
 *
 * @module migrations/external/disease_ontology
 */
const _ = require('lodash');
const {
    addRecord, getRecordBy, orderPreferredOntologyTerms, rid
} = require('./util');

const PREFIX_TO_STRIP = 'http://purl.obolibrary.org/obo/';
const SOURCE_NAME = 'disease ontology';

const parseDoid = (ident) => {
    const match = /.*(DOID_\d+)$/.exec(ident);
    if (!match) {
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
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({filename, conn}) => {
    // load the DOID JSON
    console.log('Loading external disease ontology data');
    const DOID = require(filename); // eslint-disable-line import/no-dynamic-require,global-require

    // build the disease ontology first
    const nodesByName = {}; // store by name
    const synonymsByName = {};

    const doVersion = parseDoVersion(DOID.graphs[0].meta.version);
    let source = await addRecord('sources', {
        name: SOURCE_NAME,
        version: doVersion
    }, conn, {existsOk: true});
    source = rid(source);
    console.log('\nAdding/getting the disease nodes');
    const recordsBySourceId = {};

    let ncitSource;
    try {
        ncitSource = await getRecordBy('sources', {name: 'ncit'}, conn);
        ncitSource = rid(ncitSource);
    } catch (err) {}

    for (const node of DOID.graphs[0].nodes) {
        if (node.id === undefined || node.lbl === undefined) {
            continue;
        }
        try {
            node.id = parseDoid(node.id);
        } catch (err) {
            continue;
        }
        node.lbl = node.lbl.toLowerCase();
        if (nodesByName[node.lbl] !== undefined) {
            throw new Error(`name is not unique ${node.lbl}`);
        }
        const body = {
            source,
            sourceId: node.id,
            name: node.lbl,
            deprecated: !!(node.meta && node.meta.deprecated)
        };
        synonymsByName[node.lbl] = [];
        if (node.meta !== undefined) {
            if (node.meta.definition && node.meta.definition.val) {
                body.description = node.meta.definition.val;
            }
            if (node.meta.subsets) {
                body.subsets = Array.from(node.meta.subsets, subset => subset.replace(PREFIX_TO_STRIP, ''));
            }
        }
        // create the database entry
        const record = await addRecord('diseases', body, conn, {
            existsOk: true,
            getWhere: _.omit(body, ['description', 'subsets'])
        });

        if (recordsBySourceId[record.sourceId] !== undefined) {
            throw new Error(`sourceID is not unique: ${record.sourceId}`);
        }
        recordsBySourceId[record.sourceId] = record;

        if (node.meta === undefined) {
            continue;
        }

        // create synonyms and links
        if (node.meta.synonyms) {
            for (let {val: alias} of node.meta.synonyms) {
                alias = alias.toLowerCase();
                if (alias === record.name) {
                    continue;
                }
                const synonym = await addRecord('diseases', {
                    sourceId: body.sourceId,
                    name: alias,
                    dependency: rid(record),
                    source
                }, conn, {existsOk: true});
                await addRecord('aliasof', {
                    out: rid(synonym),
                    in: rid(record),
                    source
                }, conn, {existsOk: true});
            }
        }
        // create deprecatedBy links for the old sourceIDs
        if (!node.meta.deprecated) {
            for (const {val, pred} of node.meta.basicPropertyValues || []) {
                if (pred.toLowerCase().endsWith('#hasalternativeid')) {
                    const alternate = await addRecord('diseases', {
                        sourceId: val,
                        name: record.name,
                        deprecated: true,
                        dependency: rid(record),
                        source
                    }, conn, true);
                    await addRecord('deprecatedby', {out: rid(alternate), in: rid(record), source}, conn, {existsOk: true});
                }
            }
        }
        if (ncitSource !== undefined) {
            for (const {val: other} of (node.meta.xrefs || [])) {
                let match;
                if (match = /^NCI:(C\d+)$/.exec(other)) {
                    let ncitNode;
                    try {
                        const ncitId = `${match[1].toLowerCase()}`;
                        ncitNode = await getRecordBy('diseases', {source: ncitSource, sourceId: ncitId}, conn, orderPreferredOntologyTerms);
                    } catch (err) {
                        process.stdout.write('?');
                    }
                    if (ncitNode) {
                        await addRecord('aliasof', {out: rid(record), in: rid(ncitNode), source}, conn, {existsOk: true});
                    }
                }
            }
        }
    }

    await loadEdges({
        DOID, conn, records: recordsBySourceId, source
    });
    console.log();
};

/* now add the edges to the kb
{
  "sub" : "http://purl.obolibrary.org/obo/DOID_5039",
  "pred" : "is_a",
  "obj" : "http://purl.obolibrary.org/obo/DOID_461"
}
*/
const loadEdges = async ({
    DOID, records, conn, source
}) => {
    const relationshipTypes = {};
    console.log('\nAdding the subclass relationships');
    for (const edge of DOID.graphs[0].edges) {
        const {sub, pred, obj} = edge;
        if (pred === 'is_a') { // currently only loading this class type
            let src,
                tgt;
            try {
                src = parseDoid(sub).toLowerCase();
                tgt = parseDoid(obj).toLowerCase();
            } catch (err) {
                continue;
            }
            if (records[src] && records[tgt]) {
                await addRecord('subclassof', {
                    out: records[src]['@rid'],
                    in: records[tgt]['@rid'],
                    source
                }, conn, {existsOk: true});
            }
        } else {
            relationshipTypes[pred] = null;
        }
    }
};

module.exports = {uploadFile, dependencies: ['ncit']};
