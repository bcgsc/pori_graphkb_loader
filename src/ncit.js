/**
 * Module responsible for parsing the NCIT owl file and uploading the converted records to the Graph KB
 *
 * NCIT owl file is very large. When uploading additional arguments were specified for node (--stack-size=8192  --max-old-space-size=20000)
 * Additionally node v10 is required since the string size is too small in previous versions
 * @module importer/ncit
 */
const {
    loadDelimToJson, rid
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
    'Tissue',
];

const therapeuticConcepts = [
    'Antibiotic',
    'Biologically Active Substance',
    'Immunologic Factor',
    'Inorganic Chemical',
    'Organic Chemical',
    'Pharmacologic Substance',
    'Therapeutic or Preventive Procedure',
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
    return endpoint;
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
    const subclass = [];
    const rawRecords = {};

    const counts = {skip: 0, success: 0, error: 0};
    const skippedWhy = {};

    for (let i = 0; i < rows.length; i++) {
        try {
            const row = rows[i];
            const sourceId = row.id.toLowerCase().trim();
            if (recordsById[sourceId]) {
                throw new Error(`code is not unique (${sourceId})`);
            }
            rawRecords[sourceId] = row;
            const endpoint = pickEndpoint(row.semanticType);
            if (!endpoint) {
                skippedWhy[sourceId] = `semantic type (${row.semanticType})`;
                counts.skip++;
                continue;
            }
            // use the synonym name if no name given
            const synonyms = row.synonyms.split('|')
                .map(s => s.toLowerCase().trim())
                .filter(s => s);

            if (!row.name) {
                if (synonyms.length < 1) {
                    counts.skip++;
                    skippedWhy[sourceId] = 'no name';
                    continue;
                }
                synonyms.sort();
                row.name = synonyms[0];
            } else {
                // if there is multiple names, demote the extra to synonyms
                const names = row.name.split('|')
                    .map(s => s.toLowerCase().trim())
                    .filter(s => s);
                names.sort();
                row.name = names[0];
                synonyms.push(...names.slice(1));
            }
            logger.info(`processing ${row.id} (${i} of ${rows.length})`);

            const url = row.xmlTag.replace(/^</, '').replace(/>$/, '');
            const deprecated = row.parents.split('|').some(p => DEPRECATED.includes(p));
            const record = await conn.addRecord({
                endpoint,
                content: {
                    source,
                    sourceId,
                    name: row.name,
                    description: row.definition,
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

            recordsById[sourceId] = rid(record);

            // add the parents
            subclass.push(
                ...row.parents.split('|')
                    .map(parent => parent.trim())
                    .filter(parent => parent && !DEPRECATED.includes(parent))
                    .map(parent => [sourceId, parent.toLowerCase()])
            );

            // add the synonyms
            const uniqueSynonyms = Array.from(new Set(synonyms)).filter(s => s !== row.name.toLowerCase().trim());
            await Promise.all(uniqueSynonyms.map(async (synonym) => {
                const alias = await conn.addRecord({
                    endpoint,
                    content: {
                        source,
                        sourceId: row.id,
                        name: synonym,
                        dependency: rid(record),
                        deprecated
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
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
        }
    }

    // now create all the subclass relationships
    for (const [record, parent] of subclass) {
        if (recordsById[record] && recordsById[parent]) {
            await conn.addRecord({
                endpoint: 'subclassof',
                content: {
                    out: recordsById[record],
                    in: recordsById[parent],
                    source
                },
                existsOk: true,
                fetchExisting: false
            });
        } else if (skippedWhy[parent]) {
            logger.info(`failed to link ${record} to ${parent}: ${skippedWhy[parent]}`);
        } else {
            logger.info(`failed to link ${record} to ${parent}`);
        }
    }
    logger.info(JSON.stringify(counts));
};


module.exports = {uploadFile, SOURCE_DEFN};
