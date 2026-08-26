/* eslint-disable multiline-ternary */
const { constants: { TYPES_TO_NOTATION } } = require('@bcgsc-pori/graphkb-parser');

const { therapyMapping } = require('./therapies');
const { parseEvidence } = require('./util');
const { CATEGORIES, variantMapping } = require('./variants');
const _pubmed = require('../entrez/pubmed');
const _entrezGene = require('../entrez/gene');
const { orderPreferredOntologyTerms, rid } = require('../graphkb');
const { logger } = require('../logging');

/** @typedef {import('../graphkb').ApiConnection} ApiConnection */


const ACTIONABLE_RELEVANCE_TERMS = {
    diagnostic: 'Diagnostic Indicator',
    prognostic: 'Prognostic Indicator',
    resistance: 'Resistance',
    sensitivity: 'Sensitivity',
};
const DISCARDED_RELEVANCES = new Set([
    'Inconclusive',
    'VUS with Special Interpretation',
    'Unknown',
]);

/**
 * Mapping between OncoKB levels and GraphKB evidence levels (RID)
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB files content
 * @param {object} opt.source the GraphKB Source record for OncoKB
 * @returns {Promise<Map<string, string>>}
 */
const evidenceLevelMapping = async ({ conn, data, source }) => {
    logger.info('\nEVIDENCE LEVEL:');
    const evidenceLevelMap = new Map();

    // referenced levels in OncoKB actionable variants input file
    const levels = new Set(
        data.actionable.map((r) => r.level),
    );
    logger.info(`${levels.size} levels referenced in OncoKB`);

    // corresponding evidence levels in GraphKB
    for (const level of levels) {
        try {
            const evidenceLevel = await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { name: level.toLowerCase() },
                        { source: rid(source) },
                    ],
                },
                target: 'EvidenceLevel',
            });
            evidenceLevelMap.set(level, rid(evidenceLevel));
        } catch (err) {
            logger.warn(`Cannot map OncoKB level (${level}) to an OncoKB-related GraphKB EvidenceLevel; make sure data/evidenceLevels.json is up-to-date and has been uploaded.`);
        }
    }
    logger.info(`Found ${evidenceLevelMap.size}/${levels.size} corresponding evidence levels in GraphKB`);

    return evidenceLevelMap;
};

/**
 * Parse level into a corresponding relevance term
 *
 * @param {string} level an OncoKB actionable variant level
 * @returns {string|undefined}
 */
const parseLevelIntoRelevanceTerm = (level) => {
    let relevance;

    switch (true) {
        // therapy-related
        case /^\d+[a-z]?$/i.test(level): // 1|2|3A|3B|4
            relevance = ACTIONABLE_RELEVANCE_TERMS.sensitivity;
            break;

        case /^[r]\d+[a-z]?$/i.test(level): // R1|R2
            relevance = ACTIONABLE_RELEVANCE_TERMS.resistance;
            break;

        // disease-related
        case /^dx\d+$/i.test(level): // Dx1|Dx2|Dx3
            relevance = ACTIONABLE_RELEVANCE_TERMS.diagnostic;
            break;

        case /^px\d+$/i.test(level): // Px1|Px2|Px3
            relevance = ACTIONABLE_RELEVANCE_TERMS.prognostic;
            break;

        default:
            break;
    }

    return relevance;
};

/**
 * Mapping between OncoKB terms and GraphKB Relevance vocabulary terms (RID)
 *
 * Actionable variants get their relevance from the level prop;
 * Annotrated variants get their relevance from oncogenicity|mutationEffect props.
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB files content
 * @param {set} opt.levels the set of referenced levels in OncoKB actionable variants input file
 * @returns {Promise<Map<number, string>>}
 */
const relevanceMapping = async ({ conn, data, levels }) => {
    logger.info('\nRELEVANCE TERMS:');
    const terms = new Set();
    const relevanceMap = new Map();

    // relevance terms from actionable variants levels
    for (const level of levels) {
        const relevance = parseLevelIntoRelevanceTerm(level);

        if (relevance) {
            terms.add(relevance);
        } else {
            logger.warn(`Cannot parse actionable variant level ${level} into a relevance term`);
        }
    }

    // relevance terms in annotated variants mutationEffect|oncogenicity
    for (const annotated of data.annotated) {
        terms.add(annotated.mutationEffect);

        if (annotated.oncogenicity !== null) {
            terms.add(annotated.oncogenicity);
        }
    }

    logger.info(`${terms.size} relevance terms referenced in OncoKB`);

    for (const term of terms) {
        // curated discarded terms
        if (DISCARDED_RELEVANCES.has(term)) {
            logger.warn(`Discarding relevance term (${term}); not supported.`);
            continue;
        }

        try {
            const relevance = await conn.getUniqueRecordBy({
                filters: {
                    name: term
                        .toLowerCase()
                        .replaceAll('-', ' '), // corresponding GraphKB terms without dashes (-)
                },
                target: 'Vocabulary',
            });
            relevanceMap.set(term, String(relevance['@rid']));
        } catch (err) {
            logger.warn(`Cannot map OncoKB term (${term}) to a GraphKB relevance Vocabulary record`);
        }
    }
    logger.info(`Found ${relevanceMap.size} corresponding relevances in GraphKB`);

    return relevanceMap;
};

/**
 * Mapping from Entrez gene id (integer) to corresponding GraphKB gene Feature RID.
 * Missing genes get fetched from Entrez and uploaded to GraphKB when possible.
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the GraphKB Source record for OncoKB
 * @returns {Promise<Map<number, string>>}
 */
const geneMapping = async ({ conn, data }) => {
    logger.info('\nGENES:');

    // Referenced genes in OncoKB input files
    const referenced = new Map(
        [...data.actionable, ...data.annotated]
            .filter((r) => r.entrezGeneId !== -2) // filtering out 'Other Biomarkers' references
            .map((r) => [r.entrezGeneId, r.gene]),
    );
    logger.info(`${referenced.size} genes referenced in OncoKB`);

    // corresponding GraphKB gene Feature records
    const features = await conn.getRecords({
        filters: {
            AND: [
                { biotype: 'gene' },
                { source: { filters: { name: 'entrez gene' }, target: 'Source' } },
                { sourceId: Array.from(referenced.keys()) },
            ],
        },
        returnProperties: ['@rid', 'sourceId'],
        target: 'Feature',
    });
    const genes = new Map(
        features.map((r) => [parseInt(r.sourceId, 10), rid(r)]),
    );
    const diff = [...referenced.keys()].filter((key) => !genes.has(key));
    logger.info(`Found ${genes.size}/${referenced.size} corresponding gene Features in GraphKB (${diff.length} missing)`);

    // new gene uploads
    if (diff.length > 0) {
        const uploads = [];

        // uploading one by one
        for (const id of diff) {
            try {
                uploads.push(
                    ...await _entrezGene.fetchAndLoadByIds(conn, [id]),
                );
                logger.info(`Uploaded Entrez gene ${id} as new GraphKB gene Feature record`);
            } catch (err) {
                logger.warn(`Unable to upload Entrez gene id ${id}`);
            }
        }
        logger.info(`Uploaded ${uploads.length}/${diff.length} missing gene Feature`);

        for (const record of uploads) {
            genes.set(
                parseInt(record.sourceId, 10),
                rid(record),
            );
        }
    }

    // check if all referenced genes have a corresponding GraphKB gene Feature record
    for (const [entrezGeneId, gene] of referenced) {
        if (!genes.has(entrezGeneId)) {
            logger.warn(`No gene Feature record found for gene ${gene} (${entrezGeneId})`);
        }
    }

    return genes;
};

/**
 * Map chromosome names to their GraphKB RIDs
 *
 * All names are lowercase and start with 'chr'
 * e.g. chr1, chr22, chrx, chry, chrmt
 *
 * @param {ApiConnection} conn the API connection object
 * @returns {Promise<Map<string, string>>}
 */
const chromosomeMapping = async (conn) => {
    logger.info('\nCHROMOSOMES:');

    const chromosomes = await conn.getRecords({
        filters: { biotype: 'chromosome' },
        returnProperties: ['@rid', 'name'],
        target: 'Feature',
    });

    const chrMap = new Map(
        chromosomes.map((r) => [r.name, rid(r)]),
    );
    logger.info(`${chrMap.size} chromosome records in GraphKB`);
    return chrMap;
};

/**
 * Extract individual evidence elements from a variant record.
 * Only PubMed papers are considered as evidence; abstracts get added as comments
 *
 * @param {object} opt
 * @param {object} opt.ontologies the ontology mappings
 * @param {object} opt.record the variant record
 * @param {boolean} [oncogenicity] if an annotated rec is evaluated for oncogenicity only
 * @returns {object} { comments: '', evidences: ['', ...] }
 */
const getEvidences = ({ ontologies, record: r }, oncogenicity) => {
    if (oncogenicity) {
        // OncoKB as evidence for oncogenicity statements
        return { comments: '', evidences: [rid(ontologies.source)] };
    }

    const pmids = parseEvidence(
        r.pmids
            ? r.pmids
            : r.mutationEffectPmids,
    );
    const abstracts = parseEvidence(
        r.abstracts
            ? r.abstracts
            : r.mutationEffectAbstracts,
        'abstracts',
    );

    let comments = '';
    const evidences = [];

    // PubMeds papers as evidence
    for (const pmid of pmids) {
        const pub = ontologies.publications.get(pmid);

        if (pub) {
            evidences.push(pub);
        }
    }

    // add abstracts as comments
    for (const abstract of abstracts) {
        comments += `\n${abstract}`;
    }

    // add OncoKB as evidence if none
    if (evidences.length === 0) {
        evidences.push(rid(ontologies.source));
    }

    return { comments, evidences };
};

/**
 * Mapping between OncoKB pmids and GraphKB Publication (RID)
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB files content
 * @returns {Promise<Map<string, string>>}
 */
const publicationMapping = async ({ conn, data }) => {
    logger.info('\nPUBLICATIONS:');
    const pmids = new Set();

    // all referenced PMIDs
    for (const type of ['actionable', 'annotated']) {
        data[type].forEach((r) => {
            parseEvidence(r[
                type === 'actionable'
                    ? 'pmids'
                    : 'mutationEffectPmids'
            ]).forEach((pmid) => pmids.add(pmid));
        });
    }
    logger.info(`${pmids.size} referenced PMIDs in OncoKB`);

    // corresponding GraphKB Publication records
    logger.info('Preloading PubMed cache...');
    await _pubmed.preLoadCache(conn);

    const BATCH_SIZE = 100;
    const pmidArray = Array.from(pmids);
    const publications = [];

    // Fetching/uploading by batch
    for (let i = 0; i < pmidArray.length; i += BATCH_SIZE) {
        const batch = pmidArray.slice(i, i + BATCH_SIZE);
        logger.info(`Uploading/fetching ${batch.length + i}/${pmidArray.length} records...`);
        const batchPubs = await _pubmed.fetchAndLoadByIds(conn, batch);
        publications.push(...batchPubs);
    }
    logger.info(`${publications.length}/${pmids.size} Publication records in GraphKB`);

    return new Map(
        publications.map((r) => [r.sourceId, rid(r)]), // r.sourceId is the pmid
    );
};

/**
 * Mapping between OncoKB cancer types and GraphKB diseases (RID)
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB files content
 * @returns {Promise<Map<string, string>>}
 */
const diseaseMapping = async ({ conn, data }) => {
    logger.info('\nDISEASES:');
    const diseaseMap = new Map();

    // referenced cancer types in OncoKB actionable variants
    const cancerTypes = new Set(
        data.actionable.map((r) => r.cancerType),
    );
    logger.info(`${cancerTypes.size} cancer types referenced in OncoKB `);

    // mapping OncoKB cancer types to GraphKB therapy RIDs
    for (const cancerType of cancerTypes) {
        try {
            const disease = await conn.getUniqueRecordBy({
                filters: { name: cancerType },
                sort: orderPreferredOntologyTerms,
                target: 'Disease',
            });
            diseaseMap.set(cancerType, rid(disease));
        } catch (err) {
            logger.warn(`Cannot map OncoKB cancer type (${cancerType}) to a GraphKB Disease`);
        }
    }
    logger.info(`Found ${diseaseMap.size}/${cancerTypes.size} corresponding diseases in GraphKB`);

    return diseaseMap;
};

/**
 * Variant type mappings (Vocabulary subset)
 *
 * @param {ApiConnection} conn the API connection object
 * @returns {Promise<Map<string, string>>}
 */
const typeMapping = async (conn) => {
    logger.info('\nVARIANT TYPES:');

    // supported positional variant types (used by the GraphKB parser)
    const pvTypes = await conn.getRecords({
        filters: { name: Object.keys(TYPES_TO_NOTATION) },
        returnProperties: ['@rid', 'name'],
        target: 'Vocabulary',
    });
    logger.info(`Mapped ${pvTypes.length} variant types supported for Positional Variants parsing`);

    // supported category variant types
    const categories = CATEGORIES.map((el) => el
        .replace(/s$/, '')
        .toLowerCase(),
    );
    const cvTypes = await conn.getRecords({
        filters: { name: categories },
        returnProperties: ['@rid', 'name'],
        target: 'Vocabulary',
    });
    logger.info(`Mapped ${cvTypes.length} variant types supported for Category Variants, excl. fusions and signatures`);

    const types = new Map([
        ...pvTypes.map((r) => [r.name, rid(r)]),
        ...cvTypes.map((r) => [r.name, rid(r)]),
    ]);

    return types;
};

/**
 * Map all vocabulary record RIDs to their displayName
 * Special reverse-mapping for logging Statement uploads per relevance.
 *
 * @param {ApiConnection} conn the API connection object
 * @returns {Promise<Map<string, string>>}
 */
const vocabMapping = async (conn) => {
    const vocab = await conn.getRecords({
        returnProperties: ['@rid', 'displayName'],
        target: 'Vocabulary',
    });

    return new Map(
        vocab.map((r) => [rid(r), r.displayName]),
    );
};

/**
 * Maps all referenced OncoKB ontologies (incl. variants) to GraphKB records.
 *
 * Unmapped terms raise a warning, not an error.
 * Missing combination therapies get uploaded to GraphKB
 * Missing genes get fetched from Entrez and uploaded to GraphKB when possible
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB file contents
 * @param {object} opt.source the GraphKB Source record for OncoKB
 * @returns {Promise<object>} an object with all the ontology mappings
 */
const ontologyMappings = async ({ conn, data, source }) => {
    const Onto = {};

    logger.info('\n\n** ONTOLOGIES **');
    Onto.source = source; // from upstream conn.addSource()
    Onto.chromosomes = await chromosomeMapping(conn);
    Onto.genes = await geneMapping({ conn, data });
    Onto.evidenceLevels = await evidenceLevelMapping({ conn, data, source });
    Onto.relevances = await relevanceMapping({ conn, data, levels: Onto.evidenceLevels.keys() });
    Onto.diseases = await diseaseMapping({ conn, data });
    Onto.therapies = await therapyMapping({ conn, data, source });
    Onto.publications = await publicationMapping({ conn, data });
    Onto.types = await typeMapping(conn);
    Onto.vocabulary = await vocabMapping(conn);

    // Biomarkers
    Onto.variants = await variantMapping({ conn, data, ontologies: Onto });

    return Onto;
};


module.exports = {
    ACTIONABLE_RELEVANCE_TERMS,
    DISCARDED_RELEVANCES,
    chromosomeMapping,
    diseaseMapping,
    evidenceLevelMapping,
    geneMapping,
    getEvidences,
    ontologyMappings,
    parseLevelIntoRelevanceTerm,
    publicationMapping,
    relevanceMapping,
    typeMapping,
    vocabMapping,
};
