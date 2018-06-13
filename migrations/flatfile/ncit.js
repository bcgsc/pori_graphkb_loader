/**
 * Module responsible for parsing the NCIT owl file and uploading the converted records to the Graph KB
 *
 * NCIT owl file is very large. When uploading additional arguments were specified for node (--stack-size=8192  --max-old-space-size=20000)
 * Additionally node v10 is required since the string size is too small in previous versions
 */

 /*

Example record

<!-- http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C100032 -->

<owl:Class rdf:about="http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C100032">
    <rdfs:subClassOf rdf:resource="http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C35552"/>
    <A8 rdf:resource="http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C101837"/>
    <A8 rdf:resource="http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C101838"/>
    <A8 rdf:resource="http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C61410"/>
    <A8 rdf:resource="http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C66830"/>
    <NHC0>C100032</NHC0>
    <P106>Classification</P106>
    <P108>American College of Cardiology/American Heart Association Lesion Complexity Class</P108>
    <P207>C3272276</P207>
    <P322>CDISC</P322>
    <P325>A classification system for coronary stenosis based upon characteristics that influence the difficulty of percutaneous coronary revascularization.</P325>
    <P90>ACC/AHA Lesion Complexity Class</P90>
    <P90>American College of Cardiology/American Heart Association Lesion Complexity Class</P90>
    <P90>LSNCPCLS</P90>
    <P97>A classification system for coronary stenosis based upon characteristics that influence the difficulty of percutaneous coronary revascularization. (ACC)</P97>
    <rdfs:label>American College of Cardiology/American Heart Association Lesion Complexity Class</rdfs:label>
</owl:Class>


Properties/Relationships to pull into Graph KB:
    - NHC0 (code) => sourceId
    - P97 (definition) => description
    - P90 (synonym) => aliasof
    - P108 (preferred name) => name
    - A8 (concept in subset) => subsets
    - A11 (Has_NICHD_Parent) => subclassof

tree head nodes to collect all subclasses from
- C1514: agonist
- C1932: chemical modifier
- C1909: pharmacologic substance
- C2991: Disease or disorder
*/

const rdf = require('rdflib');
const fs = require('fs');
const jsonfile = require('jsonfile');
const {addRecord, convertOwlGraphToJson} = require('./util');

const ROOT_NODES = {
    AGONIST: 'ncit:c1514',
    CHEM_MOD: 'ncit:c1932',
    PHARMA: 'ncit:c1909',
    DISEASE: 'ncit:c2991',
    ANATOMY: 'ncit:c12219'
};

const PRED_MAP = {
    LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
    CODE: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#NHC0',
    DESCRIPTION: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#P97',
    SUBSETOF: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#A8',
    SYNONYM: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#P90',
    HASPARENT: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#A11',
    SUBCLASSOF: 'http://www.w3.org/2000/01/rdf-schema#subClassOf'
};


const parseNcitID = (string) => {
    const match = /.*#(C\d+)$/.exec(string);
    if (match) {
        return `ncit:${match[1].toLowerCase()}`;
    }
    throw new Error(`failed to parse: ${string}`);
};


const subclassTree = (nodesByCode, roots) => {
    const queue = roots;
    const subtree = {};
    const subclassEdges = [];

    while (queue.length > 0) {
        const currNode = queue.shift();
        subtree[currNode.code] = currNode;
        for (let childCode of currNode.subclasses || []) {
            queue.push(nodesByCode[childCode]);
            subclassEdges.push({tgt: currNode.code, src: childCode});
        }
    }
    return {edges: subclassEdges, tree: subtree};
};


const createRecords = async (inputRecords, dbClassName, conn, source) => {
    const records = {};
    console.log(`\nLoading ${Object.keys(inputRecords).length} ${dbClassName} nodes`);
    for (let node of Object.values(inputRecords)) {
        if (! node[PRED_MAP.CODE] || ! node[PRED_MAP.LABEL]) {  // do not include anything that does not have at minimum these values
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
        const dbEntry = await addRecord(dbClassName, body, conn, true);
        records[dbEntry.sourceId] = dbEntry;
    }
    return records;
};


const uploadNCIT = async ({filename, conn}) => {
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    console.log(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl', 'application/rdf+xml');
    const nodesByCode = convertOwlGraphToJson(graph, parseNcitID);

    const source = await addRecord('sources', {name: 'ncit'}, conn, true);

    // for the given source nodes, include all descendents Has_NICHD_Parentdants/subclasses
    for (let node of Object.values(nodesByCode)) {
        for (let parentCode of node[PRED_MAP.SUBCLASSOF] || []) {
            if (! nodesByCode[parentCode]) {
                continue;
            }
            if (! nodesByCode[parentCode].subclasses) {
                nodesByCode[parentCode].subclasses = [];
            }
            nodesByCode[parentCode].subclasses.push(node.code);
        }
    }

    const diseaseNodes = subclassTree(nodesByCode, [nodesByCode[ROOT_NODES.DISEASE]]);
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
    let result = await createRecords(anatomyNodes.tree, 'anatomicalentities', conn, source);
    Object.assign(records, result);

    result = await createRecords(therapyNodes.tree, 'therapies', conn, source);
    Object.assign(records, result);

    result = await createRecords(diseaseNodes.tree, 'diseases', conn, source);
    Object.assign(records, result);

    console.log(`\nLoading ${subclassEdges.length} subclassof relationships`);
    for (let {src, tgt} of subclassEdges) {
        if (records[src] && records[tgt]) {
            await addRecord('subclassof', {out: records[src]['@rid'], in: records[tgt]['@rid'], source: source['@rid']}, conn, true);
        } else {
            process.stdout.write('x');
        }
    }
    const tempjson = 'ncit_temp.json';
    console.log(`\nwriting: ${tempjson}`);
    jsonfile.writeFileSync(tempjson, nodesByCode);
    console.log('json file has', Object.keys(nodesByCode).length, 'entries');
    return nodesByCode;

};


module.exports = {uploadNCIT};