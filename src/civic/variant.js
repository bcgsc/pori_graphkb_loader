const { ErrorMixin, ParsingError, parseVariant: parseVariantOriginal } = require('@bcgsc-pori/graphkb-parser');
const { rid } = require('../graphkb');
const _entrezGene = require('../entrez/gene');
const _snp = require('../entrez/snp');
const { civic: SOURCE_DEFN } = require('../sources');
const { logger } = require('../logging');

const { parseVariantDecorator } = require('../util');

const parseVariant = parseVariantDecorator(parseVariantOriginal);

class NotImplementedError extends ErrorMixin { }

const VARIANT_CACHE = new Map();


// based on discussion with cam here: https://www.bcgsc.ca/jira/browse/KBDEV-844
const SUBS = {
    'E746_T751>I': 'E746_T751delinsI',
    'EML4-ALK C1156Y-L1196M': 'EML4-ALK and C1156Y and L1196M',
    'EML4-ALK C1156Y-L1198F': 'EML4-ALK and C1156Y and L1198F',
    'EML4-ALK G1202R-L1196M': 'EML4-ALK and G1202R and L1196M',
    'EML4-ALK G1202R-L1198F': 'EML4-ALK and G1202R and L1198F',
    'EML4-ALK L1196M-L1198F': 'EML4-ALK and L1196M and L1198F',
    'EML4-ALK T1151INST': 'EML4-ALK and T1151_?1152insT',
    'Ex19 del L858R': 'e.19del and L858R',
    'G12/G13': 'p.(G12_G13)mut',
    K558NP: 'K558delKinsNP',
    T1151insT: 'T1151_?1152insT',
    'V600E AMPLIFICATION': 'V600E and AMPLIFICATION',
    'V600E+V600M': 'V600E and V600M',
    'V600_K601>E': 'V600_K601delVKinsE',
    'del 755-759': '?755_?759del',
    'di842-843vm': 'D842_I843delDIinsVM',
    mutations: 'mutation',
    'p.193_196dupSTSC (c.577_588dupAGCACCAGCTGC)': 'p.S193_C196dupSTSC (c.577_588dupAGCACCAGCTGC)',
    'p26.3-25.3 11mb del': 'y.p26.3_p25.3del',
};

/**
 * Compares two gene names together for equality
 *
 * @param {string} gene1 a gene name
 * @param {string} gene2 a second gene name
 * @returns {boolean} whether the genes names are equal or not
 */
const compareGeneNames = (gene1, gene2) => {
    if (['abl1', 'abl'].includes(gene1.toLowerCase()) && ['abl1', 'abl'].includes(gene2.toLowerCase())) {
        return true;
    } if (gene1.toLowerCase() === gene2.toLowerCase()) {
        return true;
    }
    return false;
};

/**
 * Normalize CIViC Gene Variant record as GraphKB positional and/or category variant(s)
 *
 * @param {object} param0
 * @param {string} param0.name
 * @param {string} param0.entrezId
 * @param {string} param0.entrezName
 * @returns {object[]}
 */
const normalizeGeneVariant = ({
    name: rawName, entrezId, entrezName: rawEntrezName,
}) => {
    // Exceptions: unsupported/unimplemented CIViC variant nomenclature
    if ([
        'Non-V600',
        'P-Loop Mutation',
    ].includes(rawName)) {
        throw new NotImplementedError(
            `unable to process CIViC variant ${rawEntrezName} ${rawName}`,
        );
    }

    // Substitutions: harcoded fix for known 'CIViC-to-GraphKB' correspondances
    let name = SUBS[rawName] || rawName;

    const entrezName = rawEntrezName.toLowerCase().trim();
    const joiner = ' and ';
    name = name.replace(' + ', joiner);
    name = name.replace('; ', joiner).toLowerCase().trim();

    if (name.includes(' / ')) {
        throw new ParsingError(`/ has ambiguous meaning in CIVIC, cannot process variant (${name})`);
    }
    if (name.includes(joiner)) {
        const result = [];
        name.split(joiner).forEach((n) => {
            result.push(...normalizeGeneVariant({ entrezId, entrezName, name: n.trim() }));
        });
        return result;
    }
    let match;
    const referenceGene = { name: entrezName.toLowerCase().trim(), sourceId: `${entrezId || ''}` };

    if ([
        'loss-of-function',
        'gain-of-function',
        'overexpression',
        'expression',
        'amplification',
        'mutation',
    ].includes(name)) {
        return [{
            reference1: { ...referenceGene },
            type: name.replace(/-/g, ' '),
        }];
    } if (match = /^t\(([^;()]+);([^;()]+)\)\(([^;()]+);([^;()]+)\)$/i.exec(name)) {
        // convert translocation syntax
        const [, chr1, chr2, pos1, pos2] = match;
        return [{
            positional: true,
            reference1: { name: chr1 },
            reference2: { name: chr2 },
            variant: `translocation(${pos1}, ${pos2})`,
        }];
    } if (match = /^(p\.)?([a-z*]\d+\S*)\s+\((c\.[^)]+)\)$/i.exec(name)) {
        // split combined protein + cds notation
        let [, , protein, cds] = match;

        // correct deprecated cds syntac
        if (match = /^c\.(\d+)([acgt][acgt]+)>([acgt][acgt]+)$/.exec(cds)) {
            const [, pos, ref, alt] = match;

            if (ref.length === alt.length) {
                cds = `c.${pos}_${Number.parseInt(pos, 10) + ref.length - 1}del${ref}ins${alt}`;
            }
        }
        return [{
            inferredBy: [ // keep the cds variant as a link to the protein variant
                {
                    positional: true,
                    reference1: { ...referenceGene },
                    variant: cds,
                },
            ],
            positional: true,
            reference1: { ...referenceGene },
            variant: `p.${protein}`,
        }];
    } if (match = /^(intron|exon)\s+(\d+)(-(\d+))?\s+(mutation|deletion|frameshift|insertion)s?$/i.exec(name)) {
        const break2 = match[4]
            ? `_${match[4]}`
            : '';
        const type = match[5] === 'frameshift'
            ? 'fs'
            : match[5].slice(0, 3);
        const prefix = match[1] === 'exon'
            ? 'e'
            : 'i';
        return [{
            positional: true,
            reference1: { ...referenceGene },
            variant: `${prefix}.${match[2]}${break2}${type}`,
        }];
    } if (match = /^([A-Z][^-\s]*)(-|::)([A-Z][^-\s]*)\s*(\S+)?$/i.exec(name)) {
        const [, gene1, , gene2, tail] = match;
        let rest = { type: 'fusion' };

        if (tail) {
            if (match = /^e(\d+)-e(\d+)$/.exec(tail || '')) {
                const [, exon1, exon2] = match;
                rest = { positional: true, variant: `fusion(e.${exon1},e.${exon2})` };
            } else if (match = /^[a-z](\d+);[a-z](\d+)$/.exec(tail || '')) {
                const [, exon1, exon2] = match;
                rest = { positional: true, variant: `fusion(e.${exon1},e.${exon2})` };
            } else {
                return [
                    ...normalizeGeneVariant({ entrezId, entrezName, name: `${gene1}-${gene2}` }),
                    ...normalizeGeneVariant({ entrezId, entrezName, name: tail }),
                ];
            }
        }

        if (compareGeneNames(gene1, entrezName)) {
            return [{
                reference1: { ...referenceGene },
                reference2: { name: gene2 },
                ...rest,
            }];
        } if (compareGeneNames(gene2, entrezName)) {
            return [{
                reference1: { name: gene1 },
                reference2: { ...referenceGene },
                ...rest,
            }];
        }
        throw new ParsingError(`linked gene name (${entrezName}) does not match either of the fusion partners (${gene1}, ${gene2}) for this variant (${rawName})`);
    } if (match = /^[A-Z][^-\s]*\s+fusions?$/i.exec(name)) {
        return [{ reference1: { ...referenceGene }, type: 'fusion' }];
    } if (match = /^\s*c\.\d+\s*[a-z]\s*>[a-z]\s*$/i.exec(name)) {
        return [{
            positional: true,
            reference1: { ...referenceGene },
            variant: name.replace(/\s+/g, ''),
        }];
    } if (match = /^((delete?rious)|promoter)\s+mutation$/i.exec(name) || name.includes('domain')) {
        return [{ reference1: { ...referenceGene }, type: name }];
    } if (match = /^(splicing\s+alteration)\s+\((c\..*)\)$/i.exec(name)) {
        const [, cat, cds] = match;
        return [{
            infers: [
                {
                    reference1: { ...referenceGene },
                    type: cat,
                },
            ],
            positional: true,
            reference1: { ...referenceGene },
            variant: cds,
        }];
    } if (match = /^([a-z]\d+)\s+(phosphorylation|splice site)(\s+mutation)?$/i.exec(name)) {
        const [, pos, type] = match;
        return [{
            positional: true,
            reference1: { ...referenceGene },
            variant: `p.${pos}${
                type === 'phosphorylation'
                    ? 'phos'
                    : 'spl'
            }`,
        }];
    } if (match = /^(\w+\s+fusion)\s+([a-z]\d+\S+)$/i.exec(name)) {
        const [, fusion, resistanceMutation] = match;
        const result = [];
        result.push(...normalizeGeneVariant({ entrezId, entrezName, name: fusion }));
        result.push(...normalizeGeneVariant({ entrezId, entrezName, name: resistanceMutation }));
        return result;
    } if (match = /^(.*)\s+mutations?$/.exec(name)) {
        const [, gene] = match;

        if (compareGeneNames(gene, entrezName)) {
            return [{ reference1: { ...referenceGene }, type: 'mutation' }];
        }
    }

    // try parser fallback for notation that is close to correct
    try {
        parseVariant(name, false);
        return [{ positional: true, reference1: { ...referenceGene }, variant: name }];
    } catch (err) {
        try {
            parseVariant(`p.${name}`, false);
            return [{
                positional: true,
                reference1: { ...referenceGene },
                variant: `p.${name}`,
            }];
        } catch (err2) {}
    }
    return [{ reference1: { ...referenceGene }, type: name }];
};


/**
 * Normalize CIViC Factors variant record as GraphKB Signatures/signature's CVs
 *
 * @param {object} record the raw variant record from CIViC
 * @returns {object[]}
 */
const normalizeFactorVariant = (record) => {
    const { feature: { featureInstance } } = record;

    switch (featureInstance.name) {
        case 'TMB':
            return [{
                reference1: {
                    class: 'Signature', // flag to escape gene fetching/upload
                    name: 'high mutation burden',
                },
                type: 'high signature',
            }];
        // TODO: Add support for other factors
        case 'Methylation signature':
        case 'Kataegis':
        case 'CK':
        default:
            throw new NotImplementedError(
                `unable to process Factor ${featureInstance.name} ${record.name}`,
            );
    }
};


/**
 * Normalize CIViC Fusion variant record as GraphKB CVs
 *
 * @param {object} record the raw variant record from CIViC
 * @returns {object[]} array of 1 normalized variant
 */
const normalizeFusionVariant = (record) => {
    const {
        feature: {
            featureInstance: {
                fivePrimeGene,
                threePrimeGene,
            },
        },
    } = record;

    if (fivePrimeGene && threePrimeGene) {
        return [{
            reference1: {
                name: fivePrimeGene.name.toLowerCase().trim(),
                sourceId: `${fivePrimeGene.entrezId || ''}`,
            },
            reference2: {
                name: threePrimeGene.name.toLowerCase().trim(),
                sourceId: `${threePrimeGene.entrezId || ''}`,
            },
            type: 'fusion',
        }];
    }
    if (fivePrimeGene) {
        return [{
            reference1: {
                name: fivePrimeGene.name.toLowerCase().trim(),
                sourceId: `${fivePrimeGene.entrezId || ''}`,
            },
            type: 'fusion',
        }];
    }
    if (threePrimeGene) {
        return [{
            reference1: {
                name: threePrimeGene.name.toLowerCase().trim(),
                sourceId: `${threePrimeGene.entrezId || ''}`,
            },
            type: 'fusion',
        }];
    }
    throw new Error('fivePrimeGene and/or threePrimeGene expected on Fusion variant');
};


/**
 * Given a CIViC variant record, do the normalization based on the feature type.
 * Can be more than 1 "GraphKB-normalized" variant per CIViC variant.
 * Returns the normalized variant(s).
 *
 * @param {Object} record the raw variant record from CIViC
 * @returns {object[]} array of normalized variant(s)
 */
const normalizeVariant = (record) => {
    try {
        const { feature: { featureInstance } } = record;
        const featureType = featureInstance.__typename;

        switch (featureType) {
            case 'Gene':
                // reformatting passed args for legacy purpose
                return normalizeGeneVariant({
                    entrezId: featureInstance.entrezId,
                    entrezName: featureInstance.name,
                    name: record.name,
                });
            case 'Factor':
                return normalizeFactorVariant(record);
            case 'Fusion':
                return normalizeFusionVariant(record);
            default:
                throw new NotImplementedError(
                    `unable to process variant's feature of type ${featureType}`,
                );
        }
    } catch (err) {
        logger.error(`unable to normalize the variant (id=${record.id}, name=${record.name})`);
        throw err;
    }
};


/**
 * Get reference records for the new variant.
 * Upload if needed (only if gene; signatures needs to be creates using the ontology loader)
 *
 * @param {ApiConnection} conn the connection to GraphKB
 * @param {Object} normalizedVariant the normalized variant record
 */
const uploadReferences = async (conn, normalizedVariant) => {
    const { reference1: r1, reference2: r2 } = normalizedVariant;

    // r2 can be undefined, r1 cannot
    if (!r1) {
        // Shouldn't happen; means there is an error in the normalization code
        throw new Error('reference1 is mandatory on normalizedVariant');
    }

    // Signature (from civic Factor) as reference
    if (r1.class === 'Signature') {
        try {
            return [await conn.getUniqueRecordBy({
                filters: { name: r1.name },
                neighbors: 0,
                target: r1.class,
            })];
        } catch (err) {
            throw new Error(`failed to fetch variant's ${r1.class} Reference ${r1.name}`);
        }
    }

    // Gene(s) as reference(s)
    const references = [];

    for (const ref of [r1, r2]) {
        if (ref) {
            let reference;

            try {
                if (ref.sourceId) {
                    [reference] = await _entrezGene.fetchAndLoadByIds(conn, [ref.sourceId]);
                }
                if (!ref.sourceId && ref.name) {
                    [reference] = await _entrezGene.fetchAndLoadBySymbol(conn, ref.name);
                }
                if (!ref.sourceId && !ref.name) {
                    // Shouldn't happen; means there is an error in the normalization code
                    throw new Error('name property is mandatory on normalizedVariant reference');
                }
                references.push(reference);
            } catch (err) {
                logger.error(`failed to fetch variant's feature: ${ref.name}`);
                throw err;
            }
        }
    }
    return references;
};


/**
 * Get or create inferred/inferring variant(s) and create linking Infers edge(s)
 *
 * @param {ApiConnection} conn the connection to GraphKB
 * @param {Object} normalizedVariant the normalized variant record
 * @param {Object} result the GraphKB variant record to connect edges from/to
 * @returns {object[]}
 */
const uploadInferences = async (conn, normalizedVariant, result) => {
    const links = { inferredBy: [], infers: [] };
    const variants = { inferred: [], inferring: [] };

    // Outgoing, if any
    for (const variant of normalizedVariant.infers || []) {
        try {
            // Creates or get the variant on the incomming side
            const infers = await uploadVariant(conn, variant);
            variants.inferred.push(infers);

            // Creates the edge
            links.infers.push(
                await conn.addRecord({
                    content: { in: rid(infers), out: rid(result) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'Infers',
                }),
            );
        } catch (err) {
            // Non-blocking error
            logger.warn(`Error while uploading inferred variant; ${JSON.stringify(variant)}`);
        }
    }

    // Incomming, if any
    for (const variant of normalizedVariant.inferredBy || []) {
        try {
            // Creates or get the variant on the outgoing side
            const inferredBy = await uploadVariant(conn, variant);
            variants.inferring.push(inferredBy);

            // Creates the edge
            links.inferredBy.push(
                await conn.addRecord({
                    content: { in: rid(result), out: rid(inferredBy) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'Infers',
                }),
            );
        } catch (err) {
            // Non-blocking error
            logger.warn(`Error while uploading inferring variant; ${JSON.stringify(variant)}`);
        }
    }

    // Return for testing purpose only
    return { links, variants };
};


/**
 * Given a normalized CIViC variant record, upload to GraphKB,
 * create any given links and return the GraphKB variant record.
 *
 * @param {ApiConnection} conn the connection to GraphKB
 * @param {Object} normalizedVariant the normalized variant record
 * @returns {object[]}
 */
const uploadVariant = async (conn, normalizedVariant) => {
    let uploadedVariant;

    // RSID Variant exception handled first
    if (!normalizedVariant.positional && /^\s*rs\d+\s*$/gi.exec(normalizedVariant.type)) {
        // Create Variant VERTEX in GraphKB
        [uploadedVariant] = await _snp.fetchAndLoadByIds(conn, [normalizedVariant.type]);

        if (uploadedVariant) {
            // Create Inferring/inferred variant and Infers edge in GraphKB
            if (normalizedVariant.infers || normalizedVariant.inferredBy) {
                await uploadInferences(conn, normalizedVariant, uploadedVariant);
            }
        } else {
            throw new Error(`unable to fetch variant by RSID (${normalizedVariant.type})`);
        }
        return uploadedVariant;
    }

    // Variant content
    let content = {};

    if (normalizedVariant.positional) {
        content = parseVariant(normalizedVariant.variant, false).toJSON();
    }

    // Variant type
    let variantType;

    try {
        // try to fetch civic specific term first
        variantType = await conn.getVocabularyTerm(
            normalizedVariant.type || content.type,
            SOURCE_DEFN.name,
        );
    } catch (err) {
        // try to fetch term from any source
        variantType = await conn.getVocabularyTerm(normalizedVariant.type || content.type);
    }
    content.type = rid(variantType);

    // Variant references
    const [reference1, reference2] = await uploadReferences(conn, normalizedVariant);
    content.reference1 = rid(reference1);

    if (reference2) {
        content.reference2 = rid(reference2);
    }

    // Create Variant VERTEX in GraphKB
    uploadedVariant = await conn.addVariant({
        content,
        existsOk: true,
        target: normalizedVariant.positional
            ? 'PositionalVariant'
            : 'CategoryVariant',
    });

    // Create Inferring/inferred variant and Infers edge in GraphKB
    if (normalizedVariant.infers || normalizedVariant.inferredBy) {
        await uploadInferences(conn, normalizedVariant, uploadedVariant);
    }

    return uploadedVariant;
};


/**
 * Upload an array of normalized CIViC variants to GraphKB.
 * Returns an array of corresponding GraphKB Variant record(s).
 *
 * @param {ApiConnection} conn the connection to GraphKB
 * @param {Object[]} normalizedVariants an array of normalized CIViC variant records
 * @returns {object[]}
 */
const uploadVariants = async (conn, normalizedVariants) => {
    const uploadedVariants = [];

    for (const normalizedVariant of normalizedVariants) {
        // console.log(JSON.stringify(normalizedVariant));

        // Trying cache first
        const key = JSON.stringify(normalizedVariant);
        const fromCache = VARIANT_CACHE.get(key);

        if (fromCache) {
            if (fromCache.err) {
                throw new Error('Variant record previously processed with errors');
            }
            if (fromCache.uploaded) {
                uploadedVariants.push(fromCache.uploaded);
                continue;
            }
        }

        // Uploading
        try {
            const uploaded = await uploadVariant(conn, normalizedVariant);
            uploadedVariants.push(uploaded);
            VARIANT_CACHE.set(key, { uploaded });
        } catch (err) {
            VARIANT_CACHE.set(key, { err });
            logger.error(`failed to upload variant ${JSON.stringify(normalizedVariant)}`);
            throw err;
        }
    }

    // console.log({uploadedVariants: uploadedVariants[0]['@rid']});
    return uploadedVariants;
};


module.exports = {
    NotImplementedError,
    compareGeneNames,
    normalizeFactorVariant,
    normalizeFusionVariant,
    normalizeGeneVariant,
    normalizeVariant,
    uploadInferences,
    uploadReferences,
    uploadVariant,
    uploadVariants,
};
