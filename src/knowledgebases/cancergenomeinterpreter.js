const fs = require('fs');

const kbParser = require('@bcgsc/knowledgebase-parser');

const {
    loadDelimToJson,
    convertRowFields,
    hashRecordToId,
} = require('./../util');
const {
    orderPreferredOntologyTerms, rid,
} = require('./../graphkb');
const { logger } = require('./../logging');
const _trials = require('./../clinicaltrialsgov');
const _pubmed = require('./../entrez/pubmed');
const _gene = require('./../entrez/gene');
const { uploadFromJSON } = require('./../ontology');

const { cgi: SOURCE_DEFN } = require('./../sources');

const HEADER = {
    alteration: 'Alteration',
    biomarker: 'Biomarker',
    cds: 'cDNA',
    disease: 'Primary Tumor type full name',
    drug: 'Drug',
    drugFamily: 'Drug family',
    evidence: 'Source',
    evidenceLevel: 'Evidence level',
    gene: 'Gene',
    genomic: 'gDNA',
    protein: 'individual_mutation',
    relevance: 'Association',
    reviewData: 'Curation date',
    reviewer: 'Curator',
    transcript: 'transcript',
    variantClass: 'Alteration type',
};

const evidenceLevels = {
    class: 'EvidenceLevel',
    defaultNameToSourceId: true,
    records: {
        'CPIC guidelines': {},
        'Case report': {},
        'Early trials': {},
        'European LeukemiaNet guidelines': {},
        'FDA guidelines': {},
        'Late trials': {},
        'NCCN guidelines': {},
        'NCCN/CAP guidelines': {},
        'Pre-clinical': {},
    },
    source: SOURCE_DEFN,
};

const relevanceMapping = {
    'no responsive': 'no response',
    resistant: 'resistance',
    responsive: 'response',
};

const diseaseMapping = {
    'Any cancer type': 'cancer',
};


const parseCategoryVariant = (row) => {
    const type = row.biomarker
        .slice(row.gene.length)
        .trim()
        .replace('undexpression', 'underexpression'); // fix typo
    const result = { gene: row.gene, type };

    if (row.variantClass === 'CNA') {
        if (type === 'deletion') {
            return { ...result, type: 'copy loss' };
        }
        return result;
    }
    return result;
};


const parseEvidence = (row) => {
    const evidence = [];

    for (const item of row.evidence.split(';').map(i => i.trim())) {
        if (item.startsWith('PMID:')) {
            evidence.push(item.slice('PMID:'.length));
        } else if (/^NCT\d+$/.exec(item)) {
            evidence.push(item);
        } else if (item.startsWith('FDA') || item.startsWith('NCCN')) {
            evidence.push('other');
        } else {
            throw new Error(`cannot process non-pubmed/nct evidence ${item}`);
        }
    }
    return evidence;
};


const parseTherapy = (row) => {
    let { drug } = row;

    if (drug === '[]' || !drug) {
        drug = row.drugFamily;
    }
    return drug.replace(/^\[/, '').replace(/\]$/, '');
};


/**
 * Process variants into a list to deal with concomittent variants
 * format each variant like the original row to re-use the processor
 */
const preprocessVariants = (row) => {
    const { biomarker, variantClass, protein } = row;

    if (biomarker.split('+').length > 2) {
        throw new Error('Missing logic to process variant combinations of 3 or more');
    }
    if (protein.trim()) {
        return [[{
            ...row,
            protein: protein.replace(':', ':p.'),
        }]];
    }

    const combinations = [];

    for (const variant of biomarker.split(/\s*\+\s*/)) {
        let match;
        const variants = [];

        if (match = /^(\w+) \(([A-Z0-9*,;]+)\)$/.exec(variant)) {
            const [, gene, tail] = match;

            for (const singleProtein of tail.split(/[,;]/)) {
                let hgvsp = `p.${singleProtein}`;

                if (match = /^([A-Z])?(\d+)$/.exec(singleProtein)) {
                    const [, refAA, pos] = match;
                    hgvsp = `p.${refAA || '?'}${pos}${variantClass.toLowerCase()}`;
                } else if (match = /^(\d+)-(\d+)$/.exec(tail)) {
                    const [, start, end] = match;
                    hgvsp = `p.(?${start}_?${end})${variantClass.toLowerCase()}`;
                }
                variants.push({ gene, protein: `${gene}:${hgvsp}` });
            }
        } else if (match = /^(\w+)\s+(.*)$/.exec(variant)) {
            const [, gene, tail] = match;

            if (match = /^exon (\d+) (insertion|deletion)s?$/.exec(tail)) {
                const [, pos, type] = match;
                variants.push({ exonic: `e.${pos}${type.slice(0, 3)}`, gene });
            } else {
                variants.push(parseCategoryVariant({ biomarker, gene }));
            }
        } else {
            throw new Error(`unable to process variant (${variant})`);
        }
        combinations.push(variants);
    }

    const result = [];

    if (combinations.length > 1) {
    // all combinations with 1 from each level
        for (let i = 0; i < combinations[0].length; i++) {
            for (let j = 0; j < combinations[1].length; j++) {
                result.push([combinations[0][i], combinations[1][j]]);
            }
        }
    } else {
        result.push(...combinations[0].map(v => [v]));
    }
    return result;
};

/**
 * parse and add the variant records
 * returns the variant to be linked to the statement (protein > cds > category)
 */
const processVariants = async ({ conn, row, source }) => {
    const {
        genomic, protein, transcript, cds, type: variantType, gene, exonic,
    } = row;
    let proteinVariant,
        cdsVariant,
        categoryVariant,
        genomicVariant,
        exonicVariant,
        geneRecord;

    try {
        [geneRecord] = await _gene.fetchAndLoadBySymbol(conn, gene);
    } catch (err) {
        logger.error(err);
    }

    if (genomic) {
        const parsed = kbParser.variant.parse(genomic).toJSON();
        const reference1 = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { biotype: 'chromosome' },
                    {
                        OR: [
                            { sourceId: parsed.reference1 },
                            { name: parsed.reference1 },
                        ],
                    },
                ],
            },
            sort: orderPreferredOntologyTerms,
            target: 'Feature',
        });
        const type = await conn.getVocabularyTerm(parsed.type);
        genomicVariant = await conn.addVariant({
            content: { ...parsed, reference1, type },
            existsOk: true,
            target: 'PositionalVariant',
        });
    }

    if (protein) {
        const parsed = kbParser.variant.parse(`${gene}:${protein.split(':')[1]}`).toJSON();
        const type = await conn.getVocabularyTerm(parsed.type);
        proteinVariant = await conn.addVariant({
            content: { ...parsed, reference1: rid(geneRecord), type },
            existsOk: true,
            target: 'PositionalVariant',
        });
    }
    if (transcript && cds) {
        const parsed = kbParser.variant.parse(`${transcript}:${cds}`).toJSON();
        const reference1 = await conn.getUniqueRecordBy({
            filters: { AND: [{ biotype: 'transcript' }, { sourceId: transcript }, { sourceIdVersion: null }] },
            sort: orderPreferredOntologyTerms,
            target: 'Feature',
        });
        const type = await conn.getVocabularyTerm(parsed.type);
        cdsVariant = await conn.addVariant({
            content: { ...parsed, reference1, type },
            existsOk: true,
            target: 'PositionalVariant',
        });
    }
    if (exonic) {
        const parsed = kbParser.variant.parse(`${gene}:${exonic}`).toJSON();
        const type = await conn.getVocabularyTerm(parsed.type);
        exonicVariant = await conn.addVariant({
            content: { ...parsed, reference1: rid(geneRecord), type },
            existsOk: true,
            target: 'PositionalVariant',
        });
    }

    try {
        const type = rid(await conn.getVocabularyTerm(variantType));
        categoryVariant = await conn.addVariant({
            content: { reference1: rid(geneRecord), type },
            existsOk: true,
            target: 'CategoryVariant',
        });
    } catch (err) {
        // category variant is optional if any of the positional variants are defined
        if (!proteinVariant && !cdsVariant && !genomicVariant) {
            throw err;
        }
    }
    // link the defined variants by infers
    const combinations = [
        // highest level positional infers the vategorical variant
        [exonicVariant || proteinVariant || cdsVariant || genomicVariant, categoryVariant],
        [proteinVariant || cdsVariant || genomicVariant, exonicVariant],
        [cdsVariant || genomicVariant, proteinVariant],
        [genomicVariant, cdsVariant || proteinVariant || exonicVariant],
    ];

    for (const [src, tgt] of combinations) {
        if (src && tgt) {
            await conn.addRecord({
                content: {
                    in: rid(tgt),
                    out: rid(src),
                    source: rid(source),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'Infers',
            });
        }
    }
    return proteinVariant || cdsVariant || genomicVariant || exonicVariant || categoryVariant;
};

const processRow = async ({ row, source, conn }) => {
    // process the protein notation
    // look up the disease by name
    const diseaseName = diseaseMapping[row.disease] || `${row.disease}|${row.disease} cancer`;

    const disease = rid(await conn.getUniqueRecordBy({
        filters: { name: diseaseName },
        sort: orderPreferredOntologyTerms,
        target: 'Disease',
    }));
    const therapyName = row.therapy.includes(';')
        ? row.therapy.split(';').map(n => n.toLowerCase().trim()).sort().join(' + ')
        : row.therapy;
    // look up the drug by name
    const drug = rid(await conn.addTherapyCombination(source, therapyName));
    const variants = await Promise.all(row.variants.map(
        async variant => processVariants({ conn, row: variant, source }),
    ));

    const level = rid(await conn.getUniqueRecordBy({
        filters: { AND: [{ name: row.evidenceLevel }, { source: rid(source) }] },
        target: 'EvidenceLevel',
    }));

    const articles = await _pubmed.fetchAndLoadByIds(
        conn,
        row.evidence.filter(ev => !ev.startsWith('NCT')),
    );
    const trials = await Promise.all(
        row.evidence
            .filter(ev => ev.startsWith('NCT'))
            .map(async evidence => _trials.fetchAndLoadById(conn, evidence)),
    );

    // determine the relevance of the statement
    const relevance = rid(await conn.getVocabularyTerm(
        relevanceMapping[row.relevance.toLowerCase()] || row.relevance,
    ));

    const evidence = [...articles.map(rid), ...trials.map(rid)];

    if (evidence.length === 0) {
        evidence.push(rid(source));
    }

    // create the statement
    await conn.addRecord({
        content: {
            conditions: [...variants.map(rid), disease, drug],
            evidence,
            evidenceLevel: level,
            relevance,
            source: rid(source),
            sourceId: row.sourceId,
            subject: drug,
        },
        existsOk: true,
        fetchExisting: false,
        target: 'Statement',
    });
};


const uploadFile = async ({ conn, filename, errorLogPrefix }) => {
    const rows = await loadDelimToJson(filename);
    logger.info('creating the source record');
    const source = rid(await conn.addRecord({
        content: SOURCE_DEFN,
        existsOk: true,
        target: 'Source',
    }));
    const counts = { error: 0, skip: 0, success: 0 };

    logger.info('creating the evidence levels');
    await uploadFromJSON({ conn, data: evidenceLevels });
    logger.info('preloading the pubmed cache');
    await _pubmed.preLoadCache(conn);
    const errorList = [];

    logger.info(`loading ${rows.length} rows`);

    for (let index = 0; index < rows.length; index++) {
        const rawRow = rows[index];
        const sourceId = hashRecordToId(rawRow);
        logger.info(`processing: ${sourceId} (${index} / ${rows.length})`);
        const row = {
            _raw: rawRow,
            sourceId,
            ...convertRowFields(HEADER, rows[index]),
        };
        row.therapy = parseTherapy(row);

        if (row.evidenceLevel.includes(',')) {
            logger.info(`skipping row #${index} due to multiple evidence levels (${row.evidenceLevel})`);
            counts.skip++;
            continue;
        } if (row.gene.includes(';')) {
            logger.info(`skipping row #${index} due to multiple genes (${row.gene})`);
            counts.skip++;
            continue;
        }

        try {
            row.evidence = parseEvidence(row);
        } catch (err) {
            logger.error(err);
            errorList.push({
                error: err,
                errorMessage: err.toString(),
                index,
                row,
            });
            counts.error++;
            continue;
        }
        let variants;

        try {
            variants = preprocessVariants(row);
        } catch (err) {
            counts.error++;
            logger.error(err);
            continue;
        }

        for (const disease of row.disease.split(';')) {
            for (const combo of variants) {
                try {
                    await processRow({ conn, row: { ...row, disease, variants: combo }, source });
                    counts.success++;
                } catch (err) {
                    errorList.push({
                        error: err,
                        errorMessage: err.toString(),
                        index,
                        row,
                    });
                    logger.error(err);
                    counts.error++;

                    if (err.toString().includes('of undefined')) {
                        throw err;
                    }
                }
            }
        }
    }
    const errorLogFile = `${errorLogPrefix}-cgi.json`;
    logger.info(`writing errors to: ${errorLogFile}`);
    fs.writeFileSync(errorLogFile, JSON.stringify({ records: errorList }, null, 2));
    logger.info(JSON.stringify(counts));
};


module.exports = { SOURCE_DEFN, uploadFile };
