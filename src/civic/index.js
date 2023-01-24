/**
 * @module importer/civic
 */
const _ = require('lodash');
const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

const { error: { ErrorMixin } } = require('@bcgsc-pori/graphkb-parser');

const { checkSpec, request } = require('../util');
const {
    orderPreferredOntologyTerms,
    rid,
    shouldUpdate,
} = require('../graphkb');
const { logger } = require('../logging');
const _pubmed = require('../entrez/pubmed');
const _entrezGene = require('../entrez/gene');
const { civic: SOURCE_DEFN, ncit: NCIT_SOURCE_DEFN } = require('../sources');
const { processVariantRecord } = require('./variant');
const { getPublication } = require('./publication');
const { EvidenceItem: evidenceSpec } = require('./specs.json');

class NotImplementedError extends ErrorMixin { }

const ajv = new Ajv();

const BASE_URL = 'https://civicdb.org/api/graphql';

/**
 * 1-5 : https://docs.civicdb.org/en/latest/model/evidence/evidence_rating.html
 * A-E : https://docs.civicdb.org/en/latest/model/evidence/level.html
 */
const VOCAB = {
    1: 'Claim is not supported well by experimental evidence. Results are not reproducible, or have very small sample size. No follow-up is done to validate novel claims.',
    2: 'Evidence is not well supported by experimental data, and little follow-up data is available. Publication is from a journal with low academic impact. Experiments may lack proper controls, have small sample size, or are not statistically convincing.',
    3: 'Evidence is convincing, but not supported by a breadth of experiments. May be smaller scale projects, or novel results without many follow-up experiments. Discrepancies from expected results are explained and not concerning.',
    4: 'Strong, well supported evidence. Experiments are well controlled, and results are convincing. Any discrepancies from expected results are well-explained and not concerning.',
    5: 'Strong, well supported evidence from a lab or journal with respected academic standing. Experiments are well controlled, and results are clean and reproducible across multiple replicates. Evidence confirmed using independent methods. The study is statistically well powered.',
    A: 'Proven/consensus association in human medicine.',
    B: 'Clinical trial or other primary patient data supports association.',
    C: 'Individual case reports from clinical journals.',
    D: 'In vivo or in vitro models support association.',
    E: 'Indirect evidence.',
    url: 'https://docs.civicdb.org/en/latest/model/evidence.html',
};

const EVIDENCE_LEVEL_CACHE = {}; // avoid unecessary requests by caching the evidence levels
const RELEVANCE_CACHE = {};

const validateEvidenceSpec = ajv.compile(evidenceSpec);


/**
 * Requests evidence items from CIViC using their graphql API
 */
const requestEvidenceItems = async (url, opt) => {
    const allRecords = [];
    let hasNextPage = true;

    while (hasNextPage) {
        try {
            const page = await request({
                body: { ...opt },
                json: true,
                method: 'POST',
                uri: url,
            });
            allRecords.push(...page.data.evidenceItems.nodes);
            opt.variables = { ...opt.variables, after: page.data.evidenceItems.pageInfo.endCursor };
            hasNextPage = page.data.evidenceItems.pageInfo.hasNextPage;
        } catch (err) {
            logger.error(err);
            throw (err);
        }
    }
    return allRecords;
};


/**
 * Extract the appropriate GraphKB relevance term from a CIViC evidence record
 */
const translateRelevance = (evidenceType, evidenceDirection, significance) => {
    if (evidenceDirection === 'DOES_NOT_SUPPORT') {
        switch (evidenceType) { // eslint-disable-line default-case
            case 'DIAGNOSTIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'NEGATIVE': {
                        // 2 cases to address
                        break;
                    }

                    case 'POSITIVE': {
                        // 11 cases to address
                        break;
                    }
                }
            }

            case 'FUNCTIONAL': {
                switch (significance) { // eslint-disable-line default-case
                    case 'DOMINANT_NEGATIVE': {
                        // 83 cases to address
                        break;
                    }

                    case 'GAIN_OF_FUNCTION': {
                        // 11 cases to address
                        break;
                    }

                    case 'LOSS_OF_FUNCTION': {
                        // 2 cases to address
                        break;
                    }

                    case 'NEOMORPHIC': {
                        // 6 cases to address
                        break;
                    }

                    case 'UNALTERED_FUNCTION': {
                        // No case so far
                        break;
                    }

                    case 'UNKNOWNED': {
                        // 1 case (to address?)
                        break;
                    }
                }
            }

            case 'ONCOGENIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'ONCOGENICITY': {
                        // 3 cases to address
                        break;
                    }

                    case 'PROTECTIVENESS': {
                        // No cases so far
                        break;
                    }
                }
            }

            case 'PREDICTIVE': {
                switch (significance) { // eslint-disable-line default-case
                    case 'ADVERSE_RESPONSE': {
                        // 1 case to address
                        break;
                    }

                    case 'NA': {
                        // According to https://civic.readthedocs.io/en/latest/model/evidence/significance.html
                        // "Variant does not inform clinical interepretation"
                        break;
                    }

                    case 'REDUCED_SENSITIVITY': {
                        // 2 cases to address
                        break;
                    }

                    case 'RESISTANCE': {
                        return 'no resistance';
                    }

                    case 'SENSITIVITYRESPONSE': {
                        return 'no response';
                    }
                }
            }

            case 'PREDISPOSING': {
                switch (significance) { // eslint-disable-line default-case
                    case 'LIKELY_PATHOGENIC': {
                        // 1 case to address. Should not append according to CIViC docs
                        break;
                    }

                    case 'POSITIVE': {
                        // 1 case to address. Should not append according to CIViC docs
                        break;
                    }

                    case 'PREDISPOSITION': {
                        // 2 cases to address
                        break;
                    }

                    case 'PROTECTIVENESS': {
                        // No case so far
                        break;
                    }
                }
            }

            case 'PROGNOSTIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'BETTER_OUTCOME': {
                        // 4 case to address.
                        break;
                    }

                    case 'NA': {
                        // 38 cases (to address?)
                        // According to https://civic.readthedocs.io/en/latest/model/evidence/significance.html
                        // "The N/A option can be used to imply that the variant does not have an impact on patient prognosis."
                        break;
                    }

                    case 'POOR_OUTCOME': {
                        // 34 cases to address
                        break;
                    }
                }
            }
        }
    } else if (evidenceDirection === 'SUPPORTS') {
        switch (evidenceType) { // eslint-disable-line default-case
            case 'DIAGNOSTIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'NEGATIVE': {
                        return 'opposes diagnosis';
                    }

                    case 'POSITIVE': {
                        return 'favours diagnosis';
                    }

                    case 'NA': {
                        // 9 cases (to address? 'POSITIVE' implied?). Should not append according to CIViC docs
                        break;
                    }
                }
            }

            case 'FUNCTIONAL': {
                switch (significance) { // eslint-disable-line default-case
                    case 'DOMINANT_NEGATIVE': {
                        return 'dominant negative';
                    }

                    case 'GAIN_OF_FUNCTION': {
                        return 'gain of function';
                    }

                    case 'LOSS_OF_FUNCTION': {
                        return 'loss of function';
                    }

                    case 'NEOMORPHIC': {
                        return 'neomorphic';
                    }

                    case 'UNALTERED_FUNCTION': {
                        return 'unaltered function';
                    }

                    case 'UNKNOWNED': {
                        // No case so far
                        break;
                    }
                }
            }

            case 'ONCOGENIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'ONCOGENICITY': {
                        // 92 cases.
                        // So far, only OncoKB and IPRKB had statement of relevance 'oncogenic'.
                        // Needs confirmation !!
                        return 'oncogenic';
                    }

                    case 'PROTECTIVENESS': {
                        // No case so far
                        break;
                    }
                }
            }

            case 'PREDICTIVE': {
                switch (significance) { // eslint-disable-line default-case
                    case 'ADVERSE_RESPONSE': {
                        return 'adverse response';
                    }

                    case 'NA': {
                        // According to https://civic.readthedocs.io/en/latest/model/evidence/significance.html
                        // "Variant does not inform clinical interepretation"
                        break;
                    }

                    case 'REDUCED_SENSITIVITY': {
                        return 'reduced sensitivity';
                    }

                    case 'RESISTANCE': {
                        return 'resistance';
                    }

                    case 'SENSITIVITYRESPONSE': {
                        return 'sensitivity';
                    }
                }
            }

            case 'PREDISPOSING': {
                switch (significance) { // eslint-disable-line default-case
                    case 'LIKELY_PATHOGENIC': {
                        // 23 cases. Should not append according to CIViC docs
                        return 'likely pathogenic';
                    }

                    case 'NA': {
                        // 3 cases. Should not append according to CIViC docs
                        // Similar to 'UNCERTAIN_SIGNIFICANCE' ?
                        return 'likely predisposing';
                    }

                    case 'PATHOGENIC': {
                        // 13 cases. Should not append according to CIViC docs
                        return 'pathogenic';
                    }

                    case 'POSITIVE': {
                        // 3 cases. Should not append according to CIViC docs
                        return 'predisposing';
                    }

                    case 'PREDISPOSITION': {
                        return 'predisposing';
                    }

                    case 'PROTECTIVENESS': {
                        // No case so far
                        break;
                    }

                    case 'UNCERTAIN_SIGNIFICANCE': {
                        // 1267 cases. Should not append according to CIViC docs
                        return 'likely predisposing';
                    }
                }
            }

            case 'PROGNOSTIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'BETTER_OUTCOME': {
                        return 'favourable prognosis';
                    }

                    case 'NA': {
                        // 9 cases (to address?)
                        // According to https://civic.readthedocs.io/en/latest/model/evidence/significance.html
                        // "The N/A option can be used to imply that the variant does not have an impact on patient prognosis."
                        break;
                    }

                    case 'POOR_OUTCOME': {
                        return 'unfavourable prognosis';
                    }

                    case 'POSITIVE': {
                        // 1 case. Should not append according to CIViC docs
                        return 'favourable prognosis';
                    }
                }
            }
        }
    }

    // Addressing some NAs combinations
    if (evidenceDirection === 'NA' && significance === 'NA') {
        switch (evidenceType) { // eslint-disable-line default-case
            case 'PREDISPOSING': {
                // 1116 cases. Should not append according to CIViC docs
                // Similar to 'SUPPORT'+'PREDISPOSING'+'UNCERTAIN_SIGNIFICANCE' ?
                return 'likely predisposing';
            }

            case 'ONCOGENIC': {
                // 166 cases (to address?)
                // Similar to 'SUPPORT'+'ONCOGENIC'+'ONCOGENICITY' ?
                // Needs confirmation !!
                return 'oncogenic';
            }
        }
    }

    // If combination of evidenceDirection, evidenceType and significance not supported
    throw new NotImplementedError(
        `unable to process relevance (${JSON.stringify(
            { evidenceDirection, evidenceType, significance },
        )})`,
    );
};


/**
 * Convert the CIViC relevance types to GraphKB terms
 */
const getRelevance = async ({ rawRecord, conn }) => {
    // translate the type to a GraphKB vocabulary term
    let relevance = translateRelevance(
        rawRecord.evidenceType,
        rawRecord.evidenceDirection,
        rawRecord.significance,
    ).toLowerCase();

    if (RELEVANCE_CACHE[relevance] === undefined) {
        relevance = await conn.getVocabularyTerm(relevance);
        RELEVANCE_CACHE[relevance.name] = relevance;
    } else {
        relevance = RELEVANCE_CACHE[relevance];
    }
    return relevance;
};

/**
 * Given some therapy name, find the therapy that is equivalent by name in GraphKB
 */
const getTherapy = async (conn, therapyRecord) => {
    let originalError;

    // fetch from NCIt first if possible, or pubchem
    // then use the name as a fallback
    const name = therapyRecord.name.toLowerCase().trim();

    if (therapyRecord.ncitId) {
        try {
            const therapy = await conn.getUniqueRecordBy({
                filters: [
                    { source: { filters: { name: NCIT_SOURCE_DEFN.name }, target: 'Source' } },
                    { sourceId: therapyRecord.ncitId },
                    { name: therapyRecord.name },
                ],
                sort: orderPreferredOntologyTerms,
                target: 'Therapy',
            });
            return therapy;
        } catch (err) {
            logger.error(`had NCIt therapy mapping (${therapyRecord.ncitId}) named (${therapyRecord.name}) but failed to fetch from graphkb: ${err}`);
            throw err;
        }
    }

    try {
        const therapy = await conn.getTherapy(name);
        return therapy;
    } catch (err) {
        originalError = err;
    }

    try {
        const match = /^\s*(\S+)\s*\([^)]+\)$/.exec(name);

        if (match) {
            return await conn.getTherapy(match[1]);
        }
    } catch (err) { }
    logger.error(originalError);
    throw originalError;
};


/** *
 * Add or fetch a therapy combination if there is not an existing record
 * Link the therapy combination to its individual elements
 */
const addOrFetchTherapy = async (conn, source, therapiesRecords, combinationType) => {
    if (therapiesRecords.length <= 1) {
        if (therapiesRecords[0] === null) {
            return null;
        }
        return getTherapy(conn, therapiesRecords[0]);
    }
    const therapies = await Promise.all(therapiesRecords.map(async therapy => getTherapy(conn, therapy)));
    const sourceId = therapies.map(e => e.sourceId).sort().join(' + ');
    const name = therapies.map(e => e.name).sort().join(' + ');
    const combinedTherapy = await conn.addRecord({
        content: {
            combinationType, name, source: rid(source), sourceId,
        },
        existsOk: true,
        target: 'Therapy',
    });

    for (const therapy of therapies) {
        await conn.addRecord({
            content: {
                in: rid(combinedTherapy), out: rid(therapy), source: rid(source),
            },
            existsOk: true,
            target: 'ElementOf',
        });
    }
    return combinedTherapy;
};


const getEvidenceLevel = async ({
    conn, rawRecord, sources,
}) => {
    // get the evidenceLevel
    let level = `${rawRecord.evidenceLevel}${rawRecord.evidenceRating || ''}`.toLowerCase();

    if (EVIDENCE_LEVEL_CACHE[level] === undefined) {
        level = await conn.addRecord({
            content: {
                description: `${VOCAB[rawRecord.evidenceLevel]} ${VOCAB[rawRecord.evidenceRating] || ''}`,
                displayName: `${SOURCE_DEFN.displayName} ${level.toUpperCase()}`,
                name: level,
                source: rid(sources.civic),
                sourceId: level,
                url: VOCAB.url,
            },
            existsOk: true,
            fetchConditions: {
                AND:
                    [{ sourceId: level }, { name: level }, { source: rid(sources.civic) }],
            },
            target: 'EvidenceLevel',

        });
        EVIDENCE_LEVEL_CACHE[level.sourceId] = level;
    } else {
        level = EVIDENCE_LEVEL_CACHE[level];
    }
    return level;
};


/**
 * Transform a CIViC evidence record into a GraphKB statement
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object for GraphKB
 * @param {object} opt.rawRecord the unparsed record from CIViC
 * @param {object} opt.sources the sources by name
 * @param {boolean} opt.oneToOne civic statements to graphkb statements is a 1 to 1 mapping
 * @param {object} opt.variantsCache used to avoid repeat processing of civic variants. stores the graphkb variant(s) if success or the error if not
 * @param
 */
const processEvidenceRecord = async (opt) => {
    const {
        conn, rawRecord, sources, variantsCache, oneToOne = false,
    } = opt;

    const [level, relevance, [feature]] = await Promise.all([
        getEvidenceLevel(opt),
        getRelevance(opt),
        _entrezGene.fetchAndLoadByIds(conn, [rawRecord.variant.gene.entrezId]),
    ]);
    let variants;

    if (variantsCache.records[rawRecord.variant.id]) {
        variants = variantsCache.records[rawRecord.variant.id];
    } else if (variantsCache.errors[rawRecord.variant.id]) {
        throw variantsCache.errors[rawRecord.variant.id];
    } else {
        try {
            variants = await processVariantRecord(conn, rawRecord.variant, feature);
            variantsCache.records[rawRecord.variant.id] = variants;
            logger.verbose(`converted variant name (${rawRecord.variant.name}) to variants (${variants.map(v => v.displayName).join(', and ')})`);
        } catch (err) {
            variantsCache.errors[rawRecord.variant.id] = err;
            logger.error(`evidence (${rawRecord.id}) Unable to process the variant (id=${rawRecord.variant.id}, name=${rawRecord.variant.name}): ${err}`);
            throw err;
        }
    }


    // get the disease by doid
    let disease;

    // find the disease if it is not null
    if (rawRecord.disease) {
        let diseaseQueryFilters = {};

        if (rawRecord.disease.doid) {
            diseaseQueryFilters = {
                AND: [
                    { sourceId: `doid:${rawRecord.disease.doid}` },
                    { source: { filters: { name: 'disease ontology' }, target: 'Source' } },
                ],
            };
        } else {
            diseaseQueryFilters = { name: rawRecord.disease.name };
        }

        disease = await conn.getUniqueRecordBy({
            filters: diseaseQueryFilters,
            sort: orderPreferredOntologyTerms,
            target: 'Disease',
        });
    }
    // get the therapy/therapies by name
    let therapy;

    if (rawRecord.therapies) {
        try {
            therapy = await addOrFetchTherapy(
                conn,
                rid(sources.civic),
                rawRecord.therapies,
                (rawRecord.therapyInteractionType || '').toLowerCase(),
            );
        } catch (err) {
            logger.error(err);
            logger.error(`failed to fetch therapy: ${JSON.stringify(rawRecord.therapies)}`);
            throw err;
        }
    }

    const publication = await getPublication(conn, rawRecord);

    // common content
    const content = {
        conditions: [...variants.map(v => rid(v))],
        description: rawRecord.description,
        evidence: [rid(publication)],
        evidenceLevel: [rid(level)],
        relevance: rid(relevance),
        reviewStatus: (rawRecord.status === 'ACCEPTED'
            ? 'not required'
            : 'pending'
        ),
        source: rid(sources.civic),
        sourceId: rawRecord.id,
    };

    // create the statement and connecting edges
    if (rawRecord.evidenceType === 'DIAGNOSTIC' || rawRecord.evidenceType === 'PREDISPOSING') {
        if (!disease) {
            throw new Error('Unable to create a diagnostic or predisposing statement without a corresponding disease');
        }
        content.subject = rid(disease);
    } else if (disease) {
        content.conditions.push(rid(disease));
    }

    if (rawRecord.evidenceType === 'PREDICTIVE' && therapy) {
        content.subject = rid(therapy);
    } if (rawRecord.evidenceType === 'PROGNOSTIC') {
        // get the patient vocabulary object
        content.subject = rid(await conn.getVocabularyTerm('patient'));
    } if (rawRecord.evidenceType === 'FUNCTIONAL') {
        content.subject = rid(feature);
    }

    if (content.subject && !content.conditions.includes(content.subject)) {
        content.conditions.push(content.subject);
    }

    if (!content.subject) {
        throw Error(`unable to determine statement subject for evidence (${content.sourceId}) record`);
    }

    const fetchConditions = [
        { sourceId: content.sourceId },
        { source: content.source },
        { evidence: content.evidence }, // civic evidence items are per publication
    ];

    if (!oneToOne) {
        fetchConditions.push(...[
            { relevance: content.relevance },
            { subject: content.subject },
            { conditions: content.conditions },
        ]);
    }

    let original;

    if (oneToOne) {
        // get previous iteration
        const originals = await conn.getRecords({
            filters: {
                AND: [
                    { source: rid(sources.civic) },
                    { sourceId: rawRecord.id },
                ],
            },
            target: 'Statement',
        });

        if (originals.length > 1) {
            throw Error(`Supposed to be 1to1 mapping between graphKB and civic but found multiple records with source ID (${rawRecord.id})`);
        }
        if (originals.length === 1) {
            [original] = originals;

            const excludeTerms = [
                '@rid',
                '@version',
                'comment',
                'createdAt',
                'createdBy',
                'reviews',
                'updatedAt',
                'updatedBy',
            ];

            if (!shouldUpdate('Statement', original, content, excludeTerms)) {
                return original;
            }
        }
    }

    if (original) {
        // update the existing record
        return conn.updateRecord('Statement', rid(original), content);
    }
    // create a new record
    return conn.addRecord({
        content,
        existsOk: true,
        fetchConditions: {
            AND: fetchConditions,
        },
        target: 'Statement',
        upsert: true,
        upsertCheckExclude: [
            'comment',
            'displayNameTemplate',
            'reviews',
        ],
    });
};


/**
 * Get a list of CIViC Evidence Items which have since been deleted.
 * Returns the list of evidence item IDs to be purged from GraphKB
 *
 * @param {string} url endpoint for the CIViC API
 */
const fetchDeletedEvidenceItems = async (url) => {
    const ids = new Set();

    // Get rejected evidenceItems
    logger.info(`loading rejected evidenceItems from ${url}`);
    const rejected = await requestEvidenceItems(url, {
        query: `query evidenceItems($after: String, $status: EvidenceStatusFilter) {
                    evidenceItems(after: $after, status: $status) {
                        nodes {id}
                        pageCount
                        pageInfo {endCursor, hasNextPage}
                        totalCount
                    }
                }`,
        variables: {
            status: 'REJECTED',
        },
    });
    rejected.forEach(node => ids.add(node.id));
    logger.info(`fetched ${ids.size} rejected entries from CIViC`);
    return ids;
};


/**
 * Fetch civic approved evidence entries as well as those submitted by trusted curators
 *
 * @param {string} url the endpoint for the request
 * @param {string[]} trustedCurators a list of curator IDs to also fetch submitted only evidence items for
 */
const downloadEvidenceRecords = async (url, trustedCurators) => {
    const records = [];
    const errorList = [];
    const counts = {
        error: 0, exists: 0, skip: 0, success: 0,
    };

    const evidenceItems = [];
    const query = fs.readFileSync(path.join(__dirname, 'evidenceItems.graphql')).toString();

    // Get accepted evidenceItems
    logger.info(`loading accepted evidenceItems from ${url}`);
    const accepted = await requestEvidenceItems(url, {
        query,
        variables: {
            status: 'ACCEPTED',
        },
    });
    logger.info(`fetched ${accepted.length} accepted entries from CIViC`);
    evidenceItems.push(...accepted);

    // Get submitted evidenceItems from trusted curators
    for (const curator of Array.from(new Set(trustedCurators))) {
        if (!Number.isNaN(curator)) {
            logger.info(`loading submitted evidenceItems by trusted curator ${curator} from ${url}`);
            const submittedByATrustedCurator = await requestEvidenceItems(url, {
                query,
                variables: {
                    status: 'SUBMITTED',
                    userId: parseInt(curator, 10),
                },
            });
            evidenceItems.push(...submittedByATrustedCurator);
        }
    }
    const submittedCount = evidenceItems.length - accepted.length;
    logger.info(`loaded ${submittedCount} unaccepted entries by trusted submitters from CIViC`);

    // Validation
    for (const record of evidenceItems) {
        try {
            checkSpec(validateEvidenceSpec, record);
        } catch (err) {
            errorList.push({ error: err, errorMessage: err.toString(), record });
            logger.error(err);
            counts.error++;
            continue;
        }

        if (
            record.significance === 'NA'
            || (record.significance === null && record.evidenceType === 'PREDICTIVE')
        ) {
            counts.skip++;
            logger.debug(`skipping uninformative record (${record.id})`);
        } else {
            records.push(record);
        }
    }
    return { counts, errorList, records };
};


/**
 * Access the CIVic API, parse content, transform and load into GraphKB
 *
 * @param {object} opt options
 * @param {ApiConnection} opt.conn the api connection object for GraphKB
 * @param {string} [opt.url] url to use as the base for accessing the civic ApiConnection
 * @param {string[]} opt.trustedCurators a list of curator IDs to also fetch submitted only evidence items for
 */
const upload = async ({
    conn, errorLogPrefix, trustedCurators, ignoreCache = false, maxRecords, url = BASE_URL,
}) => {
    const source = await conn.addSource(SOURCE_DEFN);

    // Get list of all previous statements from CIVIC in GraphKB
    let previouslyEntered = await conn.getRecords({
        filters: { source: rid(source) },
        returnProperties: ['sourceId'],
        target: 'Statement',
    });
    previouslyEntered = new Set(previouslyEntered.map(r => r.sourceId));
    logger.info(`Found ${previouslyEntered.size} records previously added from ${SOURCE_DEFN.name}`);
    // Get list of all Pubmed publication reccords from GraphKB
    logger.info('caching publication records');
    _pubmed.preLoadCache(conn);

    // Get evidence records from CIVIC (Accepted, or Submitted from a trusted curator)
    const { counts, errorList, records } = await downloadEvidenceRecords(url, trustedCurators);
    // Get rejected evidence records ids from CIVIC
    const purgeableEvidenceItems = await fetchDeletedEvidenceItems(url);

    logger.info(`Processing ${records.length} records`);
    // keep track of errors and already processed variants by their CIViC ID to avoid repeat logging
    const variantsCache = {
        errors: {},
        records: {},
    };

    // Refactor records into recordsById and varById
    const recordsById = {};
    const varById = {};

    for (const record of records) {

        // Check if max records limit has been reached
        if (maxRecords && Object.keys(recordsById).length >= maxRecords) {
            logger.warn(`not loading all content due to max records limit (${maxRecords})`);
            break;
        }

        // Check if record id is unique
        if (recordsById[record.id]) {
            logger.warn(`Multiple evidenceItems with the same id: ${record.id}. Violates assumptions. Only the 1st one was kept.`);
            continue;
        }

        // Introducing Molecular Profiles with CIViC GraphQL API v2.2.0
        // EvidenceItem (many-to-one) MolecularProfile (many-to-many) Variant
        if (record.molecularProfile && record.molecularProfile.id) {
            if (record.molecularProfile.variants.length === 0) {
                throw new Error(`Molecular Profile without Variant. Violates assumptions: ${record.molecularProfile.id}`);
            } else if (record.molecularProfile.variants.length > 1) {
                logger.warn(`Skip upload of Evidence Item with complex Molecular Profile (those with more that 1 Variant): ${record.molecularProfile.id}`);
                continue;
            } else {
                // Assuming 1 Variant per Molecular Profile
                varById[record.molecularProfile.variants[0].id.toString()] = record.molecularProfile.variants[0];
            }
        } else {
            throw new Error(`Evidence Item without Molecular Profile. Violates assumptions: ${record.id}`);
        }

        // Adding EvidenceItem to object for upload
        recordsById[record.id] = record;
    }

    // Main loop on recordsById
    for (const [sourceId, record] of Object.entries(recordsById)) {
        if (previouslyEntered.has(sourceId) && !ignoreCache) {
            counts.exists++;
            continue;
        }
        if (purgeableEvidenceItems.has(sourceId)) {
            // this should never happen. If it does we have made an invalid assumption about how civic uses IDs.
            throw new Error(`Record ID is both deleted and to-be loaded. Violates assumptions: ${sourceId}`);
        }
        const preupload = new Set((await conn.getRecords({
            filters: [
                { source: rid(source) }, { sourceId },
            ],
            target: 'Statement',
        })).map(rid));

        let mappedCount = 0;
        const postupload = [];

        // Resolve combinations
        // Splits civic evidence items therapies into separate evidence items based on their combination type.
        if (record.therapies === null || record.therapies.length === 0) {
            record.therapies = [null];
        } else if (
            record.therapyInteractionType === 'COMBINATION'
            || record.therapyInteractionType === 'SEQUENTIAL'
        ) {
            record.therapies = [record.therapies];
        } else if (record.therapyInteractionType === 'SUBSTITUTES' || record.therapies.length < 2) {
            record.therapies = record.therapies.map(therapy => [therapy]);
            record.therapyInteractionType = null;
        } else {
            logger.error(`(evidence: ${record.id}) unsupported therapy interaction type (${record.therapyInteractionType}) for a multiple therapy (${record.therapies.length}) statement`);
            counts.skip++;
            continue;
        }

        // Splits variants into a list to indicate separate evidence items when variants have been linked as "or"
        // Assuming 1 Variant per Molecular Profile
        record.variants = [varById[record.molecularProfile.variants[0].id.toString()]]; // OR-ing of variants
        let orCombination;

        if (orCombination = /^([a-z]\d+)([a-z])\/([a-z])$/i.exec(record.variants[0].name)) {
            const [, prefix, tail1, tail2] = orCombination;
            record.variants = [
                { ...record.variants[0], name: `${prefix}${tail1}` },
                { ...record.variants[0], name: `${prefix}${tail2}` },
            ];
        }

        mappedCount += record.variants.length * record.therapies.length;

        const oneToOne = mappedCount === 1 && preupload.size === 1;

        // Upload all GraphKB statements for this CIViC Evidence Item
        for (const variant of record.variants) {
            for (const therapies of record.therapies) {
                try {
                    logger.debug(`processing ${record.id}`);
                    const result = await processEvidenceRecord({
                        conn,
                        oneToOne,
                        rawRecord: { ..._.omit(record, ['therapies', 'variants']), therapies, variant },
                        sources: { civic: source },
                        variantsCache,
                    });
                    postupload.push(rid(result));
                    counts.success += 1;
                } catch (err) {
                    if (
                        err.toString().includes('is not a function')
                        || err.toString().includes('of undefined')
                    ) {
                        console.error(err);
                    }
                    if (err instanceof NotImplementedError) {
                        // accepted evidence that we do not support loading. Should delete as it may have changed from something we did support
                        purgeableEvidenceItems.add(sourceId);
                    }
                    errorList.push({ error: err, errorMessage: err.toString(), record });
                    logger.error(`evidence (${record.id}) ${err}`);
                    counts.error += 1;
                }
            }
        }

        // compare statments before/after upload to determine if any records should be soft-deleted
        postupload.forEach((id) => {
            preupload.delete(id);
        });

        if (preupload.size && purgeableEvidenceItems.has(sourceId)) {
            logger.warn(`
                Removing ${preupload.size} CIViC Entries (EID:${sourceId}) of unsupported format
            `);

            try {
                await Promise.all(
                    Array.from(preupload).map(
                        async outdatedId => conn.deleteRecord('Statement', outdatedId),
                    ),
                );
            } catch (err) {
                logger.error(err);
            }
        } else if (preupload.size) {
            if (postupload.length) {
                logger.warn(`deleting ${preupload.size} outdated statement records (${Array.from(preupload).join(' ')}) has new/retained statements (${postupload.join(' ')})`);

                try {
                    await Promise.all(
                        Array.from(preupload).map(
                            async outdatedId => conn.deleteRecord('Statement', outdatedId),
                        ),
                    );
                } catch (err) {
                    logger.error(err);
                }
            } else {
                logger.error(`NOT deleting ${preupload.size} outdated statement records (${Array.from(preupload).join(' ')}) because failed to create replacements`);
            }
        }
    }

    // purge any remaining entries that are in GraphKB but have since been rejected/deleted by CIViC
    const toDelete = await conn.getRecords({
        filters: {
            AND: [
                { sourceId: Array.from(purgeableEvidenceItems) },
                { source: rid(source) },
            ],
        },
        target: 'Statement',
    });

    try {
        logger.warn(`Deleting ${toDelete.length} outdated CIViC statements from GraphKB`);
        await Promise.all(toDelete.map(async statement => conn.deleteRecord(
            'Statement', rid(statement),
        )));
    } catch (err) {
        logger.error(err);
    }

    logger.info(JSON.stringify(counts));
    const errorJson = `${errorLogPrefix}-civic.json`;
    logger.info(`writing ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify(errorList, null, 2));
};


module.exports = {
    SOURCE_DEFN,
    specs: { validateEvidenceSpec },
    translateRelevance,
    upload,
};
