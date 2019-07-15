/**
 *
 * Given the DOID JSON file. Upload the diseases and relationships to the knowledgebase using the REST API
 *
 * @module importer/disease_ontology
 */
const _ = require('lodash');
const {
    orderPreferredOntologyTerms, rid
} = require('./util');
const {logger} = require('./logging');
const {SOURCE_DEFN: {name: ncitName}} = require('./ncit');

const PREFIX_TO_STRIP = 'http://purl.obolibrary.org/obo/';

const SOURCE_DEFN = {
    name: 'disease ontology',
    url: 'http://disease-ontology.org',
    description: `
        The Disease Ontology has been developed as a standardized ontology for human disease
        with the purpose of providing the biomedical community with consistent, reusable and
        sustainable descriptions of human disease terms, phenotype characteristics and related
        medical vocabulary disease concepts through collaborative efforts of researchers at
        Northwestern University, Center for Genetic Medicine and the University of Maryland
        School of Medicine, Institute for Genome Sciences. The Disease Ontology semantically
        integrates disease and medical vocabularies through extensive cross mapping of DO
        terms to MeSH, ICD, NCI’s thesaurus, SNOMED and OMIM.`.replace(/\s+/, ' ')
};

const parseDoid = (ident) => {
    const match = /.*(DOID_\d+)$/.exec(ident);
    if (!match) {
        throw new Error(`invalid DOID: ${ident}`);
    }
    return match[1].replace('_', ':').toLowerCase();
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
    logger.info('loading external disease ontology data');
    const DOID = require(filename); // eslint-disable-line import/no-dynamic-require,global-require

    // build the disease ontology first
    const nodesByName = {}; // store by name
    const synonymsByName = {};

    const doVersion = parseDoVersion(DOID.graphs[0].meta.version);
    let source = await conn.addRecord({
        endpoint: 'sources',
        content: {
            ...SOURCE_DEFN,
            version: doVersion
        },
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name, version: doVersion}
    });
    source = rid(source);
    logger.info(`processing ${DOID.graphs[0].nodes.length} nodes`);
    const recordsBySourceId = {};

    const ncitMissingRecords = new Set();

    let ncitSource;
    try {
        ncitSource = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'ncit'}
        });
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
        logger.info(`processing ${node.id} (${i} / ${DOID.graphs[0].nodes.length})`);
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
        const record = await conn.addRecord({
            endpoint: 'diseases',
            content: body,
            existsOk: true,
            fetchConditions: _.omit(body, ['description', 'subsets'])
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
                const synonym = await conn.addRecord({
                    endpoint: 'diseases',
                    content: {
                        sourceId: body.sourceId,
                        name: alias,
                        dependency: rid(record),
                        source
                    },
                    existsOk: true
                });
                await conn.addRecord({
                    endpoint: 'aliasof',
                    content: {
                        out: rid(synonym),
                        in: rid(record),
                        source
                    },
                    existsOk: true,
                    fetchExisting: false
                });
            }
        }
        // create deprecatedBy links for the old sourceIDs
        if (!node.meta.deprecated) {
            for (const {val, pred} of node.meta.basicPropertyValues || []) {
                if (pred.toLowerCase().endsWith('#hasalternativeid')) {
                    const alternate = await conn.addRecord({
                        endpoint: 'diseases',
                        content: {
                            sourceId: val,
                            name: record.name,
                            deprecated: true,
                            dependency: rid(record),
                            source
                        },
                        existsOk: true
                    });
                    await conn.addRecord({
                        endpoint: 'deprecatedby',
                        content: {out: rid(alternate), in: rid(record), source},
                        existsOk: true,
                        fetchExisting: false
                    });
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
                        ncitNode = await conn.getUniqueRecordBy({
                            endpoint: 'diseases',
                            where: {source: ncitSource, sourceId: ncitId},
                            sort: orderPreferredOntologyTerms
                        });
                    } catch (err) {
                        ncitMissingRecords.add(match[1].toLowerCase());
                    }
                    if (ncitNode) {
                        await conn.addRecord({
                            endpoint: 'crossreferenceof',
                            content: {out: rid(record), in: rid(ncitNode), source},
                            existsOk: true,
                            fetchExisting: false
                        });
                    }
                }
            }
        }
    }

    await loadEdges({
        DOID, conn, records: recordsBySourceId, source
    });
    if (ncitMissingRecords.size) {
        logger.warn(`unable to retireve ${ncitMissingRecords.size} ncit records`);
    }
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
    logger.info('adding the subclass relationships');
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
                await conn.addRecord({
                    endpoint: 'subclassof',
                    content: {
                        out: records[src]['@rid'],
                        in: records[tgt]['@rid'],
                        source
                    },
                    existsOk: true,
                    fetchExisting: false
                });
            }
        } else {
            relationshipTypes[pred] = null;
        }
    }
};

module.exports = {uploadFile, dependencies: [ncitName], SOURCE_DEFN};
