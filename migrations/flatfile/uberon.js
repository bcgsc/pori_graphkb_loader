const rdf = require('rdflib');
const fs = require('fs');
const jsonfile = require('jsonfile')
const {addRecord, getRecordBy} = require('./util');

const STRIP_PREFIX = 'http://purl.obolibrary.org/obo/';

/*
Uberon possible predicates include
<http://purl.obolibrary.org/obo/IAO_0000115>
<http://purl.obolibrary.org/obo/IAO_0000116>
<http://purl.obolibrary.org/obo/IAO_0000231>
<http://purl.obolibrary.org/obo/IAO_0000232>
<http://purl.obolibrary.org/obo/IAO_0000424>
<http://purl.obolibrary.org/obo/IAO_0000425>
<http://purl.obolibrary.org/obo/IAO_0100001>
<http://purl.obolibrary.org/obo/IAO_isReversiblePropertyChain>
<http://purl.obolibrary.org/obo/RO_0002173>
<http://purl.obolibrary.org/obo/RO_0002174>
<http://purl.obolibrary.org/obo/RO_0002175>
<http://purl.obolibrary.org/obo/y>
<http://purl.obolibrary.org/obo/UBPROP_0000002>
<http://purl.obolibrary.org/obo/UBPROP_0000003>
<http://purl.obolibrary.org/obo/UBPROP_0000005>
<http://purl.obolibrary.org/obo/UBPROP_0000006>
<http://purl.obolibrary.org/obo/UBPROP_0000007>
<http://purl.obolibrary.org/obo/UBPROP_0000008>
<http://purl.obolibrary.org/obo/UBPROP_0000009>
<http://purl.obolibrary.org/obo/UBPROP_0000010>
<http://purl.obolibrary.org/obo/UBPROP_0000011>
<http://purl.obolibrary.org/obo/UBPROP_0000012>
<http://purl.obolibrary.org/obo/UBPROP_0000013>
<http://purl.obolibrary.org/obo/UBPROP_0000014>
<http://purl.obolibrary.org/obo/UBPROP_0000015>
<http://purl.obolibrary.org/obo/UBPROP_0000100>
<http://purl.obolibrary.org/obo/UBPROP_0000101>
<http://purl.obolibrary.org/obo/UBPROP_0000103>
<http://purl.obolibrary.org/obo/UBPROP_0000104>
<http://purl.obolibrary.org/obo/UBPROP_0000105>
<http://purl.obolibrary.org/obo/UBPROP_0000106>
<http://purl.obolibrary.org/obo/UBPROP_0000107>
<http://purl.obolibrary.org/obo/UBPROP_0000111>
<http://purl.obolibrary.org/obo/UBPROP_0000201>
<http://purl.obolibrary.org/obo/UBPROP_0000202>
<http://purl.obolibrary.org/obo/core#provenance_notes>
<http://purl.obolibrary.org/obo/core#somite_number>
<http://purl.obolibrary.org/obo/core#source>
<http://purl.obolibrary.org/obo/core#tooth_number>
<http://purl.obolibrary.org/obo/core#vertebra_number>
<http://purl.obolibrary.org/obo/uberon/core#ABBREVIATION>
<http://purl.obolibrary.org/obo/uberon/core#EXACT_PREFERRED>
<http://purl.obolibrary.org/obo/uberon/core#LATIN>
<http://purl.obolibrary.org/obo/uberon/core#RLATED>
<http://purl.obolibrary.org/obo/uberon/insect-anatomy#taxon_notes>
<http://purl.org/dc/elements/1.1/contributor>
<http://purl.org/dc/elements/1.1/creator>
<http://purl.org/dc/elements/1.1/description>
<http://purl.org/dc/elements/1.1/publisher>
<http://purl.org/dc/elements/1.1/rights>
<http://purl.org/dc/elements/1.1/source>
<http://purl.org/dc/elements/1.1/title>
<http://purl.org/dc/terms/isReferencedBy>
<http://usefulinc.com/ns/doap#GitRepository>
<http://usefulinc.com/ns/doap#SVNRepository>
<http://usefulinc.com/ns/doap#bug-database>
<http://usefulinc.com/ns/doap#mailing-list>
<http://www.geneontology.org/formats/oboInOwl#cardonality>
<http://www.geneontology.org/formats/oboInOwl#component>
<http://www.geneontology.org/formats/oboInOwl#conflicts>
<http://www.geneontology.org/formats/oboInOwl#conflicts_with>
<http://www.geneontology.org/formats/oboInOwl#consider>
<http://www.geneontology.org/formats/oboInOwl#consistent_with>
<http://www.geneontology.org/formats/oboInOwl#contradicted_by>
<http://www.geneontology.org/formats/oboInOwl#count>
<http://www.geneontology.org/formats/oboInOwl#created_by>
<http://www.geneontology.org/formats/oboInOwl#creation_date>
<http://www.geneontology.org/formats/oboInOwl#date_retrieved>
<http://www.geneontology.org/formats/oboInOwl#default-namespace>
<http://www.geneontology.org/formats/oboInOwl#different_relation_from>
<http://www.geneontology.org/formats/oboInOwl#editor>
<http://www.geneontology.org/formats/oboInOwl#editor_note>
<http://www.geneontology.org/formats/oboInOwl#evidence>
<http://www.geneontology.org/formats/oboInOwl#exactly>
<http://www.geneontology.org/formats/oboInOwl#exception>
<http://www.geneontology.org/formats/oboInOwl#external_class>
<http://www.geneontology.org/formats/oboInOwl#external_class_label>
<http://www.geneontology.org/formats/oboInOwl#external_ontology>
<http://www.geneontology.org/formats/oboInOwl#gene>
<http://www.geneontology.org/formats/oboInOwl#hasAlternativeId>
<http://www.geneontology.org/formats/oboInOwl#hasBroadSynonym>
<http://www.geneontology.org/formats/oboInOwl#hasDbXref>
<http://www.geneontology.org/formats/oboInOwl#hasExactSynonym>
<http://www.geneontology.org/formats/oboInOwl#hasNarrowSynonym>
<http://www.geneontology.org/formats/oboInOwl#hasOBONamespace>
<http://www.geneontology.org/formats/oboInOwl#hasRelatedSynonym>
<http://www.geneontology.org/formats/oboInOwl#hasScope>
<http://www.geneontology.org/formats/oboInOwl#hasSynonymType>
<http://www.geneontology.org/formats/oboInOwl#http://purl.obolibrary.org/obo/UBPROP_0000006>
<http://www.geneontology.org/formats/oboInOwl#id>
            <http://www.geneontology.org/formats/oboInOwl#inSubset>
<http://www.geneontology.org/formats/oboInOwl#inconsistent_with>
<http://www.geneontology.org/formats/oboInOwl#inferred_by>
<http://www.geneontology.org/formats/oboInOwl#isAbout>
<http://www.geneontology.org/formats/oboInOwl#is_about>
<http://www.geneontology.org/formats/oboInOwl#is_class_level>
<http://www.geneontology.org/formats/oboInOwl#is_entailed>
<http://www.geneontology.org/formats/oboInOwl#is_indirect>
<http://www.geneontology.org/formats/oboInOwl#is_inferred>
<http://www.geneontology.org/formats/oboInOwl#is_metadata_tag>
<http://www.geneontology.org/formats/oboInOwl#is_redundant>
<http://www.geneontology.org/formats/oboInOwl#laterality>
<http://www.geneontology.org/formats/oboInOwl#min_cardinality>
<http://www.geneontology.org/formats/oboInOwl#min_count>
<http://www.geneontology.org/formats/oboInOwl#missing_from>
<http://www.geneontology.org/formats/oboInOwl#modified_from>
<http://www.geneontology.org/formats/oboInOwl#not_supported_by>
<http://www.geneontology.org/formats/oboInOwl#note>
<http://www.geneontology.org/formats/oboInOwl#notes>
<http://www.geneontology.org/formats/oboInOwl#ontology>
<http://www.geneontology.org/formats/oboInOwl#ontology_class>
<http://www.geneontology.org/formats/oboInOwl#order>
<http://www.geneontology.org/formats/oboInOwl#possible_exception>
<http://www.geneontology.org/formats/oboInOwl#quote>
<http://www.geneontology.org/formats/oboInOwl#reference>
<http://www.geneontology.org/formats/oboInOwl#region>
<http://www.geneontology.org/formats/oboInOwl#seeAlso>
<http://www.geneontology.org/formats/oboInOwl#shorthand>
<http://www.geneontology.org/formats/oboInOwl#souce>
<http://www.geneontology.org/formats/oboInOwl#source>
<http://www.geneontology.org/formats/oboInOwl#specialization_within>
<http://www.geneontology.org/formats/oboInOwl#src>
<http://www.geneontology.org/formats/oboInOwl#stage>
<http://www.geneontology.org/formats/oboInOwl#status>
<http://www.geneontology.org/formats/oboInOwl#taxon>
<http://www.geneontology.org/formats/oboInOwl#taxon_notes>
<http://www.geneontology.org/formats/oboInOwl#todo>
<http://www.geneontology.org/formats/oboInOwl#treat-xrefs-as-equivalent>
<http://www.geneontology.org/formats/oboInOwl#treat-xrefs-as-has-subclass>
<http://www.geneontology.org/formats/oboInOwl#treat-xrefs-as-is_a>
<http://www.geneontology.org/formats/oboInOwl#treat-xrefs-as-reverse-genus-differentia>
<http://www.geneontology.org/formats/oboInOwl#url>
<http://www.geneontology.org/formats/oboInOwl#version>
<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
<http://www.w3.org/2000/01/rdf-schema#comment>
            <http://www.w3.org/2000/01/rdf-schema#label>
<http://www.w3.org/2000/01/rdf-schema#GseeAlso>
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
            <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
<http://www.w3.org/2002/07/owl#annotatedProperty>
<http://www.w3.org/2002/07/owl#annotatedSource>
<http://www.w3.org/2002/07/owl#annotatedTarget>
<http://www.w3.org/2002/07/owl#deprecated>
<http://www.w3.org/2002/07/owl#disjointWith>
    <http://www.w3.org/2002/07/owl#equivalentClass>
<http://www.w3.org/2002/07/owl#intersectionOf>
<http://www.w3.org/2002/07/owl#inverseOf>
<http://www.w3.org/2002/07/owl#maxQualifiedCardinality>
<http://www.w3.org/2002/07/owl#members>
<http://www.w3.org/2002/07/owl#minQualifiedCardinality>
<http://www.w3.org/2002/07/owl#onClass>
<http://www.w3.org/2002/07/owl#onProperty>
<http://www.w3.org/2002/07/owl#propertyChainAxiom>
<http://www.w3.org/2002/07/owl#propertyDisjointWith>
    <http://www.w3.org/2002/07/owl#someValuesFrom>
<http://www.w3.org/2002/07/owl#unionOf>
<http://www.w3.org/2002/07/owl#versionIRI>
<http://xmlns.com/foaf/0.1/depicted_by>
<http://xmlns.com/foaf/0.1/homepage>


graph properties
[ 'termType',
  'statements',
  'constraints',
  'initBindings',
  'optional',
  'propertyActions',
  'classActions',
  'redirections',
  'aliases',
  'HTTPRedirects',
  'subjectIndex',
  'predicateIndex',
  'objectIndex',
  'whyIndex',
  'index',
  'namespaces',
  'features' ]


UBERON specific properties linked to their labels
UBPROP:0000001 { label: 'external_definition' }
UBPROP:0000002 { label: 'axiom_lost_from_external_ontology' }
UBPROP:0000003 { label: 'homology_notes' }
UBPROP:0000005 { label: 'external_comment' }
UBPROP:0000006 { label: 'implements_design_pattern' }
UBPROP:0000007 { label: 'has_relational_adjective' }
UBPROP:0000008 { label: 'taxon_notes' }
UBPROP:0000009 { label: 'function_notes' }
UBPROP:0000010 { label: 'structure_notes' }
UBPROP:0000011 { label: 'development_notes' }
UBPROP:0000012 {A gill that develops_from a pharyngeal gill precursor. label: 'external_ontology_notes' }
UBPROP:0000013 { label: 'terminology_notes' }
UBPROP:0000014 { label: 'actions_notes' }
UBPROP:0000015 { label: 'location_notes' }
UBPROP:0000100 { label: 'is count of' }
UBPROP:0000101 { label: 'preceding element is' }
UBPROP:0000102 { label: 'repeated element number' }
UBPROP:0000103 { label: 'pharyngeal arch number' }
UBPROP:0000104 { label: 'ray number' }
UBPROP:0000105 { label: 'phalanx number' }
UBPROP:0000106 { label: 'rib number' }
UBPROP:0000107 { label: 'vertebra number' }
UBPROP:0000108 { label: 'somite number' }
UBPROP:0000109 { label: 'paired_appendage number' }
UBPROP:0000110 { label: 'appendage segment number' }
UBPROP:0000111 { label: 'rhombomere number' }
UBPROP:0000112 { label: 'tooth number' }
UBPROP:0000113 { label: 'dental formula' }
UBPROP:0000201 { label: 'source atlas' }
UBPROP:0000202 { label: 'fma_set_term' }
UBPROP:0000004 { label: 'obsolete provenance_notes' }

*/

const parseUberonId = (string) => {
    let nodeId = string.replace(STRIP_PREFIX, '');
    nodeId = nodeId.replace('_', ':');
    return nodeId.toLowerCase();
};


const uploadUberon = async ({filename, conn}) => {
    const content = fs.readFileSync(filename).toString();
    const graph = rdf.graph();
    const nodesByUberonId = {};
    rdf.parse(content, graph, 'http://purl.obolibrary.org/obo/uberon.owl', 'application/rdf+xml');

    for (let statement of graph.statements) {
        const nodeId = parseUberonId(statement.subject.value);
        const edgeType = statement.predicate.value.split(/[#\/]/).pop(); // get the last thing after the hash
        if (statement.object.termType == 'BlankNode') {
            continue;
        }
        if (nodeId.startsWith('uberon:')) {
            if (! nodesByUberonId[nodeId]) {
                nodesByUberonId[nodeId] = {subClassOf: [], id: nodeId, subsets: [], subPropertyOf: [], someValuesFrom: [], misc: []};
            }
            const currentNode = nodesByUberonId[nodeId];
            const value = statement.object.value;
            if (edgeType === 'label') {
                currentNode.label = value;
            } else if (edgeType === 'subClassOf') {
                currentNode.subClassOf.push(parseUberonId(value));
            } else if (edgeType === 'inSubset') {
                currentNode.subsets.push(value.replace(STRIP_PREFIX, ''));
            } else if (edgeType === 'IAO_0000115') {
                currentNode.definition = value;
            }
        }
    }
    const records = {};
    console.log('\nAdding the uberon entity nodes');
    for (let rec of Object.values(nodesByUberonId)) {
        if (! rec.label) {
            continue;
        }
        const body = {
            name: rec.label,
            source: 'uberon',
            sourceId: rec.id,
            description: rec.definition
        };
        if (rec.subsets.length > 0) {
            body.subsets = rec.subsets;
        }
        const dbEntry = await addRecord('anatomicalentities', body, conn, true);
        records[dbEntry.sourceId] = dbEntry;
    }
    console.log('\nAdding the subClassOf relationships');
    for (let rec of Object.values(records)) {
        for (let tgt of nodesByUberonId[rec.sourceId].subClassOf) {
            if (records[tgt]) {
                const body = {
                    out: rec['@rid'].toString(),
                    in: records[tgt]['@rid'].toString()
                };
                await addRecord('subclassof', body, conn, true);
            }
        }
    }
    /*console.log('writing: uberon.tmp.json');
    jsonfile.writeFileSync('uberon.tmp.json', nodesByUberonId);
    console.log('json file has', Object.keys(nodesByUberonId).length, 'entries');*/
};

module.exports = {uploadUberon};