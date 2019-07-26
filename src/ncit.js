/**
 * Module responsible for parsing the NCIT owl file and uploading the converted records to the Graph KB
 *
 * NCIT owl file is very large. When uploading additional arguments were specified for node (--stack-size=8192  --max-old-space-size=20000)
 * Additionally node v10 is required since the string size is too small in previous versions
 * @module importer/ncit
 */
const {
    loadDelimToJson, rid, generateCacheKey
} = require('./util');
const {logger} = require('./logging');

const SOURCE_DEFN = {
    displayName: 'NCIt',
    url: 'https://ncit.nci.nih.gov/ncitbrowser',
    usage: 'https://creativecommons.org/licenses/by/4.0',
    name: 'ncit',
    description: 'NCI Thesaurus (NCIt) provides reference terminology for many NCI and other systems. It covers vocabulary for clinical care, translational and basic research, and public information and administrative activities.'
};

const diseaseConcepts = [
    'Anatomical Abnormality',
    'Congenital Abnormality',
    'Disease or Syndrome',
    'Mental or Behavioral Dysfunction',
    'Neoplastic Process'
];

const anatomyConcepts = [
    'Anatomical Structure',
    'Body Location or Region',
    'Body Part, Organ, or Organ Component',
    'Tissue'
];

const therapeuticConcepts = [
    'Antibiotic',
    'Biologically Active Substance',
    'Chemical Viewed Functionally',
    'Chemical Viewed Structurally',
    'Chemical',
    'Immunologic Factor',
    'Inorganic Chemical',
    'Organic Chemical',
    'Pharmacologic Substance',
    'Therapeutic or Preventive Procedure',
    'Vitamin'
];

const DEPRECATED = [
    'C61063', // obsolete concept
    'C85834' // retired concept
];


const pickEndpoint = (conceptName) => {
    let endpoint = null;
    if (anatomyConcepts.some(term => conceptName.includes(term))) {
        endpoint = 'anatomicalentities';
    }
    if (diseaseConcepts.some(term => conceptName.includes(term))) {
        if (endpoint) {
            throw Error(`Concept must be in a discrete category (${conceptName})`);
        }
        endpoint = 'diseases';
    }
    if (therapeuticConcepts.some(term => conceptName.includes(term))) {
        if (endpoint) {
            throw Error(`Concept must be in a discrete category (${conceptName})`);
        }
        endpoint = 'therapies';
    }
    if (endpoint) {
        return endpoint;
    }
    throw new Error(`Concept not implemented (${conceptName})`);
};

/**
 * Convert the raw row record to a standard form
 */
const cleanRawRow = (rawRow) => {
    const {
        id, synonyms, parents, xmlTag, name, definition, semanticType
    } = rawRow;
    const row = {
        synonyms: [],
        parents: [],
        description: definition
    };
    const sourceId = id.toLowerCase().trim();
    const endpoint = pickEndpoint(semanticType);

    // use the synonym name if no name given
    row.synonyms = synonyms.split('|')
        .map(s => s.toLowerCase().trim())
        .filter(s => s);

    if (!row.name && row.synonyms.length > 0) {
        row.synonyms.sort();
        row.name = row.synonyms[0];
    } else {
        // if there is multiple names, demote the extra to synonyms
        const names = name.split('|')
            .map(s => s.toLowerCase().trim())
            .filter(s => s);
        names.sort();
        row.name = names[0];
        row.synonyms.push(...names.slice(1));
    }

    const url = xmlTag.replace(/^</, '').replace(/>$/, '');
    const deprecated = parents.split('|').some(p => DEPRECATED.includes(p));

    // add the parents
    row.parents = parents.split('|')
        .map(parent => parent.trim())
        .filter(parent => parent && !DEPRECATED.includes(parent))
        .map(parent => parent.toLowerCase());
    row.synonyms = Array.from(new Set(row.synonyms)).filter(s => s !== row.name.toLowerCase().trim());
    return {
        ...row, url, deprecated, endpoint, sourceId
    };
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
    const rows = await loadDelimToJson(filename, '\t', [
        'id',
        'xmlTag',
        'parents',
        'synonyms',
        'definition',
        'name',
        'conceptStatus',
        'semanticType'
    ]);

    const source = rid(await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        fetchConditions: {name: SOURCE_DEFN.name},
        existsOk: true
    }));
    const recordsById = {};
    const subclassEdges = [];

    // list the ncit records already loaded
    const cached = {};
    logger.info('getting previously loaded records');
    const cachedRecords = await conn.getRecords({
        endpoint: 'ontologies',
        where: {source, dependency: null, neighbors: 0}
    });
    for (const record of cachedRecords) {
        cached[generateCacheKey(record)] = record;
    }
    logger.info(`loaded and cached ${Object.keys(cached).length} records`);

    const counts = {skip: 0, success: 0, error: 0};

    for (let i = 0; i < rows.length; i++) {
        logger.info(`processing ${rows[i].id}`);
        try {
            pickEndpoint(rows[i].semanticType);
        } catch (err) {
            logger.warn(err);
            counts.skip++;
            continue;
        }
        try {
            const row = cleanRawRow(rows[i]);

            const cacheKey = generateCacheKey(row);

            if (recordsById[cacheKey]) {
                throw new Error(`code is not unique (${cacheKey})`);
            }

            let record;
            if (cached[cacheKey]) {
                record = cached[cacheKey];
            } else {
                // create the new record
                const {
                    endpoint, sourceId, description, url, name, deprecated
                } = row;
                record = await conn.addRecord({
                    endpoint,
                    content: {
                        source,
                        sourceId,
                        name,
                        description,
                        url,
                        deprecated
                    },
                    fetchConditions: { // description can contain url malformed characters
                        source,
                        sourceId,
                        name: row.name,
                        dependency: null
                    },
                    existsOk: true
                });
                cached[generateCacheKey(record)] = record;

                // add the synonyms
                await Promise.all(row.synonyms.map(async (synonym) => {
                    const alias = await conn.addRecord({
                        endpoint: row.endpoint,
                        content: {
                            source,
                            sourceId: record.sourceId,
                            name: synonym,
                            dependency: rid(record),
                            deprecated: record.deprecated
                        },
                        existsOk: true
                    });
                    await conn.addRecord({
                        endpoint: 'aliasof',
                        content: {out: rid(alias), in: rid(record), source},
                        existsOk: true,
                        fetchExisting: false
                    });
                }));
            }

            // add the parents
            subclassEdges.push(row.parents.map(parent => [cacheKey, generateCacheKey({sourceId: parent})]));
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
        }
    }

    // now create all the subclass relationships
    for (const [recordKey, parentKey] of subclassEdges) {
        if (cached[recordKey] && cached[parentKey]) {
            await conn.addRecord({
                endpoint: 'subclassof',
                content: {
                    out: rid(cached[recordKey]),
                    in: rid(cached[parentKey]),
                    source
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
    logger.info(JSON.stringify(counts));
};


module.exports = {uploadFile, SOURCE_DEFN};
