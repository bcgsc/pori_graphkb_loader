/**
 * @module importer/civic
 */
const request = require('request-promise');
const Ajv = require('ajv');

const kbParser = require('@bcgsc/knowledgebase-parser');

const { checkSpec } = require('../../util');
const {
    rid,
} = require('../../graphkb');
const { logger } = require('../../logging');
const _entrezGene = require('../../entrez/gene');
const _snp = require('../../entrez/snp');

const ajv = new Ajv();

const { civic: SOURCE_DEFN } = require('../../sources');


const BASE_URL = 'https://civicdb.org/api';


const validateVariantSpec = ajv.compile({
    properties: {
        civic_actionability_score: { type: 'number' },
        coordinates: {
            properties: {
                chromosome: { type: ['string', 'null'] },
                chromosome2: { type: ['string', 'null'] },
                ensembl_version: { type: ['number', 'null'] },
                reference_bases: { type: ['string', 'null'] },
                reference_build: { type: ['string', 'null'] },
                representative_transcript: { type: ['string', 'null'] },
                representative_transcript2: { type: ['string', 'null'] },
                start: { type: ['number', 'null'] },
                start2: { type: ['number', 'null'] },
                stop: { type: ['number', 'null'] },
                stop2: { type: ['number', 'null'] },
                variant_bases: { type: ['string', 'null'] },
            },
            type: 'object',
        },
        description: { type: 'string' },
        entrez_id: { type: 'number' },
        entrez_name: { type: 'string' },
        id: { type: 'number' },
        name: { type: 'string' },
        variant_types: {
            items: {
                name: { type: 'string' },
                so_id: { type: 'string' },
                type: 'object',
            },
            type: 'array',
        },
    },
    type: 'object',
});


const getVariantName = (name, variantTypes = []) => {
    const result = name.toLowerCase().trim();

    if ([
        'loss-of-function',
        'gain-of-function',
        'overexpression',
        'expression',
        'amplification',
        'mutation',
    ].includes(result)) {
        return result.replace(/-/g, ' ');
    }

    let match;

    if (match = /^(intron|exon) (\d+)(-(\d+))? (mutation|deletion|frameshift|insertion)$/i.exec(result)) {
        const break2 = match[4]
            ? `_${match[4]}`
            : '';
        const type = match[5] === 'frameshift'
            ? 'fs'
            : match[5].slice(0, 3);
        const prefix = match[1] === 'exon'
            ? 'e'
            : 'i';
        return `${prefix}.${match[2]}${break2}${type}`;
    } if (match = /^([A-Z][^-\s]*)-([A-Z][^-\s]*)/i.exec(result)) {
        return 'fusion';
    } if (match = /^[A-Z][^-\s]* fusions?$/i.exec(result)) {
        return 'fusion';
    } if (match = /^\s*c\.\d+\s*[a-z]\s*>[a-z]\s*$/i.exec(result)) {
        return result.replace(/\s+/g, '');
    } if (match = /^((delete?rious)|promoter)\s+mutation$/.exec(result) || result.includes('domain')) {
        return result;
    } if (result === 'mutation' && variantTypes.length === 1) {
        return variantTypes[0].name.replace(/_/g, ' ');
    } if (match = /^(.*) mutations?$/.exec(result)) {
        return 'mutation';
    } if (match = /^([A-Z]\d+\S+)\s+\((c\..*)\)$/i.exec(result)) {
        if (match[1].includes('?')) {
            return match[2];
        }
        return `p.${match[1]}`;
    } if (match = /^Splicing alteration \((c\..*)\)$/i.exec(result)) {
        return match[1];
    } if (match = /^exon (\d+)–(\d+) deletion$/.exec(result)) {
        const [, start, end] = match;
        return `e.${start}_${end}del`;
    } if (match = /^([a-z]\d+) phosphorylation$/.exec(result)) {
        return `p.${match[1]}phos`;
    } if (result.includes(' fusion ')) {
        return 'fusion';
    }
    return result;
};


const createHgvsVariant = async (conn, feature, variantName) => {
    let match,
        cds;

    if (match = /^(\S+)\s\((c\.\d+\S+)\)$/.exec(variantName) && !/^[cg]\..*/.exec(variantName)) {
        try {
            cds = await createHgvsVariant(conn, feature, match[2]);
            [, variantName] = match;
        } catch (err) {
            logger.error(`${variantName} ${err}`);
        }
    }
    const parsed = kbParser.variant.parse(
        `${/^[cpe]\..*/.exec(variantName)
            ? ''
            : 'p.'}${variantName}`, false,
    ).toJSON();
    const variantClass = await conn.getVocabularyTerm(parsed.type);
    Object.assign(parsed, {
        reference1: rid(feature),
        type: rid(variantClass),
    });

    const variant = await conn.addVariant({
        content: parsed,
        existsOk: true,
        target: 'PositionalVariant',
    });

    if (cds) {
        await conn.addRecord({
            content: { in: rid(variant), out: rid(cds) },
            target: 'Infers',
        });
    }

    return variant;
};


/**
 * @param {ApiConnection} conn connection to GraphKB
 * @param {*} inputFusionName  the variant name from CIVIc
 * @param {*} feature the graphkb gene record linked to this variant in CIVIc (fetched by entrez ID)
 */
const processFusionVariants = async (conn, inputFusionName, feature) => {
    const compareGeneNames = (gene1, gene2) => {
        if (['abl1', 'abl'].includes(gene1) && ['abl1', 'abl'].includes(gene2)) {
            return true;
        } if (gene1 === gene2) {
            return true;
        }
        return false;
    };

    if ((inputFusionName.match(/-/g) || []).length > 1) {
        throw new Error(`multiple hyphens in fusion name (${inputFusionName}). Unable to parse second gene name`);
    }
    const fusionName = inputFusionName.toLowerCase();
    let missingGene,
        reference1,
        reference2,
        mutations;

    try {
        [, reference1,, reference2,, mutations] = /([^-\s]+)(-([^-\s]+))?(\s+fusion)?(\s+[^-\s]+)*$/.exec(fusionName);

        if (mutations) {
            mutations = mutations.trim();
        }
    } catch (err) {
        throw new Error(`Fusion name (${inputFusionName}) does not match the expected pattern`);
    }

    if (compareGeneNames(feature.name, reference1)) {
        reference1 = feature.name;
        missingGene = reference2;
    } else if (reference2 && compareGeneNames(feature.name, reference2)) {
        reference2 = feature.name;
        missingGene = reference1;
    } else if (reference2) {
        throw new Error(`Fusion gene names (${reference1},${reference2}) do not match the linked gene name (${feature.name})`);
    }

    let otherFeature = null;

    if (missingGene) {
        const search = await _entrezGene.fetchAndLoadBySymbol(conn, missingGene);

        if (search.length !== 1) {
            throw new Error(`unable to find specific (${search.length}) gene for symbol (${missingGene})`);
        }
        [otherFeature] = search;
    }
    const fusionType = await conn.getVocabularyTerm('fusion');
    const result = [];


    if (mutations) {
        const exonsMatch = /^[a-z](\d+);[a-z](\d+)$/.exec(mutations);

        if (exonsMatch && otherFeature) {
            const [, exon1, exon2] = exonsMatch;
            const fusion = await conn.addVariant({
                content: {
                    break1Repr: `e.${exon1}`,
                    break1Start: {
                        '@class': 'ExonicPosition',
                        pos: exon1,
                    },
                    break2Repr: `e.${exon2}`,
                    break2Start: {
                        '@class': 'ExonicPosition',
                        pos: exon2,
                    },
                    reference1: compareGeneNames(feature.name, reference1)
                        ? rid(feature)
                        : rid(otherFeature),
                    reference2: compareGeneNames(feature.name, reference1)
                        ? rid(otherFeature)
                        : rid(feature),
                    type: rid(fusionType),
                },
                existsOk: true,
                target: 'PositionalVariant',
            });
            return [fusion];
        }

        for (const mutation of mutations.split(/\s+/g).filter(m => m.trim())) {
            const variant = await processVariantRecord(conn, { name: mutation }, feature);
            result.push(...variant);
        }
    }
    const fusion = await conn.addVariant({
        content: {
            reference1: compareGeneNames(feature.name, reference1)
                ? rid(feature)
                : rid(otherFeature, true),
            reference2: compareGeneNames(feature.name, reference1)
                ? rid(otherFeature, true)
                : rid(feature),
            type: rid(fusionType),
        },
        existsOk: true,
        target: 'CategoryVariant',
    });
    result.push(fusion);

    return result;
};

/**
 * Given some variant record and a feature, process the variant and return a GraphKB equivalent
 */
const processVariantRecord = async (conn, { name, variant_types: variantTypes }, feature) => {
    // get the feature (entrez name appears to be synonymous with hugo symbol)
    const result = [];
    // based on discussion with cam here: https://www.bcgsc.ca/jira/browse/KBDEV-844
    const SUBS = {
        'E746_T751>I': 'E746_T751delinsI',
        'EML4-ALK C1156Y-L1196M': 'EML4-ALK and C1156Y and L1196M',
        'EML4-ALK C1156Y-L1198F': 'EML4-ALK and C1156Y and L1198F',
        'EML4-ALK G1202R-L1196M': 'EML4-ALK and G1202R and L1196M',
        'EML4-ALK G1202R-L1198F': 'EML4-ALK and G1202R and L1198F',
        'EML4-ALK L1196M-L1198F': 'EML4-ALK and L1196M and L1198F',
        'EML4-ALK T1151INST': 'EML4-ALK and T1151_?1152insT',
        K558NP: 'K558delKinsNP',
        T1151insT: 'T1151_?1152insT',
        'V600E AMPLIFICATION': 'V600E and AMPLIFICATION',
        'V600E+V600M': 'V600E and V600M',
        'V600_K601>E': 'V600_K601delVKinsE',
        'del 755-759': '?755_?759del',
        'di842-843vm': 'D842_I843delDIinsVM',
        'g12/g13': '(G12_G13)mut',
        'p26.3-25.3 11mb del': 'y.p26.3_p25.3del',
    };

    const variants = (SUBS[name] || name).replace(' + ', ' and ').split(' and ').map(v => v.trim()).filter(v => v);

    for (const variant of variants) {
        // parse the variant record
        const variantName = getVariantName(variant, variantTypes || []);

        if (/^\s*rs\d+\s*$/gi.exec(variantName)) {
            const [rsVariant] = await _snp.fetchAndLoadByIds(conn, [variantName]);

            if (rsVariant) {
                result.push(rsVariant);
                continue;
            }
        }

        if (variantName === 'fusion' && (/\s+fusion\s+\S+/gi.exec(variant) || variant.includes('-'))) {
            const fusionVariants = await processFusionVariants(conn, variant, feature);
            result.push(...fusionVariants);
            continue;
        }

        try {
            let variantClass;

            // try to fetch civic specific term first
            try {
                variantClass = await conn.getVocabularyTerm(variantName, SOURCE_DEFN.name);
            } catch (err) {
                variantClass = await conn.getVocabularyTerm(variantName);
            }
            const catVariant = await conn.addVariant({
                content: {
                    reference1: rid(feature),
                    type: rid(variantClass),
                },
                existsOk: true,
                target: 'CategoryVariant',
            });
            result.push(catVariant);
        } catch (err) {
            const hgvsVariant = await createHgvsVariant(conn, feature, variant);
            result.push(hgvsVariant);
        }
    }
    return result;
};


/**
 * Dowmloads the variant records that are referenced by the evidence records
 */
const downloadVariantRecords = async () => {
    const varById = {};
    let expectedPages = 1,
        currentPage = 1;
    const urlTemplate = `${BASE_URL}/variants?count=500`;

    while (currentPage <= expectedPages) {
        const url = `${urlTemplate}&page=${currentPage}`;
        logger.info(`loading: ${url}`);
        const resp = await request({
            json: true,
            method: 'GET',
            uri: url,
        });
        expectedPages = resp._meta.total_pages;
        logger.info(`loaded ${resp.records.length} records`);

        for (const record of resp.records) {
            if (varById[record.id] !== undefined) {
                throw new Error('variant record ID is not unique', record);
            }

            try {
                checkSpec(validateVariantSpec, record);
                varById[record.id] = record;
            } catch (err) {
                logger.error(err);
            }
        }
        currentPage++;
    }
    return varById;
};


module.exports = { downloadVariantRecords, getVariantName, validateVariantSpec };
