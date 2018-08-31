/**
 * | | |
 * | --- | --- |
 * | Source | NCIT |
 * | About |  https://cbiit.cancer.gov/about/about-cbiit |
 * | Source Type | Ontology |
 * | Data Example| http://evs.nci.nih.gov/ftp1/NCI_Thesaurus/Thesaurus_18.06d.OWL.zip |
 * | Data Format| OWL |
 *
 *
 * Module responsible for parsing the NCIT owl file and uploading the converted records to the Graph KB
 *
 * NCIT owl file is very large. When uploading additional arguments were specified for node (--stack-size=8192  --max-old-space-size=20000)
 * Additionally node v10 is required since the string size is too small in previous versions
 * @module migrations/external/ncit
 */

const rdf = require('rdflib');
const fs = require('fs');
const _ = require('lodash');


const {addRecord, convertOwlGraphToJson, getRecordBy} = require('./util');

const ROOT_NODES = {
    AGONIST: 'c1514',
    CHEM_MOD: 'c1932',
    PHARMA: 'c1909',
    DISEASE: 'c2991',
    ANATOMY: 'c12219'
};

const PRED_MAP = {
    LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
    CODE: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#NHC0',
    DESCRIPTION: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#P97',
    SUBSETOF: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#A8',
    SYNONYM: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#P90',
    HASPARENT: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#A11',
    SUBCLASSOF: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    DEPRECATED: 'http://www.w3.org/2002/07/owl#deprecated',
    UNII: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#P319',
    CLASS: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#P106'
};


const parseNcitID = (string) => {
    const match = /.*#(C\d+)$/.exec(string);
    if (match) {
        return `${match[1].toLowerCase()}`;
    }
    throw new Error(`failed to parse: ${string}`);
};


const subclassTree = (nodesByCode, roots) => {
    const queue = roots.filter(x => x !== undefined);
    const subtree = {};
    const subclassEdges = [];

    while (queue.length > 0) {
        const currNode = queue.shift();
        subtree[currNode.code] = currNode;
        for (const childCode of currNode.subclasses || []) {
            queue.push(nodesByCode[childCode]);
            subclassEdges.push({tgt: currNode.code, src: childCode});
        }
    }
    return {edges: subclassEdges, tree: subtree};
};


/**
 * Given some list of OWL records, convert to json format and upload to KB through the API
 */
const createRecords = async (inputRecords, dbClassName, conn, source, fdaSource) => {
    const records = {};
    console.log(`\nLoading ${Object.keys(inputRecords).length} ${dbClassName} nodes`);
    for (const node of Object.values(inputRecords)) {
        if (!node[PRED_MAP.CODE] || !node[PRED_MAP.LABEL]) { // do not include anything that does not have at minimum these values
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
            body.subsets = node[PRED_MAP.SUBSETOF];
        }
        if (node[PRED_MAP.DEPRECATED] && node[PRED_MAP.DEPRECATED][0] === 'true') {
            body.deprecated = true;
        }
        const dbEntry = await addRecord(dbClassName, body, conn, {existsOk: true});
        // add the aliasof links
        for (const alias of node[PRED_MAP.SYNONYM] || []) {
            const aliasBody = {
                source: source['@rid'],
                sourceId: node.code,
                dependency: dbEntry['@rid'],
                name: alias
            };
            const aliasRecord = await addRecord(
                dbClassName,
                aliasBody,
                conn,
                {existsOk: true, getWhere: _.omit(aliasBody, ['dependency'])}
            );
            await addRecord(
                'aliasof',
                {source: source['@rid'], out: aliasRecord['@rid'], in: dbEntry['@rid']},
                conn,
                {existsOk: true}
            );
        }
        // add the link to the FDA
        if (fdaSource && node[PRED_MAP.FDA] && node[PRED_MAP.FDA].length) {
            let fdaRec;
            try {
                fdaRec = await getRecordBy(dbClassName, {source: fdaSource['@rid'], name: node[PRED_MAP.FDA][0]}, conn);
            } catch (err) {
                process.write('?');
            }
            if (fdaRec) {
                await addRecord('aliasof', {
                    source: source['@rid'],
                    out: dbEntry['@rid'],
                    in: fdaRec['@rid']
                }, conn, {existsOk: true});
            }
        }
        records[dbEntry.sourceId] = dbEntry;
    }
    return records;
};


const uploadNCIT = async ({filename, conn}) => {
    console.log('Loading external NCIT data');
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    console.log(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl', 'application/rdf+xml');
    const nodesByCode = convertOwlGraphToJson(graph, parseNcitID);

    const source = await addRecord('sources', {name: 'ncit'}, conn, {existsOk: true});
    let fdaSource;
    try {
        fdaSource = await getRecordBy('sources', {name: 'fda'}, conn);
    } catch (err) {
        process.stdout.write('?');
    }

    // for the given source nodes, include all descendents Has_NICHD_Parentdants/subclasses
    for (const node of Object.values(nodesByCode)) {
        for (const parentCode of node[PRED_MAP.SUBCLASSOF] || []) {
            if (!nodesByCode[parentCode]) {
                continue;
            }
            if (!nodesByCode[parentCode].subclasses) {
                nodesByCode[parentCode].subclasses = [];
            }
            nodesByCode[parentCode].subclasses.push(node.code);
        }
    }

    const diseaseNodes = subclassTree(nodesByCode, [nodesByCode[ROOT_NODES.DISEASE]]);
    for (const node of Object.values(nodesByCode)) {
        if (diseaseNodes.tree[node.code] === undefined) {
            if (node[PRED_MAP.CLASS] && node[PRED_MAP.CLASS][0] === 'Neoplastic Process') {
                diseaseNodes[node.code] = node;
            }
        }
    }
    const therapyNodes = subclassTree(nodesByCode, [
        nodesByCode[ROOT_NODES.PHARMA],
        nodesByCode[ROOT_NODES.CHEM_MOD],
        nodesByCode[ROOT_NODES.AGONIST]
    ]);
    const anatomyNodes = subclassTree(nodesByCode, [nodesByCode[ROOT_NODES.ANATOMY]]);
    const subclassEdges = [];
    subclassEdges.push(...diseaseNodes.edges);
    subclassEdges.push(...therapyNodes.edges);
    subclassEdges.push(...anatomyNodes.edges);

    const records = {};
    let result = await createRecords(anatomyNodes.tree, 'anatomicalentities', conn, source, fdaSource);
    Object.assign(records, result);

    result = await createRecords(therapyNodes.tree, 'therapies', conn, source, fdaSource);
    Object.assign(records, result);

    result = await createRecords(diseaseNodes.tree, 'diseases', conn, source, fdaSource);
    Object.assign(records, result);

    console.log(`\nLoading ${subclassEdges.length} subclassof relationships`);
    for (const {src, tgt} of subclassEdges) {
        if (records[src] && records[tgt]) {
            await addRecord('subclassof', {out: records[src]['@rid'], in: records[tgt]['@rid'], source: source['@rid']}, conn, {existsOk: true});
        } else {
            process.stdout.write('x');
        }
    }
    console.log();
    return nodesByCode;
};


module.exports = {uploadNCIT};
