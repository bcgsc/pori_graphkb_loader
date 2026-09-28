/* eslint-disable object-curly-newline */
/* eslint-disable multiline-ternary */
const { jsonifyVariant, parseVariant } = require('@bcgsc-pori/graphkb-parser');

const _entrezGene = require('../entrez/gene');
const { orderPreferredOntologyTerms, rid } = require('../graphkb');
const { logger } = require('../logging');
const { recoder } = require('./recoding');
const { hashOncokbRecordToId } = require('./util');

/** @typedef {import('../graphkb').ApiConnection} ApiConnection */


// Supported category Variants, excl. fusions and signatures
const CATEGORIES = [
    'Amplification',
    'Deletion',
    'Kinase Domain Duplication',
    'Oncogenic Mutations',
    'Overexpression',
    'Truncating Mutations',
    'Truncating Mutation', // without 's'
    'Wildtype',
];
const SIGNATURES = new Map([
    ['MSI-H', { reference: 'microsatellite instability', type: 'high signature' }],
    ['TMB-H', { reference: 'mutation burden', type: 'high signature' }],
]);

/**
 * Test a variant record object for 'other biomarkers'
 *
 * @param {object} r the variant record object
 * @returns {boolean}
 */
const isSignature = (r) => r.gene === 'Other Biomarkers' || r.entrezGeneId === -2;

/**
 * Preprocesses all signatures (OncoKB 'Other Biomarkers')
 * and compiles a map of Signature CVs to GraphKB RIDs.
 *
 * Upload corresponding CVs if needed.
 * Supported biomarkers are MSI-H and TMB-H (from proteinChange).
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB file contents
 * @returns {Promise<Map<string, string>>}
 */
const processSignatures = async ({ conn, data }) => {
    const signatures = new Map();

    // Extracting 'Other Biomarkers'
    const otherBiomarkers = new Set([...data.actionable, ...data.annotated]
        .filter((r) => isSignature(r))
        .map((r) => r.proteinChange),
    );

    for (const biomarker of otherBiomarkers) {
        if (!SIGNATURES.has(biomarker)) {
            logger.warn(`Other biomarker '${biomarker}' is not supported`);
            signatures.set(biomarker, undefined);
            continue;
        }

        const signature = SIGNATURES.get(biomarker);

        try {
            const reference = await conn.getUniqueRecordBy({
                filters: { name: signature.reference },
                target: 'Signature',
            });
            const type = await conn.getUniqueRecordBy({
                filters: { name: signature.type },
                target: 'Vocabulary',
            });

            // fetch/upload corresponding CV
            const cv = await conn.addVariant({
                content: {
                    reference1: rid(reference),
                    type: rid(type),
                },
                existsOk: true,
                fetchFirst: true,
                target: 'CategoryVariant',
            });
            signatures.set(biomarker, rid(cv));
            logger.info(`Fetched/uploaded Signature CV ${cv.displayName} for ${biomarker}`);
        } catch (err) {
            logger.warn(`Cannot fetch/upload Signature CV ${signature.reference} ${signature.type} for ${biomarker}`);
            signatures.set(biomarker, undefined);
        }
    }

    // record to signature association
    const signatureMap = new Map();

    for (const r of [...data.actionable, ...data.annotated]) {
        if (isSignature(r)) {
            signatureMap.set(
                hashOncokbRecordToId(r),
                signatures.get(r.proteinChange),
            );
        }
    }

    return signatureMap;
};

/**
 * Fetch a subset of GraphKB CategoryVariant records
 *
 * Only types in CATEGORIES are considered
 * (excludes fusion and signature CVs)
 *
 * @param {ApiConnection} conn the API connection object
 * @returns {Promise<object>} { germline: <Map>, somatic: <Map>}
 */
const fetchCategoryVariants = async (conn) => {
    const categories = CATEGORIES.map((el) => el
        .replace(/s$/, '')
        .toLowerCase(),
    );
    const records = await conn.getRecords({
        filters: {
            type: {
                filters: { name: categories },
                target: 'Vocabulary',
            },
        },
        neighbors: 0,
        returnProperties: [
            '@rid',
            'germline',
            'reference1.name',
            'type.@rid',
            'type.name',
        ],
        target: 'CategoryVariant',
    });

    const cvs = {
        germline: new Map(records
            .filter((r) => r.germline)
            .map((r) => [`${'germline'} ${r.reference1.name} ${r.type.name}`, rid(r)]),
        ),
        somatic: new Map(records
            .filter((r) => !r.germline)
            .map((r) => [`${'somatic'} ${r.reference1.name} ${r.type.name}`, rid(r)]),
        ),
    };

    logger.info(`Fetched ${cvs.germline.size + cvs.somatic.size} CategoryVariants from GraphKB`);
    return cvs;
};

/**
 * Fetch all fusion category variant records from GraphKB and
 * returns a mapping from OncoKB notation to GraphKB RID.
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {string} opt.type the fusion variant type RID
 * @returns {Promise<Map<string, string>>}
 */
const fetchFusionCVs = async ({ conn, type }) => {
    try {
        const records = await conn.getRecords({
            filters: { type },
            neighbors: 0,
            returnProperties: [
                '@rid',
                'germline',
                'reference1.name',
                'reference2.name',
            ],
            target: 'CategoryVariant',
        });

        const fusionsWithPartners = records
            .filter((r) => !r.germline)
            .filter((r) => r.reference2)
            .map((r) => [
                // "<gene1>-<gene2> fusion"
                `${r.reference1.name}-${r.reference2.name} fusion`,
                rid(r),
            ]);
        const fusionsWithoutPartners = records
            .filter((r) => !r.germline)
            .filter((r) => !r.reference2)
            .map((r) => [
                // "<gene1> fusion"
                `${r.reference1.name} fusion`,
                rid(r),
            ]);

        const fusions = new Map([...fusionsWithPartners, ...fusionsWithoutPartners]);
        logger.info(`Fetched ${fusions.size} fusion records from GraphKB`);
        return fusions;
    } catch (err) {
        logger.warn(`Unable to fetch fusion CategoryVariant records from GraphKB: ${err}`);
        return new Map();
    }
};

/**
 * Given a gene name (ref), returns the corresponding GraphKB RID
 * Fetch from GraphKB or upload from Entrez, else undefined
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {string} opt.ref the reference name to add a mapping for
 * @returns {string|undefined}
 */
const fetchAndUploadReference = async ({ conn, ref }) => {
    // Fetch from GraphKB
    try {
        const result = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { biotype: 'gene' },
                    { name: ref.toLowerCase() },
                ],
            },
            neighbors: 0,
            sort: orderPreferredOntologyTerms, // Entrez gene over HGNC
            target: 'Feature',
        });
        return rid(result);
    } catch (err) { }

    // Upload from Entrez
    try {
        const result = await _entrezGene.fetchAndLoadBySearchTerm(conn, ref);
        logger.info(`Uploaded new gene Feature ${ref} (${rid(result)}) from Entrez`);
        return rid(result);
    } catch (err) {
        logger.warn(`Unable to fetch ${ref} gene from Entrez`);
    }
    return undefined;
};

/**
 * Test a variant record for fusion, and capture gene symbols as references
 * Supports both paired fusions and fusions without partners
 *
 * Paired fusions need special handling because of the overloaded hyphen separator
 * also used in some gene symbols. Leveraging the gene prop to disambiguate genes from each other.
 *
 * @param {object} r the variant record object
 * @param {boolean} assumptions if assumptions needs to be tested (logger warnings)
 * @returns {object|undefined}
 */
const parseFusion = (r, assumptions = true) => {
    const { gene, proteinChange, variant } = r;

    const testAssumptions = () => {
        if (!assumptions) {
            return;
        }
        if (proteinChange !== variant) {
            logger.warn(`Fusion variant (${variant}) breaking identity assumption with proteinChange (${proteinChange})`);
        }
        if (r.setting !== 'Somatic') {
            logger.warn(`Fusion variant (${variant}) breaking 'Somatic' setting assumption (${r.setting})`);
        }
    };

    // FUSIONS WITHOUT PARTNERS
    if (variant === 'Fusions') {
        testAssumptions();
        return { reference1: gene };
    }

    // PAIRED FUSIONS
    const paired = variant
        ? variant.match(/^(.*) Fusion$/i)
        : false;

    if (paired) {
        testAssumptions();

        const right = paired[1].match(`^(.+)-(${gene})$`);
        const left = paired[1].match(`^(${gene})-(.+)$`);
        const parsed = {
            reference1: right ? right[1] : gene,
            reference2: left ? left[2] : gene,
        };

        if (!parsed.reference1 || !parsed.reference2) {
            logger.warn(`Cannot parse ambiguous fusion notation (${variant})`);
            return undefined;
        }
        if (parsed.reference1 === parsed.reference2) {
            if (`${parsed.reference1}-${parsed.reference2} Fusion` !== variant) {
                logger.warn(`Cannot parse ambiguous fusion notation (${variant})`);
                return undefined;
            }
        }

        return parsed;
    }

    // NOT A FUSION
    return undefined;
};

/**
 * Preprocesses all fusion category variants
 * and compiles a map of fusions (OncoKB recordId -> GraphKB RID)
 *
 * Fusions are assumed to always be coming from a Somatic setting,
 * and variant and proteinChange fusion values are assumed to always be the same
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB file contents
 * @returns {Promise<Map<string, string|undefined>>}
 */
const processFusions = async ({ conn, data }) => {
    const fusionMap = new Map();

    // Resolved fusions and references are tracked to avoid repeating
    const fusions = new Map();
    const references = new Map();

    // Fusion CVs from GraphKB
    const type = rid(await conn.getVocabularyTerm('fusion'));
    const graphkbFusions = await fetchFusionCVs({ conn, type });

    // Iterate through all OncoKB variants
    for (const record of [...data.actionable, ...data.annotated]) {
        const id = hashOncokbRecordToId(record);

        // Check if fusion; capture refs + test assumptions
        const fusion = parseFusion(record);

        if (fusion) {
            const ref1 = fusion.reference1;
            const ref2 = fusion.reference2;
            const variant = ref2
                ? `${ref1}-${ref2} Fusion`.toLowerCase()
                : `${ref1} Fusion`.toLowerCase();

            // Already processed
            if (fusions.has(variant)) {
                fusionMap.set(id, fusions.get(variant));
                continue;
            }
            // Already in GraphKB
            if (graphkbFusions.has(variant)) {
                const graphkbRid = graphkbFusions.get(variant);
                fusions.set(variant, graphkbRid);
                fusionMap.set(id, graphkbRid);
                continue;
            }

            // Upload
            // Process fusion's references
            for (const ref of [ref1, ref2]) {
                if (ref && !references.has(ref)) {
                    references.set(ref, await fetchAndUploadReference({ conn, ref }));
                }
            }

            // Upload new fusion category variant
            try {
                if (
                    !references.get(ref1)
                    || (ref2 && !references.get(ref2))
                ) {
                    throw new Error('A reference is missing');
                }

                const cv = await conn.addVariant({
                    content: {
                        reference1: references.get(ref1),
                        reference2: ref2
                            ? references.get(ref2)
                            : undefined,
                        type,
                    },
                    existsOk: true,
                    target: 'CategoryVariant',
                });
                fusions.set(variant, rid(cv));
                logger.info(`Uploaded CategoryVariant ${cv.displayName} (${rid(cv)})`);
            } catch (err) {
                fusions.set(variant, undefined);
                logger.warn(`Unable to upload CategoryVariant for ${variant}: ${err}`);
            }
            fusionMap.set(id, fusions.get(variant));
        }
    }

    return fusionMap;
};

/**
 * Assigns a CategoryVariant RID, if any, to the record (by hashed id)
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB file contents
 * @param {object} opt.ontologies the ontologies mapping object
 * @returns {Promise<Map<string, string|undefined>>}
 */
const processCategoryVariants = async ({ conn, data, ontologies }) => {
    logger.info('\nCATEGORY VARIANTS:');
    const { genes, types } = ontologies;

    // FUSIONS & SIGNATURES (Somatic setting only)
    const categoryMap = new Map([
        ...await processFusions({ conn, data }),
        ...await processSignatures({ conn, data }),
    ]);

    // CV records from GraphKB ('<setting> <gene> <variant>' => RID)
    const graphkbCategories = await fetchCategoryVariants(conn);

    // Other supported categories; both germline and somatic settings
    const categories = new Map();

    for (const record of [...data.actionable, ...data.annotated]) {
        let { gene, setting, variant: type } = record;
        const { entrezGeneId } = record;
        const id = hashOncokbRecordToId(record);

        // skip if record has already been processed (as fusion or signature)
        if (categoryMap.has(id)) {
            continue;
        }

        // skip if not a category, or not a supported one
        if (!CATEGORIES.includes(type)) {
            continue;
        }

        // formatting
        setting = setting
            .toLowerCase();
        gene = gene
            .toLowerCase();
        type = type
            ? type
                .toLowerCase()
                .replace(/s$/, '')
            : '';
        const variant = `${setting} ${gene} ${type}`;

        // category variant already processed
        if (categories.has(variant)) {
            categoryMap.set(id, categories.get(variant));
            continue;
        }

        // category variant already in GraphKB
        if (graphkbCategories[setting].has(variant)) {
            const graphkbRid = rid(graphkbCategories[setting].get(variant));
            categories.set(variant, graphkbRid);
            categoryMap.set(id, graphkbRid);
            continue;
        }

        // Upload
        try {
            const cv = await conn.addVariant({
                content: {
                    germline: setting === 'germline' || undefined,
                    reference1: genes.get(entrezGeneId),
                    type: types.get(type),
                },
                target: 'CategoryVariant',
            });
            logger.info(`Successfully uploaded ${setting} CategoryVariant ${cv.displayName} (${rid(cv)})`);
            categories.set(variant, rid(cv));
            categoryMap.set(id, rid(cv));
        } catch (err) {
            logger.warn(`Cannot upload CategoryVariant ${variant} to GraphKB: ${err}`);
            logger.warn(JSON.stringify({
                germline: setting === 'germline' || undefined,
                reference1: genes.get(entrezGeneId),
                type: types.get(type),
            }));
            categories.set(variant, undefined);
            categoryMap.set(id, undefined);
        }
    }

    return categoryMap;
};

/**
 * Format input props, extract each available notation levels
 * and parse into one or more object representations
 *
 * Some cds coordinates are avail. on the variant prop.
 * Some protein coordinates are avail. on the proteinChange prop.
 * Some genomic coordinates are avail. on the variant and proteinChange props.
 * Some exonic coordinates are avail. on the variant and proteinChange props (same).
 *
 * @param {object} r the variant record
 * @returns {object|undefined}
 */
const parseNotations = (r) => {
    let { proteinChange, variant } = r;

    // FORMATTING
    proteinChange = proteinChange || '';
    proteinChange = proteinChange.replace(/_?splice$/i, 'spl'); // splice-site
    proteinChange = proteinChange.replace(/^(\d+_\d+)spl$/i, '($1)spl'); // uncertain positions (splice-site)
    proteinChange = proteinChange.replace(/^([A-Za-z]?\d+_[A-Za-z]?\d+)fs$/i, '($1)fs'); // uncertain positions (frameshift)
    proteinChange = proteinChange.replace(/^([A-Za-z]?\d+_[A-Za-z]?\d+)trunc$/i, '($1)*'); // uncertain positions (truncating mutation)
    variant = variant || '';

    // EXTRACTING LEVEL NOTATIONS
    // cds
    let cds;
    const cdsMatch1 = variant.match(/^(c\..+)$/); // as-is
    const cdsMatch2 = variant.match(/\{(c\.[^}]+)\}\s*$/); // in curly brackets

    if (cdsMatch1) {
        cds = cdsMatch1[1];
    }
    if (cdsMatch2 && !cdsMatch1) {
        cds = cdsMatch2[1];
    }

    // exonic
    let exonic;
    const exonicMatch1 = proteinChange.match(/^Exon\s+(\d+)\s+Deletion$/i); // category-like deletion
    const exonicMatch2 = variant.match(/^Exon\s+(\d+)\s+Deletion$/i); // category-like deletion
    const exonicMatch3 = variant.match(/^(e\..+)$/); // as-is (can be afterr hardcoded substitution)

    if (exonicMatch1) {
        exonic = `e.${exonicMatch1[1]}del`;
    }
    if (exonicMatch2) {
        exonic = `e.${exonicMatch2[1]}del`;
    }
    if (exonicMatch3) {
        exonic = exonicMatch3[1];
    }

    // genomic
    let genomic;
    const genomicMatch = proteinChange.match(/^(?:[1-9]|1\d|2[0-2]|X|Y|MT):g\..+$/i);

    if (genomicMatch) {
        genomic = `chr${genomicMatch[0]}`.toLowerCase();
    }

    // protein
    const protein = proteinChange && !genomic && !exonic
        ? `p.${proteinChange}`
        : false;

    // PARSING NOTATIONS INTO OBJECTS
    const parsed = { c: null, e: null, g: null, p: null };

    if (cds) {
        try {
            parsed.c = parseVariant(cds, false);
        } catch (err) {
            logger.error(`Error parsing CDS variant ${cds}`);
        }
    }
    if (exonic) {
        try {
            parsed.e = parseVariant(exonic, false);
        } catch (err) {
            logger.error(`Error parsing Exonic variant ${exonic}`);
        }
    }
    if (genomic) {
        try {
            parsed.g = parseVariant(genomic, true); // with feature;
        } catch (err) {
            logger.error(`Error parsing Genomic variant ${genomic}`);
        }
    }
    if (protein) {
        try {
            parsed.p = parseVariant(protein, false);
        } catch (err) {
            // No error logging for protein since we're trying to parse almost anything from proteinChange
        }
    }

    if (parsed.c || parsed.e || parsed.g || parsed.p) {
        return parsed;
    }
    return undefined;
};

/**
 * Assigns a PositionalVariant RID, if any, to the record (by hashed id)
 *
 * Upload or fetch PVs
 * Upload Infers edges between PVs if needed
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB file contents
 * @param {object} opt.ontologies the ontologies mapping object
 * @param {string} opt.recode recoding strategy from GRCh37 to GRCH38
 * @returns {Promise<Map<string, string>>}
 */
const processPositionalVariants = async ({
    conn,
    data,
    ontologies,
    recode,
}) => {
    logger.info('\nPOSITIONAL VARIANTS:');
    const positionalVariants = new Map();
    const {
        chromosomes,
        ensembl,
        genes,
        transcripts,
        types,
    } = ontologies;

    for (const r of [...data.actionable, ...data.annotated]) {
        const pvs = { c: null, e: null, g: null, p: null };
        const id = hashOncokbRecordToId(r);

        // Extract and parse notations
        const parsed = parseNotations(r);

        if (!parsed) {
            continue;
        }

        // Recode to GRCh38
        if (recode && ['optimistic', 'pessimistic'].includes(recode)) {
            const recoded = await recoder(r, parsed, ensembl);

            for (const level of ['c', 'e', 'p']) {
                if (recoded[level]) {
                    parsed[level] = recoded[level];
                } else if (recode === 'pessimistic') {
                    parsed[level] = null;
                }
            }

            for (const level of ['g']) {
                if (recoded[level]) {
                    parsed[level] = recoded[level];
                } else {
                    // always pessimistic for genomic
                    parsed[level] = null;
                }
            }
        }

        // Upload/fetch each extracted level (c, e, g and/or p)
        for (const [level, content] of Object.entries(parsed)) {
            if (!content) {
                continue;
            }

            // Reference
            let reference1;

            if (level === 'c') {
                // always use the GRCh38 transcript version
                reference1 = transcripts.get(r.grch38Isoform);
            }
            if (level === 'g') {
                reference1 = chromosomes.get(content.reference1);
            }
            if (['e', 'p'].includes(level)) {
                // always use the gene
                reference1 = genes.get(r.entrezGeneId);
            }

            try {
                pvs[level] = await conn.addVariant({
                    content: {
                        ...jsonifyVariant(content),
                        germline: r.setting === 'Germline',
                        reference1,
                        type: types.get(content.type),
                    },
                    existsOk: true,
                    fetchFirst: true,
                    target: 'PositionalVariant',
                });
                logger.info(`Successfully uploaded/fetched ${r.setting} PositionalVariant ${pvs[level].displayName} (${rid(pvs[level])})`);
            } catch (err) {
                logger.warn(`Cannot upload PositionalVariant: ${err.message}`);
            }
        }

        // Add infering edges
        for (const [r1, r2] of new Map([
            [pvs.g, pvs.c], // g. -Infers-> c.
            [pvs.c, pvs.p], // c. -Infers-> p.
            [pvs.e, pvs.p], // e. -Infers-> p.
        ])) {
            if (r1 && r2) {
                try {
                    const edge = await conn.addRecord({
                        content: { in: rid(r2), out: rid(r1) },
                        existsOk: true,
                        target: 'Infers',
                    });
                    logger.info(`Successfully uploaded/fetched Infers edge ${r1.displayName} -Infers-> ${r2.displayName} (${rid(edge)})`);
                } catch (err) {
                    logger.warn(`Cannot create Infers edge between PositionalVariant '${r1.displayName}' and '${r2.displayName}': ${err.message}`);
                }
            }
        }

        // Pick a referenced variant for that record
        // (protein over cds, cds over exonic or genomic)
        const referenced = rid(pvs.p ?? pvs.c ?? pvs.e ?? pvs.g, true) || undefined;

        if (referenced) {
            positionalVariants.set(id, referenced);
        }
    }

    return positionalVariants;
};

/**
 * Maps OncoKB record to a GraphKB variant record.
 * Category and positional variants are preprocessed first, separately.
 * Setting (germline or somatic) is taken into account.
 *
 * New variants and/or features are uploaded when needed.
 * Referenced positional variants have priority over category ones.
 * Unmapped variants raise a warning, not an error.
 *
 * @param {object} opt
 * @param {ApiConnection} opt.conn the API connection object
 * @param {object} opt.data the parsed OncoKB file contents
 * @param {object} opt.ontologies the ontologies mapping object
 * @param {string} opt.recode recoding strategy from GRCh37 to GRCH38
 * @returns {Promise<Map<string, string|undefined>>}
 */
const variantMapping = async (opt) => {
    logger.info('\n\n** BIOMARKERS **');
    return new Map([
        ...await processCategoryVariants(opt),
        ...await processPositionalVariants(opt), // PVs override CVs as Statement's conditional biomarker
    ]);
};

module.exports = {
    CATEGORIES,
    SIGNATURES,
    fetchAndUploadReference,
    fetchCategoryVariants,
    fetchFusionCVs,
    hashOncokbRecordToId,
    parseFusion,
    parseNotations,
    processCategoryVariants,
    processFusions,
    processPositionalVariants,
    processSignatures,
    variantMapping,
};
