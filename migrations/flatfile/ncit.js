/**
 * Module responsible for parsing the NCIT owl file and uploading the converted records to the Graph KB
 *
 * NCIT owl file is very large. When uploading additional arguments were specified for node (--stack-size=8192  --max-old-space-size=8192)
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
*/

const rdf = require('rdflib');
const fs = require('fs');

const uploadNCIT = async ({filename, conn}) => {
    const content = fs.readFileSync(filename).toString();
    const graph = rdf.graph();
    const nodesByUberonId = {};
    rdf.parse(content, graph, 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl', 'application/rdf+xml');
    const predicates = Object.keys(graph.preficateIndex);
    predicates.sort((first, second) => {
        return graph.preficateIndex[second].length - graph.preficateIndex[first].length;
    });
    for (let i=0; i<20; i++) {
        const key = predicates[i];
        console.log(key, graph.preficateIndex[key].length);
    }

};

module.exports = {uploadNCIT};