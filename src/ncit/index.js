const { loadDelimToJson } = require('../util');
const {
    rid, generateCacheKey, convertRecordToQueryFilters,
} = require('../graphkb');
const { logger } = require('../logging');

const { ncit: SOURCE_DEFN } = require('../sources');

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
 * Determine if the term is an body part, disease, or drug
 */
const pickEndpoint = (conceptName, parentConcepts = '') => {
    let endpoint = null;

    if (anatomyConcepts.some(term => conceptName.includes(term))) {
        endpoint = 'AnatomicalEntity';
    }
    if (diseaseConcepts.some(term => conceptName.includes(term))) {
        if (endpoint) {
            throw Error(`Concept must be in a discrete category (${conceptName})`);
        }
        endpoint = 'Disease';
    }
    if (therapeuticConcepts.some(term => conceptName.includes(term))) {
        if (endpoint) {
            throw Error(`Concept must be in a discrete category (${conceptName})`);
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
        } catch (err) {}
    }
    throw new Error(`Concept not implemented (${conceptName})`);
};

/**
 * Convert the raw row record to a standard form
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
    const endpoint = pickEndpoint(semanticType, parentConcepts);

    // split up the name if it is a list
    if (row.name && row.name.includes('|')) {
        const names = row.name.split('|')
            .map(s => s.trim())
            .filter(s => s);
        [row.name] = names;
        row.synonyms.push(...names.slice(1));
    }

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
                [, row.species] = speciesMatch(synonym);
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

    // use the synonym name if no name given
    if (!row.name) {
        row.name = sourceId;
    }

    const url = xmlTag.replace(/^</, '').replace(/>$/, '');

    // add the parents
    return {
        ...row,
        displayName: row.name.toLowerCase() === sourceId.toLowerCase()
            ? sourceId
            : `${row.name} [${sourceId}]`,
        endpoint,
        name: row.name.toLowerCase(),
        sourceId,
        synonyms: Array.from(new Set(row.synonyms))
            .map(s => s.toLowerCase())
            .filter(s => s !== row.name.toLowerCase()),
        url,
    };
};

/**
 * Given the path to some NCIT OWL file, upload the parsed ontology records
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input OWL file
 * @param {ApiRequst} opt.conn the API connection object
 */
const uploadFile = async ({ filename, conn }) => {
    logger.info('Loading external NCIT data');
    logger.info(`loading: ${filename}`);
    const rawRows = await loadDelimToJson(filename, {
        delim: '\t',
        header: [
            'id',
            'xmlTag',
            'parents',
            'synonyms',
            'definition',
            'name',
            'conceptStatus',
            'semanticType',
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
    const deprecated = [];

    for (const raw of rawRows) {
        try {
            const row = cleanRawRow(raw);

            if (row.deprecated) {
                deprecated.push(row);
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
                logger.error(err);
            }

            counts.skip++;
        }
    }
    logger.verbose(`skipping (${deprecated.length}) retired or obsolete concepts: ${deprecated.map(d => d.sourceId).join(',')}`);
    const rejected = new Set();

    // if possible, assign the row another name from its list of synonyms (instead of the display name)
    for (const [name, dups] of Object.entries(nameDuplicates)) {
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

        if (name && humanDups.length > 1) {
            logger.warn(`ncit terms (${humanDups.map(r => r.sourceId).join(', ')}) have non-unique name (${name})`);
            humanDups.forEach(d => rejected.add(d.sourceId));
        }
    }
    logger.warn(`rejected ${rejected.size} rows for unresolveable primary/display name conflicts`);

    const source = rid(await conn.addRecord({
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
        target: 'Source',
    }));
    const recordsById = {};
    const subclassEdges = [];

    // list the ncit records already loaded
    const cached = {};
    logger.info('getting previously loaded records');
    const cachedRecords = await conn.getRecords({
        filters: { AND: [{ source }, { alias: false }] },
        neighbors: 0,
        target: 'Ontology',
    });
    const exists = new Set();
    const existsHashCheck = record => [
        generateCacheKey(record),
        record.name,
        record.displayName,
    ].join('____');

    for (const record of cachedRecords) {
        cached[generateCacheKey(record)] = record;
        exists.add(existsHashCheck(record));
    }
    logger.info(`loaded and cached ${Object.keys(cached).length} records`);


    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (rejected.has(row.sourceId)) {
            counts.error++;
            continue;
        }
        logger.verbose(`processing (${i} / ${rows.length}) ${row.sourceId}`);
        let record;

        try {
            const cacheKey = generateCacheKey(row);

            if (recordsById[cacheKey]) {
                throw new Error(`code is not unique (${cacheKey})`);
            }
            if (exists.has(existsHashCheck(row))) {
                counts.exists++;
                continue;
            }

            // create the new record
            const {
                endpoint, sourceId, description, url, name, deprecated, displayName,
            } = row;
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
                    name: row.name,
                    source,
                    sourceId,
                }),
                target: endpoint,
                upsert: true,
            });
            cached[generateCacheKey(record)] = record;

            // add the synonyms
            for (const synonym of row.synonyms) {
                if (synonym.toLowerCase() === row.name.toLowerCase()) {
                    continue;
                }

                try {
                    const alias = await conn.addRecord({
                        content: {
                            alias: true,
                            deprecated,
                            displayName: `${synonym} [${record.sourceId}]`,
                            name: synonym,
                            source,
                            sourceId: record.sourceId,
                        },
                        existsOk: true,
                        fetchConditions: convertRecordToQueryFilters({
                            name: synonym,
                            source,
                            sourceId,
                        }),
                        target: endpoint,
                        upsert: true,
                        upsertCheckExclude: [
                            'comment',
                            'displayName',
                        ],
                    });

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


            // add the parents
            subclassEdges.push(row.parents.map(parent => [cacheKey, generateCacheKey({ sourceId: parent })]));
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
                content: {
                    in: rid(cached[parentKey]),
                    out: rid(cached[recordKey]),
                    source,
                },
                existsOk: true,
                fetchExisting: false,
                target: 'SubClassOf',
            });
        }
    }
    logger.info(JSON.stringify(counts));
};


module.exports = { SOURCE_DEFN, uploadFile };
