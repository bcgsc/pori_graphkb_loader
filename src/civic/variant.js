const kbParser = require('@bcgsc-pori/graphkb-parser');
const { rid } = require('../graphkb');
const _entrezGene = require('../entrez/gene');
const _snp = require('../entrez/snp');
const { civic: SOURCE_DEFN } = require('../sources');

//const { error: { ErrorMixin, ParsingError } } = kbParser;
const { ParsingError, ErrorMixin, InputValidationError } = kbParser;
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
 * Given a CIViC Variant record entrez information and name,
 * normalize into a set of graphkb-style variants
 *
 * @param {object} param0
 * @param {string} param0.name
 * @param {string} param0.entrezId
 * @param {string} param0.entrezName
 * @returns {object}
 */
const normalizeVariantRecord = ({
    name: rawName, entrezId, entrezName: rawEntrezName,
}) => {
    const entrezName = rawEntrezName.toLowerCase().trim();
    let name = SUBS[rawName] || rawName;
    const joiner = ' and ';
    name = name.replace(' + ', joiner);
    name = name.replace('; ', joiner).toLowerCase().trim();

    if (name.includes(' / ')) {
        throw new ParsingError(`/ has ambiguous meaning in CIVIC, cannot process variant (${name})`);
    }
    if (name.includes(joiner)) {
        const result = [];
        name.split(joiner).forEach((n) => {
            result.push(...normalizeVariantRecord({ entrezId, entrezName, name: n.trim() }));
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
                    ...normalizeVariantRecord({ entrezId, entrezName, name: `${gene1}-${gene2}` }),
                    ...normalizeVariantRecord({ entrezId, entrezName, name: tail }),
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
        result.push(...normalizeVariantRecord({ entrezId, entrezName, name: fusion }));
        result.push(...normalizeVariantRecord({ entrezId, entrezName, name: resistanceMutation }));
        return result;
    } if (match = /^(.*)\s+mutations?$/.exec(name)) {
        const [, gene] = match;

        if (compareGeneNames(gene, entrezName)) {
            return [{ reference1: { ...referenceGene }, type: 'mutation' }];
        }
    }

    // try parser fallback for notation that is close to correct
    try {
        kbParser.variant.parse(name, false);
        return [{ positional: true, reference1: { ...referenceGene }, variant: name }];
    } catch (err) {
        try {
            kbParser.variant.parse(`p.${name}`, false);
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
 * Given some normalized variant record from CIViC,
 * load into graphkb, create links and return the record
 *
 * @param {ApiConnection} conn the connection to GraphKB
 * @param {Object} normalizedVariant the normalized variant record
 * @param {Object} feature the gene feature already grabbed from GraphKB
 * @returns {object[]}
 */
const uploadNormalizedVariant = async (conn, normalizedVariant, feature) => {
    let result;

    if (!normalizedVariant.positional && /^\s*rs\d+\s*$/gi.exec(normalizedVariant.type)) {
        const [rsVariant] = await _snp.fetchAndLoadByIds(conn, [normalizedVariant.type]);

        if (rsVariant) {
            result = rsVariant;
        } else {
            throw new Error(`unable to fetch variant by RSID (${normalizedVariant.type})`);
        }
    } else {
        let content = {};

        if (normalizedVariant.positional) {
            content = kbParser.variant.parse(normalizedVariant.variant, false).toJSON();
        }
        let variantType;

        // try to fetch civic specific term first
        try {
            variantType = await conn.getVocabularyTerm(
                normalizedVariant.type || content.type,
                SOURCE_DEFN.name,
            );
        } catch (err) {
            variantType = await conn.getVocabularyTerm(normalizedVariant.type || content.type);
        }
        content.type = rid(variantType);

        // get the reference elements
        let reference2,
            reference1 = feature;

        if (normalizedVariant.reference2) {
            if (normalizedVariant.reference2.sourceId === feature.sourceId) {
                reference2 = feature;
                // fetch reference1
                [reference1] = await _entrezGene.fetchAndLoadBySymbol(conn, normalizedVariant.reference1.name);

                if (!reference1) {
                    throw new Error(`Gene name not found in NCBI's Entrez gene database (${normalizedVariant.reference1.name}})`);
                }
            } else if (normalizedVariant.reference1.sourceId !== feature.sourceId) {
                throw new ParsingError(`Feature ID input (${feature.sourceId}) does not match the linked gene IDs (${normalizedVariant.reference1.sourceId},${normalizedVariant.reference2.sourceId})`);
            } else {
                // fetch reference2
                [reference2] = await _entrezGene.fetchAndLoadBySymbol(conn, normalizedVariant.reference2.name);
            }
        }

        content.reference1 = rid(reference1);

        if (reference2) {
            content.reference2 = rid(reference2);
        }
        result = await conn.addVariant({
            content,
            existsOk: true,
            target: normalizedVariant.positional
                ? 'PositionalVariant'
                : 'CategoryVariant',
        });
    }

    // now create any links
    for (const variant of normalizedVariant.infers || []) {
        const infers = await uploadNormalizedVariant(conn, variant, feature);
        await conn.addRecord({
            content: { in: rid(infers), out: rid(result) },
            existsOk: true,
            fetchExisting: false,
            target: 'Infers',
        });
    }

    for (const variant of normalizedVariant.inferredBy || []) {
        const inferredBy = await uploadNormalizedVariant(conn, variant, feature);
        await conn.addRecord({
            content: { in: rid(result), out: rid(inferredBy) },
            existsOk: true,
            fetchExisting: false,
            target: 'Infers',
        });
    }

    return result;
};

/**
 * Given some variant record and a feature, process the variant and return a GraphKB equivalent
 *
 * @param {ApiConnection} conn the connection to GraphKB
 * @param {Object} civicVariantRecord the raw variant record from CIViC
 * @param {Object} feature the gene feature already grabbed from GraphKB
 * @returns {object[]}
 */
const processVariantRecord = async (conn, civicVariantRecord, feature) => {
    const { feature: { featureInstance } } = civicVariantRecord;
    let entrezId,
        entrezName;

    // featureInstance
    if (featureInstance.__typename === 'Gene') {
        entrezId = featureInstance.entrezId;
        entrezName = featureInstance.name;
    } else if (featureInstance.__typename === 'Factor') {
        // TODO: Deal with __typename === 'Factor'
        // No actual case as April 22nd, 2024
        throw new NotImplementedError(
            'unable to process variant\'s feature of type Factor',
        );
    }

    // Raw variant from CIViC to normalize & upload to GraphKB if needed
    const rawVariant = {
        entrezId,
        entrezName,
        name: civicVariantRecord.name,
    };

    // Trying cache first
    const fromCache = VARIANT_CACHE.get(JSON.stringify(rawVariant));

    if (fromCache) {
        if (fromCache.err) {
            throw new Error('Variant record previously processed with errors');
        }
        if (fromCache.result) {
            return fromCache.result;
        }
    }

    const result = [];

    try {
        // Normalizing
        const variants = normalizeVariantRecord(rawVariant);

        // Uploading
        for (const normalizedVariant of variants) {
            result.push(await uploadNormalizedVariant(conn, normalizedVariant, feature));
        }
    } catch (err) {
        VARIANT_CACHE.set(JSON.stringify(rawVariant), { err });
    }

    VARIANT_CACHE.set(JSON.stringify(rawVariant), { result });
    return result;
};

module.exports = {
    compareGeneNames,
    normalizeVariantRecord,
    processVariantRecord,
    uploadNormalizedVariant,
};
