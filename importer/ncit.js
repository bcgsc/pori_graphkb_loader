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
 * @module importer/ncit
 */

const rdf = require('rdflib');
const fs = require('fs');
const _ = require('lodash');


const {
    convertOwlGraphToJson, rid
} = require('./util');
const {logger} = require('./logging');

const ROOT_NODES = {
    AGONIST: 'c1514',
    CHEM_MOD: 'c1932',
    PHARMA: 'c1909',
    DISEASE: 'c2991',
    ANATOMY: 'c12219'
};

const PREDICATES = {
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

const SOURCE_DEFN = {
    url: 'https://github.com/NCI-Thesaurus/thesaurus-obo-edition',
    usage: 'https://creativecommons.org/licenses/by/4.0',
    name: 'ncit',
    description: 'NCI Thesaurus (NCIt) provides reference terminology for many NCI and other systems. It covers vocabulary for clinical care, translational and basic research, and public information and administrative activities.'
};

/**
 * Parse the ID from a url
 *
 * @param {string} url the url to be parsed
 * @returns {string} the ID
 * @throws {Error} the ID did not match the expected format
 */
const parseNcitID = (url) => {
    const match = /.*#(C\d+)$/.exec(url);
    if (match) {
        return `${match[1].toLowerCase()}`;
    }
    throw new Error(`failed to parse: ${url}`);
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
 *
 * @param inputRecords
 * @param dbClassName
 * @param {ApiConnection} conn
 */
const createRecords = async (inputRecords, dbClassName, conn, source, fdaSource) => {
    const records = {};
    logger.info(`loading ${Object.keys(inputRecords).length} ${dbClassName} nodes`);
    for (const node of Object.values(inputRecords)) {
        if (!node[PREDICATES.CODE] || !node[PREDICATES.LABEL]) { // do not include anything that does not have at minimum these values
            continue;
        }
        const body = {
            source: rid(source),
            name: node[PREDICATES.LABEL][0],
            sourceId: node.code
        };
        if (node[PREDICATES.DESCRIPTION]) {
            body.description = node[PREDICATES.DESCRIPTION][0];
        }
        if (node[PREDICATES.SUBSETOF]) {
            body.subsets = node[PREDICATES.SUBSETOF];
        }
        if (node[PREDICATES.DEPRECATED] && node[PREDICATES.DEPRECATED][0] === 'true') {
            body.deprecated = true;
        }
        const dbEntry = await conn.addRecord({
            endpoint: dbClassName,
            content: body,
            existsOk: true,
            fetchConditions: _.omit(body, ['subsets', 'description'])
        });
        if (records[dbEntry.sourceId]) { // already dealt with this record
            continue;
        }
        // add the aliasof links
        for (const alias of node[PREDICATES.SYNONYM] || []) {
            const aliasBody = {
                source: rid(source),
                sourceId: node.code,
                dependency: rid(dbEntry),
                name: alias
            };
            try {
                const aliasRecord = await conn.addRecord({
                    endpoint: dbClassName,
                    content: aliasBody,
                    existsOk: true,
                    fetchConditions: _.omit(aliasBody, ['dependency'])
                });
                await conn.addRecord({
                    endpoint: 'aliasof',
                    content: {source: rid(source), out: rid(aliasRecord), in: rid(dbEntry)},
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err) {
                logger.log('warn', `Unable to alias record ${body.sourceId} to ${aliasBody.sourceId}`);
            }
        }
        // add the link to the FDA
        if (fdaSource && node[PREDICATES.FDA] && node[PREDICATES.FDA].length) {
            let fdaRec;
            try {
                fdaRec = await conn.getUniqueRecordBy({
                    endpoint: dbClassName,
                    content: {source: rid(fdaSource), name: node[PREDICATES.FDA][0]}
                });
            } catch (err) {
                logger.log('warn', `Unable to cross-reference record ${body.sourceId} to fda record ${node[PREDICATES.FDA][0]}`);
            }
            if (fdaRec) {
                await conn.addRecord({
                    endpoint: 'crossreferenceof',
                    content: {source: rid(source), out: rid(dbEntry), in: rid(fdaRec)},
                    existsOk: true,
                    fetchExisting: false
                });
            }
        }
        records[dbEntry.sourceId] = dbEntry;
    }
    return records;
};


/**
 * Given the path to some NCIT OWL file, upload the parsed ontology records
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input OWL file
 * @param {ApiRequst} opt.conn the API connection object
 */
const uploadFile = async ({filename, conn}) => {
    logger.info('Loading external NCIT data');
    logger.info(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    logger.info(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, 'http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl', 'application/rdf+xml');
    const nodesByCode = convertOwlGraphToJson(graph, parseNcitID);

    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        fetchConditions: {name: SOURCE_DEFN.name},
        existsOk: true
    });
    let fdaSource;
    try {
        fdaSource = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            content: {name: 'fda'}
        });
    } catch (err) {
        logger.log('warn', 'cannot find fda source record. Will not be able to load cross-references');
    }

    // for the given source nodes, include all descendents Has_NICHD_Parentdants/subclasses
    for (const node of Object.values(nodesByCode)) {
        for (const parentCode of node[PREDICATES.SUBCLASSOF] || []) {
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
            if (node[PREDICATES.CLASS] && node[PREDICATES.CLASS][0] === 'Neoplastic Process') {
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

    logger.info(`\nLoading ${subclassEdges.length} subclassof relationships`);
    for (const {src, tgt} of subclassEdges) {
        if (records[src] && records[tgt]) {
            await conn.addRecord({
                endpoint: 'subclassof',
                content: {out: rid(records[src]), in: rid(records[tgt]), source: rid(source)},
                existsOk: true,
                fetchExisting: false
            });
        }
    }
    return nodesByCode;
};


module.exports = {uploadFile};
