const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const SPECS = require('./specs.json');
const { parseFusion } = require('./variants');
const { logger } = require('../logging');

// FIXES
const CATALOGUE_VARIANT = new Set([
    'ar-v567es', // AR-V567es
    'egfr-viv', // EGFR-vIV   ?? malformed?
    'egfr-vii', // EGFR-VII
    'egfr-viii', // EGFR-VIII
    'egfr-vix', // EGFR-IX
    'DNMT3B-DNMT3B7', // ?
]);
const DISCARDED_PROTEIN_CHANGE = new Map([
    // ['762_823ins {excluding A763_Y764insFQEA}', 'Ambiguous insertion'],
    ['1_2772trunc', 'Positions seems incorrects; will fallback to the variant description instead'],
]);
const DISCARDED_VARIANT = new Map([
    ['Exon 20 in-frame insertions (excluding A763_Y764insFQEA)', 'Ambiguous insertion'],
    ['c.651+30ins111', 'Ambiguous insertion'],
]);
const HARDCODED_DISEASE = new Map([
    [
        'all liquid tumors',
        'liquid tumor',
    ],
    [
        'all solid tumors (excluding bladder cancer)',
        'all solid tumors', // Needs revision
    ],
    [
        'all solid tumors (excluding cholangiocarcinoma, bladder cancer)',
        'all solid tumors', // Needs revision
    ],
    [
        'all solid tumors (excluding colorectal cancer)',
        'all solid tumors', // Needs revision
    ],
    [
        'diffuse glioma (excluding diffuse astrocytoma, myb- or mybl1-altered, astrocytoma, idh-mutant, glioma, nos, oligodendroglioma, idh-mutant, and 1p/19q-codeleted, diffuse midline glioma, h3 k27-altered)',
        'diffuse glioma', // Needs revision
    ],
    [
        'esophagogastric cancer',
        'esophagogastric adenocarcinoma', // Needs revision
    ],
    [
        'hepatobiliary cancer',
        'malignant hepatobiliary neoplasm',
    ],
    [
        'myeloproliferative neoplasms',
        'myeloproliferative neoplasm',
    ],
    [
        'non-small cell lung cancer (excluding lung squamous cell carcinoma)',
        'non-small cell lung cancer', // Needs revision
    ],
    [
        'oligodendroglioma, idh-mutant, and 1p/19q-codeleted',
        'oligodendroglioma, idh-mutant and 1p/19q-codeleted',
    ],
    [
        'ovarian/fallopian tube cancer',
        'ovary/fallopian tube', // Need to test from my side
    ],
    [
        'pediatric-type diffuse high-grade glioma (excluding diffuse hemispheric glioma, h3 g34-mutant, infant-type hemispheric glioma, diffuse pediatric-type high-grade glioma, h3-wildtype and idh-wildtype)',
        'diffuse high-grade glioma in childhood, h3-wildtype', // Needs revision
    ],
    [
        'primary dlbcl of the central nervous system',
        'primary diffuse large b-cell lymphoma of the central nervous system',
    ],
]);
const HARDCODED_GENE = new Map([
    ['CHOP', 'DDIT3'],
    ['MOZ', 'KAT6A'],
    ['TEL', 'ETV6'],
    ['TIF2', 'NCOA2'],
    ['FIG', 'GOPC'], // ...chose GOPC over DEPP1 because the later is not on same chr.
    ['SIL', 'STIL'], // ...chose STIL over PMEL because the later is not on same chr.
]);
const HARDCODED_PROTEIN_CHANGE = new Map([
    // extra whitespace:
    ['HNRNPA2B1- NTRK3 Fusion', 'HNRNPA2B1-NTRK3 Fusion'],
    ['D569 _Y580del', 'D569_Y580del'],
    // insertion coord. as a range:
    ['A763insLQEA', 'A763_764insLQEA'],
    ['H773insLGNP', 'H773_774insLGNP'],
    ['L135insALELGN', 'L135_136insALELGN'],
    ['T15insVR', 'T15_16insVR'],
    ['T574insTQLPYD', 'T574_575insTQLPYD'],
    ['T599insTT', 'T599_T600insTT'],
    ['T76insTLDT', 'T76_77insTLDT'],
    // truncating frameshift:
    ['L1750Afs25', 'L1750Afs*25'],
    ['S318fsX300', 'S318fs*300'],
]);
const HARDCODED_VARIANT = new Map([
    ['HNRNPA2B1- NTRK3 Fusion', 'HNRNPA2B1-NTRK3 Fusion'], // extra whitespace
    ['exon 1-7 inversion', 'e.1_7inv'],
]);

// FIXES REGEX
const EXCLUSIONS_REGEX = /^(.+?)\s+[{(](excluding[^})]+)[})]$/i;
const GENE_WITH_ALIAS_REGEX = /^(\S+)\s+\(/;


/**
 * Given  dirpath to the OncoKB input files,
 * validates content and returns the parsed data.
 *
 * @param {string} dirpath the directory path of the OncoKB input files
 * @param {object} [specs=SPECS] the OocoKB files specifications
 * @returns {object} data object; { actionable: [{}, ...], annotated: [{}, ...] }
 */
const parseAndValidateData = (dirpath, specs = SPECS) => {
    logger.info('\nSPEC VALIDDATION:');
    const data = {};
    const ajv = new Ajv();

    for (const [type, input] of Object.entries(specs)) {
        if (!fs.existsSync(path.join(dirpath, input.filename))) {
            throw new Error(`Expected input file (${input.filename}) does not exist in directory ${dirpath}`);
        }

        data[type] = JSON.parse(
            fs.readFileSync(
                path.join(dirpath, input.filename),
                { encoding: 'utf8' },
            ),
        );

        if (input.spec) {
            // validating the whole files at once instead of record by record
            if (!ajv.compile(input.spec)(data[type])) {
                throw new Error(`Input file ${input.filename} do not conforms to specifications`);
            } else {
                logger.info(`Input file ${input.filename}`);
            }
        }
    }

    return data;
};

/**
 * Given a dirpath to the OncoKB input files:
 * - validates and parses data
 * - fixes known malformed values (actionable & annotated records only)
 *
 * Adds 2 new properties to actionable & annotated records:
 * - _original: deep copied original data (before any fix)
 * - _comments: logging messages
 *
 * @param {string} dirpath the directory path of the OncoKB input files
 * @returns {object} data object; { actionable: [{}, ...], annotated: [{}, ...] }
 */
const getDataAndApplyFixes = (dirpath) => {
    logger.info('\n\n** INPUT FILES **');

    // SPECIFICATIONS
    const data = parseAndValidateData(dirpath);

    // FIXES
    logger.info('\nDATA FIXES:');

    for (const type of ['actionable', 'annotated']) {
        for (const [i, r] of data[type].entries()) {
            // Preserving original data and tracking fixes
            data[type][i]._original = JSON.parse(JSON.stringify(data[type][i]));
            data[type][i]._comments = '';

            // GENES
            // Negative entrezGeneId other than -2 (other biomarkers); e.g. -1029 (in v7.2)
            if (r.entrezGeneId < 0 && r.entrezGeneId !== -2) {
                const fix = Math.abs(r.entrezGeneId);
                const msg = `Fixed malformed negative entrezGeneId (${r.entrezGeneId} to ${fix})`;
                data[type][i].entrezGeneId = fix;
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }
            // Gene with alias info in parenthesis; e.g. 'CDKN2A (p14)' (in v7.2)
            // NECESSARY ??
            if (GENE_WITH_ALIAS_REGEX.exec(r.gene)) {
                const fix = r.gene.match(GENE_WITH_ALIAS_REGEX)[1];
                const msg = `Fixed malformed gene notation (${r.gene} to ${fix})`;
                data[type][i].gene = fix;
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }

            // GENES IN FUSION BIOMARKERS
            const fusion = parseFusion(r, false);

            if (fusion) {
                if (fusion.reference2) {
                    const ref1 = HARDCODED_GENE.has(fusion.reference1)
                        ? HARDCODED_GENE.get(fusion.reference1)
                        : fusion.reference1;
                    const ref2 = HARDCODED_GENE.has(fusion.reference2)
                        ? HARDCODED_GENE.get(fusion.reference2)
                        : fusion.reference2;
                    const fix = `${ref1}-${ref2} Fusion`;

                    if (r.variant !== fix) {
                        if (r.variant === r.proteinChange) {
                            data[type][i].proteinChange = fix;
                        }
                        const msg = `Fixed deprecated gene notation in fusion variant (${r.variant} to ${fix})`;
                        data[type][i].variant = fix;
                        data[type][i]._comments += `${msg}\n`;
                        logger.warn(msg);
                    }
                }
            }

            // BIOMARKERS
            // Discarded Alu element
            if (/^c\..*alu$/i.test(r.variant)) {
                const msg = `Discarding variant (${r.variant}): Ambiguous Alu element`;
                data[type][i].variant = null;
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }
            // Hardcoded discarded cases
            if (DISCARDED_VARIANT.has(r.variant)) {
                const msg = `Discarding variant (${r.variant}): ${DISCARDED_VARIANT.get(r.variant)}`;
                data[type][i].variant = null;
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }
            if (DISCARDED_PROTEIN_CHANGE.has(r.proteinChange)) {
                const msg = `Discarding proteinChange (${r.proteinChange}): ${DISCARDED_PROTEIN_CHANGE.get(r.proteinChange)}`;
                data[type][i].proteinChange = null;
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }
            // Hardcoded proteinChange fixes
            if (HARDCODED_PROTEIN_CHANGE.has(r.proteinChange)) {
                const fix = HARDCODED_PROTEIN_CHANGE.get(r.proteinChange);
                const msg = `Fixed malformed proteinChange notation (${r.proteinChange} to ${fix})`;
                data[type][i].proteinChange = fix;
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }
            // Hardcoded variant fixes
            if (HARDCODED_VARIANT.has(r.variant)) {
                const fix = HARDCODED_VARIANT.get(r.variant);
                const msg = `Fixed malformed variant notation (${r.variant} to ${fix})`;
                data[type][i].variant = fix;
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }
            // One specific case involving both variant and proteinChange props (v7.2)
            if (r.proteinChange === 'c465C>T' && r.variant === 'Single Nucleotide Polymorphism') {
                const fix = 'c.465C>T';
                const msg = `Fixed malformed notation (${r.proteinChange} to ${fix}), from proteinChange to variant`;
                data[type][i].proteinChange = null;
                data[type][i].variant = fix; // from proteinChange, with edit
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }
            // Not supporting catalogue variant yet
            if (CATALOGUE_VARIANT.has(`${r.gene}-${r.variant}`.toLowerCase())) {
                const msg = `Not supporting catalogue variant yet (${r.gene}-${r.variant})`;
                data[type][i].variant = null;
                data[type][i].proteinChange = null;
                data[type][i]._comments += `${msg}\n`;
                logger.warn(msg);
            }

            // Exclusions
            for (const prop of ['variant', 'proteinChange']) {
                if (EXCLUSIONS_REGEX.exec(r[prop])) {
                    const [, category, exclusions] = r[prop].match(EXCLUSIONS_REGEX);
                    const msg = `Discarded exclusions '${exclusions}' on ${r.setting} ${r.gene} ${r[prop]} (${prop})`;
                    data[type][i][prop] = category;
                    data[type][i]._comments += `${msg}\n`;
                    logger.warn(msg);
                }
            }

            // Pathogenic Variants as Germline Oncogenic Mutations. KBDEV-1561
            // (needs to come after the exclusions fixes)
            if (r.variant === 'Pathogenic Variants') {
                const fix = 'Oncogenic Mutations';
                const msg = `Changing variant notation ${r.variant} to ${fix}`;
                data[type][i].variant = fix;
                data[type][i]._comments += `${msg}\n`;
                logger.info(msg); // info!
            }

            // DISEASES
            if (type === 'actionable') {
                // Silent fixes
                data[type][i].cancerType = r.cancerType
                    .replace(/\s+/g, ' ') // removes extra whitespaces
                    .toLowerCase()
                    .trim();

                // Hardcoded disease fixes
                if (HARDCODED_DISEASE.has(data[type][i].cancerType)) {
                    const fix = HARDCODED_DISEASE.get(data[type][i].cancerType);
                    const msg = `Fixed disease notation from ${r.cancerType} to ${fix}`;
                    data[type][i].cancerType = fix;
                    data[type][i]._comments += `${msg}\n`;
                    logger.warn(msg);
                }
            }
        }
    }

    return data;
};

module.exports = {
    CATALOGUE_VARIANT,
    DISCARDED_PROTEIN_CHANGE,
    DISCARDED_VARIANT,
    EXCLUSIONS_REGEX,
    GENE_WITH_ALIAS_REGEX,
    HARDCODED_DISEASE,
    HARDCODED_GENE,
    HARDCODED_PROTEIN_CHANGE,
    HARDCODED_VARIANT,
    getDataAndApplyFixes,
    parseAndValidateData,
};
