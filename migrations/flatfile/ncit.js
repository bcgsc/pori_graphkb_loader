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
*/

const rdf = require('rdflib');
const fs = require('fs');
const jsonfile = require('jsonfile');
const {addRecord, getRecordBy} = require('./util');


const parseNcitID = (string) => {
    const match = /.*(#C\d+)$/.exec(string);
    return match ? `ncit:${match[1].toLowerCase()}` : false;
};

const uploadNCIT = async ({filename, conn}) => {
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    console.log(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl', 'application/rdf+xml');
    const predicates = Object.keys(graph.predicateIndex);
    predicates.sort((first, second) => {
        return graph.predicateIndex[second].length - graph.predicateIndex[first].length;
    });
    // parse the owl file into a json format of {subjectKey: {predicateValue: [targetValue, ...]}}
    const initialRecords = {};
    for (let statement of graph.statements) {
        const src = parseNcitID(statement.subject.value);
        if (! src) {
            continue;
        }
        if (initialRecords[src] === undefined) {
            initialRecords[src] = {code: src};
        }
        if (initialRecords[src][statement.predicate.value] === undefined) {
            initialRecords[src][statement.predicate.value] = [];
        }
        initialRecords[src][statement.predicate.value].push(statement.object.value);
    }
    // reverse the sublcass heiarchy so the parents know about their immeadiate children

    const nodesByCode = {};
    //const initialRecords = require(filename);

    // transform all NCIT codes to std format
    for (let record of Object.values(initialRecords)) {
        record.code = parseNcitID(record.code);
        nodesByCode[record.code] = record;
        for (let predicate of Object.keys(record)) {
            if (typeof record[predicate] === 'object' && record[predicate] !== null) {
                const formatted = [];
                for (let item of record[predicate]) {
                    try {
                        item = parseNcitID(item);
                    } catch (err) {
                        // ignore, will be unamed n\d+ nodes
                    }
                    formatted.push(item);
                }
                record[predicate] = formatted;
            }
        }
    }

    const predMap = {
        label: 'http://www.w3.org/2000/01/rdf-schema#label',
        code: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#NHC0',
        description: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#P97',
        subsetOf: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#A8',
        synonym: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#P90',
        hasParent: 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#A11',
        subClassOf: 'http://www.w3.org/2000/01/rdf-schema#subClassOf'
    };

    // for the given source nodes, include all descendents Has_NICHD_Parentdants/subclasses
    for (let node of Object.values(nodesByCode)) {
        for (let parentCode of node[predMap.subClassOf] || []) {
            if (! nodesByCode[parentCode]) {
                console.log('\nMISSING', parentCode, '\n');
                continue;
            }
            if (! nodesByCode[parentCode].subclasses) {
                nodesByCode[parentCode].subclasses = [];
            }
            nodesByCode[parentCode].subclasses.push(node.code);
        }
    }

    const diseaseNodes = [];
    const queue = [nodesByCode['ncit:c2991']];
    console.log('top disease node', queue[0]);

    while (queue.length > 0) {
        const currNode = queue.shift();
        diseaseNodes.push(currNode);
        for (let childCode of currNode.subclasses) {
            queue.push(nodesByCode[childCode]);
        }
    }
    console.log(`there are ${diseaseNodes.length} to load`);

    // diseases: http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C2991
    for (let node of Object.values(nodesByCode)) {
        if (! node[predMap.code] || ! node[predMap.label]) {  // do not include anything that does not have at minimum these values
            continue;
        }
        const body = {
            source: 'ncit',
            name: node[predMap.label][0],
            sourceId: node[predMap.code][0]
        };
        if (node[predMap.description]) {
            body.description = node[predMap.description][0];
        }
        // limit to cancer-related terms only
        //const dbEntry = await addRecord('diseases', body, conn, true);
        //records[dbEntry.sourceId] = records;
    }
    const tempjson = 'ncit_temp.json';
    console.log(`writing: ${tempjson}`);
    jsonfile.writeFileSync(tempjson, nodesByCode);
    console.log('json file has', Object.keys(nodesByCode).length, 'entries');
    return nodesByCode;

};


const uploadNcitDiseases = () => {};

module.exports = {uploadNCIT};