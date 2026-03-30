/* eslint-disable one-var */
const { NotImplementedError, NotSupportedError, loadDelimToJson } = require('../util');
const {
    // eslint-disable-next-line no-unused-vars
    ApiConnection,
    convertRecordToQueryFilters,
    orderPreferredOntologyTerms,
    rid,
} = require('../graphkb');
const { logger } = require('../logging');

const { ncit: SOURCE_DEFN } = require('../sources');

let sourceIdAsNameCount = 0;
let noExplicitNameCount = 0;

const diseaseConcepts = [
    'Anatomical Abnormality',
    'Congenital Abnormality',
    'Disease or Syndrome',
    'Experimental Model of Disease',
    'Mental or Behavioral Dysfunction',
    'Neoplastic Process',
    'Sign or Symptom',
];

const anatomyConcepts = [
    'Anatomical Structure',
    'Body Location or Region',
    'Body Part, Organ, or Organ Component',
    'Body Space or Junction',
    'Body System',
    'Tissue',
];

const therapeuticConcepts = [
    'Antibiotic',
    'Biologically Active Substance',
    'Biomedical or Dental Material',
    'Chemical Viewed Functionally',
    'Chemical Viewed Structurally',
    'Chemical',
    'Clinical Drug',
    'Drug Delivery Device',
    'Element, Ion, or Isotope',
    'Food',
    'Hazardous or Poisonous Substance',
    'Hormone',
    'Immunologic Factor',
    'Indicator, Reagent, or Diagnostic Aid',
    'Inorganic Chemical',
    'Medical Device',
    'Organic Chemical',
    'Pharmacologic Substance',
    'Plant',
    'Steroid',
    'Substance',
    'Therapeutic or Preventive Procedure',
    'Vitamin',
];


const DEPRECATED = [
    'C61063', // obsolete concept
    'C85834', // retired concept
];

/**
 * Determine if the term is a body part, disease, or drug
 *
 * Returns the corresponding GraphKB class name:
 * 'AnatomicalEntity' | 'Disease' | 'Therapy'
 */
const pickEndpoint = (conceptName, parentConcepts = '') => {
    let endpoint = null;

    if (anatomyConcepts.some(term => conceptName.includes(term))) {
        endpoint = 'AnatomicalEntity';
    }
    if (diseaseConcepts.some(term => conceptName.includes(term))) {
        if (endpoint) {
            throw new NotSupportedError(`Concept not supported. Must be in a discrete category (${conceptName})`);
        }
        endpoint = 'Disease';
    }
    if (therapeuticConcepts.some(term => conceptName.includes(term))) {
        if (endpoint) {
            throw new NotSupportedError(`Concept not supported. Must be in a discrete category (${conceptName})`);
        }
        endpoint = 'Therapy';
    }
    if (endpoint) {
        return endpoint;
    }

    if (parentConcepts) {
        try {
            endpoint = pickEndpoint(parentConcepts);
            return endpoint;
        } catch (err) {} // will fall back to NotImplementedError
    }
    throw new NotImplementedError(`Concept not implemented (${conceptName})`);
};

/**
 * Synonyms filtering:
 * - no duplicates when compared in lowercase
 * - for each unique term, one original version kept only
 *
 * Returns an array of filtered synonyms
 *
 * @param {string[]} synonyms the synonym names to be formatted
 * @returns {string[]}
 */
const filterSynonyms = (synonyms) => {
    const filtered = new Map();

    // distinct lowercase synonyms as key
    synonyms.forEach((el) => {
        const k = el.toLowerCase();

        if (!filtered.has(k)) {
            // Keep 1st one, so putative prefered one is conserved
            filtered.set(k, el);
        }
    });

    return Array.from(
        filtered.values(),
    );
};


/**
 * Convert the raw row record to a standard form
 *
 * Given a raw row object,
 * returns a formatted/cleaned row object
 */
const cleanRawRow = (rawRow) => {
    const {
        id,
        synonyms: rawSynonyms,
        parents: rawParents,
        xmlTag,
        name: rawName,
        definition,
        semanticType,
        conceptStatus,
        parentConcepts,
    } = rawRow;

    if (!rawName) {
        noExplicitNameCount += 1;
    }

    const row = {
        deprecated: (
            rawParents.split('|').some(p => DEPRECATED.includes(p))
                || conceptStatus === 'Obsolete_Concept'
                || conceptStatus === 'Retired_Concept'
        ),
        description: definition,
        name: rawName.trim(),
        parents: (
            rawParents.split('|')
                .map(parent => parent.trim())
                .filter(parent => parent && !DEPRECATED.includes(parent))
                .map(parent => parent.toLowerCase())
        ),
        species: '',
        synonyms: (rawSynonyms.split('|')
            .map(s => s.trim())
            .filter(s => s)),
    };
    const sourceId = id.toLowerCase().trim();
    const endpoint = pickEndpoint(semanticType, parentConcepts); // GraphKB class name

    // split up the name if it is a list
    if (row.name && row.name.includes('|')) {
        const names = row.name.split('|')
            .map(s => s.trim())
            .filter(s => s);
        [row.name] = names;
        row.synonyms.push(...names.slice(1));
    }

    // utility function for non-human/mouse-like species matching
    const speciesMatch = (termName) => {
        const m = /\b(murine|mouse|rat)\b/ig.exec(termName);

        if (m) {
            return m[1];
        }
        return '';
    };

    // non-human concepts should use fuller name
    if (!speciesMatch(row.name)) {
        for (const synonym of row.synonyms) {
            if (speciesMatch(synonym)) {
                row.name = synonym;
                row.species = speciesMatch(synonym);
                break;
            }
        }
        const species = row.parents.map(speciesMatch).filter(s => s);

        if (species.length) {
            [row.species] = species;
        }
    } else {
        row.species = speciesMatch(row.name);
    }

    // url
    const url = xmlTag.replace(/^</, '').replace(/>$/, '');

    // name
    // capitalization needs to remain until the end, for displayName
    let { name } = row;

    // if no name, use 1st synonym as prefered name, with fallback to sourceId
    if (!name) {
        name = sourceId;
        sourceIdAsNameCount += 1;

        if (row.synonyms && row.synonyms[0]) {
            name = row.synonyms[0];
            sourceIdAsNameCount -= 1;
        }
    }

    // synonyms
    // We keep those equal to the record's name for now since we need them
    // for duplicated names disambiguation. They will be skipped later on.
    const synonyms = filterSynonyms(row.synonyms);

    return {
        ...row,
        displayName: name.toLowerCase() === sourceId
            ? sourceId
            : `${name} [${sourceId}]`,
        endpoint,
        name: name.toLowerCase(),
        sourceId,
        synonyms,
        url,
    };
};


/**
 * Given the path to some NCIT OWL file,
 * preprocess the file's content into an array of preformatted rows
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input OWL file
 * @param {number} opt.maxRecords
 */
const processFileContent = async ({ filename, maxRecords }) => {
    const rawRows = await loadDelimToJson(filename, {
        delim: '\t',
        header: [
            'id', // code
            'xmlTag', // concept IRI
            'parents',
            'synonyms',
            'definition',
            'name', // display name
            'conceptStatus',
            'semanticType',
            'conceptInSubset', // ...used to populate parentConcepts
        ],
    });

    // determine unresolvable records
    const rows = [];
    const nameDuplicates = {};
    const counts = {
        error: 0, exists: 0, skip: 0, success: 0,
    };
    const errors = {};

    const rowsById = {};

    for (const row of rawRows) {
        rowsById[row.id] = row;
    }

    for (const row of rawRows) {
        row.parentConcepts = row.parents.split('|')
            .map(parent => (rowsById[parent.trim()] || {}).semanticType || '')
            .join('|');
    }
    const deprecatedRows = [];
    const erroredSourceIds = new Set();

    for (const raw of rawRows) {
        if (maxRecords && rows.length > maxRecords) {
            logger.warn(`not loading all content due to max records limit (${maxRecords})`);
            break;
        }

        try {
            // row formatting
            const row = cleanRawRow(raw);

            if (row.deprecated) {
                deprecatedRows.push(row);
                counts.skip++;
                continue;
            }

            if (!nameDuplicates[row.name]) {
                nameDuplicates[row.name] = [];
            }
            nameDuplicates[row.name].push(row);
            rows.push(row);
        } catch (err) {
            if (!errors[err]) {
                errors[err] = err;

                if (err instanceof NotImplementedError) {
                    // warning log only
                    logger.warn(err);
                } else if (err instanceof NotSupportedError) {
                    // warning log only
                    logger.warn(err);
                } else {
                    logger.error(err);
                }
            }
            erroredSourceIds.add(raw.id.toLowerCase());

            counts.skip++;
        }
    }
    logger.verbose(`skipping (${deprecatedRows.length}) retired or obsolete concepts: ${deprecatedRows.map(d => d.sourceId).join(',')}`);

    const rejected = new Set();

    // Name disambiguation, for duplicated names,
    // if possible, assign the row another name from its list of synonyms
    for (const [name, dups] of Object.entries(nameDuplicates)) {
        // skip if no duplicate for that name
        if (dups.length < 2) {
            continue;
        }

        // filter non-human name duplicates
        const humanDups = [];

        for (const dup of dups) {
            if (dup.species) {
                rejected.add(dup.sourceId);
                logger.warn(`dropping non-human ncit term (${dup.sourceId}) has non-unique name (${name})`);
            } else {
                humanDups.push(dup);
            }
        }

        // check list of synonyms to find non-duplicate names;
        // first position in this list is presumed to be the 'preferred name' from ncit
        const preferredNames = dups.map(dup => dup.synonyms[0]);
        const allPreferredNamesDifferent = () => (
            new Set(preferredNames).size === preferredNames.length
        );

        if (allPreferredNamesDifferent) {
            for (const dup of dups) {
                dup.name = dup.synonyms[0];
                logger.log('info', `record with non-unique name (${name}, ${dup.sourceId}) being loaded with its preferred name (${dup.name.toLowerCase()});`);
            }
            continue;
        }

        if (name && humanDups.length > 1) {
            logger.warn(`ncit terms (${humanDups.map(r => r.sourceId).join(', ')}) have non-unique name (${name})`);
            humanDups.forEach(d => rejected.add(d.sourceId));
        }
    }
    logger.warn(`rejected ${rejected.size} rows for unresolveable primary/display name conflicts`);

    return {
        counts,
        erroredSourceIds,
        rejected,
        rows,
    };
};

/**
 * Flag as deprecated all current GKB records
 * no longer in the upload
 *
 * @param {ApiConnection} conn
 * @param {object} opt options
 * @param {set} opt.ncitIds the set of NCIt ids uploaded
 * @param {object} opt.source the NCIt source RID object
 */
const deprecateRecords = async (conn, { ncitIds, source }) => {
    // All current GKB records
    const gkbRecords = await conn.getRecords({
        filters: { source },
        neighbors: 0,
        returnProperties: ['@class', '@rid', 'deprecated', 'sourceId'],
        target: 'Ontology',
    });
    logger.info(`Currently ${gkbRecords.length} NCIt Ontology records in GraphKB`);

    // Refactor into Map; <sourceId> --> [<rid>, ...]
    const deprecatedBySourceId = new Map();

    for (const r of gkbRecords) {
        // filters out active sourceId
        if (ncitIds.has(r.sourceId)) {
            continue;
        }
        // keep track of all RIDs that need deprecation, per sourceId
        if (!deprecatedBySourceId.has(r.sourceId)) {
            deprecatedBySourceId.set(r.sourceId, []);
        }
        if (!r.deprecated) {
            deprecatedBySourceId.get(r.sourceId).push({
                recordId: String(r['@rid']),
                target: String(r['@class']),
            });
        }
    }

    let totalLength = 0;
    let count = 0;

    // Eval. how many records
    for (const arr of deprecatedBySourceId.values()) {
        totalLength += arr.length;
    }
    logger.info(`Deprecating ${totalLength} Ontology records from ${deprecatedBySourceId.size} sourceIds`);

    // Deprecating records
    for (const [sourceId, records] of deprecatedBySourceId) {
        for (const { recordId, target } of records) {
            try {
                count += 1;
                logger.info(`deprecating (${count}/${totalLength}) record ${recordId} (${target} ${sourceId})`);
                await conn.updateRecord(
                    target,
                    recordId,
                    { deprecated: true },
                );
            } catch (err) {
                logger.error(`failed to deprecate ${target} record ${recordId} (${sourceId})`);
                logger.debug(err);
            }
        }
    }
};


/**
 * Key formatting utility based on record content
 * Used to create unique key for the 'exists' set
 */
const existsHashCheck = (record) => [
    record.sourceId.toLowerCase(),
    record.name.toLowerCase(),
    record.displayName,
].join('____');


/**
 * Given the path to some NCIT OWL file, upload the parsed ontology records
 *
 * Each line represent one MAIN term + a list of synonym terms
 * Each term is uploaded as a distinct GraphKB Ontology vertice
 * Vertices from the same row (main + syn.) share a common sourceId and are linked by AliasOf edges from synonyms to MAIN; many-to-one
 * Child-parent relationships are described using SubClassOf edges between MAIN terms; many-to-many
 *
 * @param {object} opt options
 * @param {ApiConnection} opt.conn the API connection object
 * @param {string} opt.filename the path to the input OWL file
 * @param {boolean} [opt.ignoreCache=false] whether to ignore upload when main record already exists as-is
 * @param {boolean} [opt.ignoreDeprecating=false] whether to ignore deprecation of old records
 * @param {boolean} [opt.ignoreSynonyms=false] whether synonyms should be ignored or uploaded as alias records
 * @param {number} opt.maxRecords maximum number of records to upload
 */
const uploadFile = async ({
    conn,
    filename,
    ignoreCache = false,
    ignoreDeprecating = false,
    ignoreSynonyms = false,
    maxRecords,
}) => {
    // ------------------------------------------------------------------
    // NCIT FILE
    // ------------------------------------------------------------------

    logger.info('Loading external NCIT data');
    const {
        counts,
        erroredSourceIds,
        rejected,
        rows,
    } = await processFileContent({ filename, maxRecords });


    // ------------------------------------------------------------------
    // EXISTING RECORDS
    // ------------------------------------------------------------------
    const source = rid(await conn.addSource(SOURCE_DEFN));

    // caches
    const mainRIDBySourceId = new Map(); // sourceId --> RID
    const exists = new Set(); // "<sourceId>____<name>____<displayName>"

    // list the ncit records already loaded.
    // query only the main records (aliased terms)
    logger.info('getting previously loaded records...');
    const cachedRecords = await conn.getRecords({
        filters: { AND: [{ source }, { alias: false }] },
        neighbors: 0,
        target: 'Ontology',
    });

    // SourceId might not be unique among alias=false...
    cachedRecords.sort(orderPreferredOntologyTerms);
    cachedRecords.reverse();

    // populating caches
    for (const record of cachedRecords) {
        mainRIDBySourceId.set(record.sourceId, String(record['@rid'])); // latest retained
        exists.add(existsHashCheck(record));
    }
    logger.info(`loaded and cached ${mainRIDBySourceId.size} main records`);
    logger.info('uploading NCIt records to GraphKB...');



    // ------------------------------------------------------------------
    // UPLOAD
    // ------------------------------------------------------------------

    // Set of sourceId (NCIt ids) for which an upload attempt has been made
    const ncitIds = new Set();
    // Keeping track of child->parent relationships
    const subclassEdges = [];

    // MAIN LOOP
    // Adding terms and their synonyms to GraphKB
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (rejected.has(row.sourceId)) {
            counts.error++;
            continue;
        }
        logger.info(`processing (${i + 1} / ${rows.length}) ${row.sourceId}`);
        let record;

        try {
            if (ncitIds.has(row.sourceId, false)) {
                // Violates assumptions (each file row have a unique id)
                throw new Error(`code is not unique (${row.sourceId})`);
            }
            ncitIds.add(row.sourceId);

            // Saving relationship to parent term
            // SubClassOf edges will be created at the very end.
            subclassEdges.push(...row.parents.map(parent => [row.sourceId, parent]));

            // SKIPPING
            // when already existing MAIN term (based on sourceId, name and displayName similarity)
            if (exists.has(existsHashCheck(row)) && !ignoreCache) {
                counts.exists++;
                continue;
            }

            // create the new record
            const {
                displayName,
                deprecated,
                description,
                endpoint,
                name,
                sourceId,
                synonyms,
                url,
            } = row;

            logger.verbose(`- ${name}`);

            // main Therapy|Disease|AnatomicalEntity node record
            record = await conn.addRecord({
                content: {
                    deprecated,
                    description,
                    displayName,
                    name,
                    source,
                    sourceId,
                    url,
                },
                existsOk: true,
                fetchConditions: convertRecordToQueryFilters({
                    name,
                    source,
                    sourceId,
                }),
                target: endpoint,
                upsert: true,
                upsertCheckExclude: [
                    'comment',
                ],
            });
            // cache by sourceId the newly added/updated MAIN record
            mainRIDBySourceId.set(record.sourceId, String(record['@rid']));

            // add synonyms as alias records
            if (!ignoreSynonyms) {
                for (const synonym of synonyms) {
                    // Skipping synonym if equal to the record's name
                    if (synonym.toLowerCase() === name.toLowerCase()) {
                        continue;
                    }

                    logger.verbose(`- synonym ${synonym.toLowerCase()}`);

                    try {
                        // alias Therapy|Disease|AnatomicalEntity node record
                        const alias = await conn.addRecord({
                            content: {
                                alias: true,
                                deprecated,
                                displayName: `${synonym} [${record.sourceId}]`,
                                name: synonym.toLowerCase(),
                                source,
                                sourceId: record.sourceId,
                            },
                            existsOk: true,
                            fetchConditions: convertRecordToQueryFilters({
                                name: synonym.toLowerCase(),
                                source,
                                sourceId,
                            }),
                            target: endpoint,
                            upsert: true,
                            upsertCheckExclude: [
                                'comment',
                            ],
                        });

                        // AliasOf edge
                        if (rid(alias) !== rid(record)) {
                            await conn.addRecord({
                                content: { in: rid(record), out: rid(alias), source },
                                existsOk: true,
                                fetchExisting: false,
                                target: 'aliasof',
                            });
                        }
                    } catch (err) {
                        logger.error(`failed to link (${record.sourceId}) to alias (${synonym})`);
                        logger.error(err);
                    }
                }
            }

            counts.success++;
        } catch (err) {
            logger.error(err);
            erroredSourceIds.add(row.sourceId);
            counts.error++;
        }
    } // END OF MAIN LOOP

    // SUBCLASSING
    // Create SubClassOf relationships between child and parent records
    // subclassEdges is an array of arrays.
    logger.info(`Uploading ${subclassEdges.length} SubClassOf edges...`);

    for (const [childSourceId, parentSourceId] of subclassEdges) {
        // Makes sure both child and parent are already existing/uploaded MAIN records
        if (
            mainRIDBySourceId.has(childSourceId)
            && mainRIDBySourceId.has(parentSourceId)
        ) {
            await conn.addRecord({
                content: {
                    in: rid(mainRIDBySourceId.get(parentSourceId)),
                    out: rid(mainRIDBySourceId.get(childSourceId)),
                    source,
                },
                existsOk: true,
                fetchExisting: false,
                target: 'SubClassOf',
            });
        }
    }

    // DEPRECATING
    // Deprecates GraphKB records no longer in upload
    if (!ignoreDeprecating) {
        logger.info('deprecating old GraphKB records...');
        await deprecateRecords(conn, { ncitIds, source });
    }

    // LOGGING
    logger.info(`Count of records without an explicitly given name: ${noExplicitNameCount}`);
    logger.info(`Count of sourceId used as record's name: ${sourceIdAsNameCount}`);
    logger.info(JSON.stringify(counts));
};


module.exports = {
    SOURCE_DEFN,
    cleanRawRow,
    deprecateRecords,
    filterSynonyms,
    pickEndpoint,
    processFileContent,
    uploadFile,
};
