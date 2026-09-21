/**
 * This module map/recode HGVS variants from a given reference to another.
 *
 * Leveraging:
 * 1. Mutalyzer REST API (Mapper & Normalizer); fast for CDS
 * 2. Ensembl REST API (Variant Recoder); overall slow
 *
*/

/* eslint-disable multiline-ternary */
const { parseVariant, stringifyVariant } = require('@bcgsc-pori/graphkb-parser');

const { logger } = require('../logging');
const { requestWithRetry } = require('../util');


const MUTALIZER_BASE_URL = 'https://mutalyzer.nl/api';
const ENSEMBL_BASE_URL = 'https://rest.ensembl.org';
const CHROMOSOME_ACCESSIONS = new Map([
    ['chr1', { grch37: 'NC_000001.10', grch38: 'NC_000001.11' }],
    ['chr2', { grch37: 'NC_000002.11', grch38: 'NC_000002.12' }],
    ['chr3', { grch37: 'NC_000003.11', grch38: 'NC_000003.12' }],
    ['chr4', { grch37: 'NC_000004.11', grch38: 'NC_000004.12' }],
    ['chr5', { grch37: 'NC_000005.9', grch38: 'NC_000005.10' }],
    ['chr6', { grch37: 'NC_000006.11', grch38: 'NC_000006.12' }],
    ['chr7', { grch37: 'NC_000007.13', grch38: 'NC_000007.14' }],
    ['chr8', { grch37: 'NC_000008.10', grch38: 'NC_000008.11' }],
    ['chr9', { grch37: 'NC_000009.11', grch38: 'NC_000009.12' }],
    ['chr10', { grch37: 'NC_000010.10', grch38: 'NC_000010.11' }],
    ['chr11', { grch37: 'NC_000011.9', grch38: 'NC_000011.10' }],
    ['chr12', { grch37: 'NC_000012.11', grch38: 'NC_000012.12' }],
    ['chr13', { grch37: 'NC_000013.10', grch38: 'NC_000013.11' }],
    ['chr14', { grch37: 'NC_000014.8', grch38: 'NC_000014.9' }],
    ['chr15', { grch37: 'NC_000015.9', grch38: 'NC_000015.10' }],
    ['chr16', { grch37: 'NC_000016.9', grch38: 'NC_000016.10' }],
    ['chr17', { grch37: 'NC_000017.10', grch38: 'NC_000017.11' }],
    ['chr18', { grch37: 'NC_000018.9', grch38: 'NC_000018.10' }],
    ['chr19', { grch37: 'NC_000019.10', grch38: 'NC_000019.10' }],
    ['chr20', { grch37: 'NC_000020.10', grch38: 'NC_000020.11' }],
    ['chr21', { grch37: 'NC_000021.8', grch38: 'NC_000021.9' }],
    ['chr22', { grch37: 'NC_000022.10', grch38: 'NC_000022.11' }],
    ['chrx', { grch37: 'NC_000023.10', grch38: 'NC_000023.11' }],
    ['chry', { grch37: 'NC_000024.9', grch38: 'NC_000024.10' }],
    ['chrmt', { grch37: 'NC_012920.1', grch38: 'NC_012920.1' }],
]);


/**
 * Given a variant (hvgs/pmdi/id) and a target reference,
 * leverage the Ensembl Variant Recoder and returns
 * the mapped variant to the target
 *
 * @param {string} hgvs the variant
 * @param {string} ref the targeted reference
 * @param {object} [opt]
 * @param {string} [opt.archive] archive subdomain, if any
 * @param {string} [opt.fields] the requested fields
 * @returns {string|undefined}
 */
const ensemblVariantRecoder = async (hgvs, ref, opt = {}) => {
    logger.info(`Recoding ${hgvs} to ${ref} with the Ensembl Variant Recoder...`);
    const recoded = new Set();

    // Options
    const { archive = '', fields = 'hgvsc,hgvsg,hgvsp', ...rest } = opt;
    const baseUrl = ENSEMBL_BASE_URL.replace(/^(https?:\/\/)/, archive ? `$1${archive}.` : '$1');

    try {
        const resp = await requestWithRetry({
            headers: { Accept: 'application/json' },
            qs: { fields, ...rest }, // remaining opt are also passed as query params
            uri: `${baseUrl}/variant_recoder/human/${encodeURIComponent(hgvs)}`,
        });

        // Extract mapped notations
        for (const r of JSON.parse(resp)) {
            for (const k of Object.values(r)) {
                for (const field of fields.split(',')) {
                    if (Array.isArray(k[field])) {
                        k[field].forEach(v => recoded.add(v));
                    } else if (typeof k[field] === 'string') {
                        recoded.add(k[field]);
                    }
                }
            }
        }
    } catch (err) {
        logger.warn(`Ensembl: error recoding ${hgvs}: ${err}`);
        return undefined;
    }

    // Return only the notation referencing the targeted reference
    const recodedRef = [...recoded].find(s => s.startsWith(ref)) || undefined;

    if (recodedRef) {
        logger.info(`Ensembl: successfully recoded ${hgvs} into ${recodedRef}`);
    } else {
        logger.warn(`Ensembl: cannot find reference ${ref} in the recoding of ${hgvs}`);
    }

    return recodedRef;
};

/**
 * Given a CDS HGVS variant referencing a versioned Ensembl transcript
 * and a target versioned transcript, leverage Mutalizer REST API
 * and returns the mapped variant
 *
 * 2 steps process:
 * - mapping to genomic coordinates on targeted transcript
 * - normalizing to cds notation
 *
 * @param {string} hgvs the variant notation
 * @param {string} ref the target versioned transcript
 * @returns {string|undefined}
 */
const mutalyzerMapper = async (hgvs, ref) => {
    logger.info(`Recoding ${hgvs} to ${ref} with the Mutalizer Mapper...`);
    let genomic;

    // Mutalizer Mapper
    try {
        const resp = await requestWithRetry({
            json: true,
            method: 'GET',
            qs: { description: hgvs, filter_out: true, reference_id: ref },
            uri: `${MUTALIZER_BASE_URL}/map/`,
        }, { waitMilliseconds: 5000 });
        genomic = resp.mapped_description;
    } catch (err) {
        logger.warn(`Mutalizer: error mapping ${hgvs} to reference ${ref}: ${err}`);
    }

    // Mutalizer Normalizer
    if (genomic) {
        try {
            const resp = await requestWithRetry({
                json: true,
                method: 'GET',
                uri: `${MUTALIZER_BASE_URL}/normalize/${encodeURIComponent(genomic)}`,
            }, { waitMilliseconds: 5000 });

            // 
            const equivalent = resp.equivalent_descriptions.c;
            const [cds] = equivalent
                .filter((r) => r.reference.selector.id === ref)
                .map((r) => r.description);

            logger.info(`Mutalizer: successfully recoded ${hgvs} into ${cds}`);
            return cds
        } catch (err) {
            logger.warn(`Mutalizer: error normalizing ${genomic} (from ${hgvs} mapping) to CDS: ${err}`);
        }
    }

    return undefined;
};

/**
 * Check if a given Ensembl transcript stable id will need his variants
 * to be recoded from latest GRCh37 version to latest (current) GRCh38 version.
 * Based on pre-fetched Ensembl isoform versions mapping.
 *
 * For variants described at the transcript level, check if transcript versions are the same.
 * For variants described at the protein level, check if protein versions are the same.
 *
 * @param {object} r the OncoKB variant record
 * @param {object} ensembl the Ensembl isoform versions mapping
 * @param {string|undefined} [level='transcript'] the variant level to evaluate
 * @returns {boolean}
 */
const needRecoding = (r, ensembl, level = 'transcript') => {
    if (r.grch37Isoform !== r.grch38Isoform) {
        // early exit on stable id mismatch
        return true;
    }

    const stableId = r.grch37Isoform;
    const grch37 = ensembl.grch37[stableId];
    const grch38 = ensembl.grch38[stableId];

    if (level === 'transcript') {
        if (grch37.id !== grch38.id) {
            return true;
        }
    }
    if (level === 'protein') {
        if (grch37.proteinId !== grch38.proteinId) {
            return true;
        }
    }
    return false;
};

/**
 * Given an OncoKB variant record and the corresponding parsed variants,
 * returns the recoding of the parsed variants from GRCh37 Ensembl
 * transcript versions to the GRCh38 ones.
 *
 * Recoding:
 * - Cds/protein notations get eval. for recoding need, then a recoding is attempted.
 * - Exonic notations dosen't get recoded.
 * - Genomic (chr) notations only get recoded if there is a successfull cds recoding.
 *
 * @param {object} r the OncoKB variant record object
 * @param {object} parsed the parsed variant object at c/e/g/p levels
 * @param {object} ensembl the Ensembl version mappping object for GRCh37/38
 * @param {boolean} [mutalyzer=false] whether to use Mutalyzer for cds recoding
 * @returns {object} the recoded variant object
 */
const recoder = async (r, parsed, ensembl, mutalyzer = false) => {
    const recoded = {
        c: null,
        e: null,
        g: null,
        p: null,
    };

    // cds
    if (parsed.c && needRecoding(r, ensembl)) {
        const cds = stringifyVariant(parsed.c);
        const hgvs = `${ensembl.grch37[r.grch37Isoform].id}:${cds}`;
        const ref = ensembl.grch38[r.grch38Isoform].id;

        let cdsRecoded;

        // 1. Mutalazer Mapper
        if (mutalyzer) {
            cdsRecoded = await mutalyzerMapper(hgvs, ref);
        }

        // 2. Fallback to Ensembl Vaariant Recoder
        if (!cdsRecoded) {
            cdsRecoded = await ensemblVariantRecoder(hgvs, ref, { fields: 'hgvsc' });
        }

        if (cdsRecoded) {
            try {
                recoded.c = parseVariant(cdsRecoded.split(':')[1], false);
            } catch (err) {
                logger.warn(`Unparsable recoded CDS variant: ${cdsRecoded}. Will fall back to original notation`);
            }
        }
    }

    // exonic & protein
    if ((parsed.e || parsed.p) && needRecoding(r, ensembl, 'protein')) {
        if (parsed.e) {
            const grch37ProteinId = ensembl.grch37[r.grch37Isoform].proteinId;
            const grch38ProteinId = ensembl.grch38[r.grch38Isoform].proteinId;
            logger.warn(`Exonic notations doesn't get recoded (${stringifyVariant(parsed.e)} from ${grch37ProteinId} to ${grch38ProteinId})`);
        }
        if (parsed.p) {
            const protein = stringifyVariant(parsed.p);
            const hgvs = `${ensembl.grch37[r.grch37Isoform].proteinId}:${protein}`;
            const ref = ensembl.grch38[r.grch38Isoform].proteinId;

            // Ensembl Variant Recoder
            const proteinRecoded = await ensemblVariantRecoder(hgvs, ref, { fields: 'hgvsp' });

            if (proteinRecoded) {
                try {
                    recoded.p = parseVariant(proteinRecoded, false);
                } catch (err) {
                    logger.warn(`Unparsable recoded protein variant: ${proteinRecoded}. Will fall back to original notation`);
                }
            }
        }
    }

    // genomic
    if (parsed.g) {
        const chromosome = parsed.g.reference1;
        const ref37 = CHROMOSOME_ACCESSIONS.get(chromosome).grch37;
        const ref = CHROMOSOME_ACCESSIONS.get(chromosome).grch38;

        if (recoded.c) { // needs cds with successfull recoding
            const reference = ensembl.grch38[r.grch38Isoform].id;
            const notation = stringifyVariant(recoded.c);
            const hgvs = `${reference}:${notation}`;

            // Ensembl Variant Recoder
            const genomicRecoded = await ensemblVariantRecoder(hgvs, ref, { fields: 'hgvsg' });

            if (genomicRecoded) {
                try {
                    recoded.g = parseVariant(genomicRecoded, true);
                    recoded.g.reference1 = chromosome; // back to GraphKB-compatible notation
                } catch (err) {
                    logger.warn(`Unparsable recoded genomic variant: ${genomicRecoded}. Will fall back to original notation`);
                }
            }
        } else {
            logger.warn(`Genomic notations without corresponding cds doesn't get recoded (${stringifyVariant(parsed.g)} from ${ref37} to ${ref})`);
        }
    }

    return recoded;
};


module.exports = {
    CHROMOSOME_ACCESSIONS,
    ENSEMBL_BASE_URL,
    MUTALIZER_BASE_URL,
    ensemblVariantRecoder,
    mutalyzerMapper,
    needRecoding,
    recoder,
};
