const fs = require('fs');

const kbParser = require('@bcgsc/knowledgebase-parser');

const {
    loadDelimToJson,
    convertRowFields,
    hashRecordToId
} = require('./util');
const {
    preferredDiseases, preferredFeatures, orderPreferredOntologyTerms, rid
} = require('./graphkb');
const {logger} = require('./logging');
const _trials = require('./clinicaltrialsgov');
const _pubmed = require('./entrez/pubmed');
const _gene = require('./entrez/gene');
const {uploadFromJSON} = require('./ontology');

const SOURCE_DEFN = {
    displayName: 'CGI',
    longName: 'cancer genome interpreter - Cancer Biomarkers database',
    name: 'cancer genome interpreter',
    url: 'https://www.cancergenomeinterpreter.org/biomarkers',
    description: 'The Cancer Biomarkers database is curated and maintained by several clinical and scientific experts in the field of precision oncology supported by the European Union’s Horizon 2020 funded project. This database is currently being integrated with knowledge databases of other institutions in a collaborative effort of the Global Alliance for Genomics and Health. The contribution of the community is encouraged and proposals of edition or comments about the information contained in this database can be given by contacting us here or by using the feedback icon located at the left of each entry of the table. The database follows the data model originally described by Dienstmann et al. This table provides a summary of the content of the database that can be interactively browsed. Additional information, including the genomic coordinates of the variants, can be accessed via the download feature. This database is licensed under a Creative Commons Public Domain Dedication (CC0 1.0 Universal). When referring to this database, please cite: Cancer Genome Interpreter Annotates The Biological And Clinical Relevance Of Tumor Alterations; doi: https://doi.org/10.1101/140475.',
    license: 'https://creativecommons.org/publicdomain/zero/1.0',
    citation: 'https://doi.org/10.1101/140475'
};

const HEADER = {
    alteration: 'Alteration',
    protein: 'individual_mutation',
    transcript: 'transcript',
    cds: 'cDNA',
    genomic: 'gDNA',
    disease: 'Primary Tumor type full name',
    evidence: 'Source',
    evidenceLevel: 'Evidence level',
    gene: 'Gene',
    drug: 'Drug',
    drugFamily: 'Drug family',
    reviewer: 'Curator',
    reviewData: 'Curation date',
    relevance: 'Association',
    biomarker: 'Biomarker',
    variantClass: 'Alteration type'
};

const evidenceLevels = {
    class: 'EvidenceLevel',
    source: SOURCE_DEFN,
    records: {
        'Pre-clinical': {},
        'CPIC guidelines': {},
        'NCCN/CAP guidelines': {},
        'Late trials': {},
        'NCCN guidelines': {},
        'European LeukemiaNet guidelines': {},
        'FDA guidelines': {},
        'Case report': {},
        'Early trials': {}
    },
    defaultNameToSourceId: true
};

const relevanceMapping = {
    resistant: 'resistance',
    responsive: 'response',
    'no responsive': 'no response'
};

const diseaseMapping = {
    'Any cancer type': 'cancer'
};


const parseCategoryVariant = (row) => {
    const type = row.biomarker
        .slice(row.gene.length)
        .trim()
        .replace('undexpression', 'underexpression'); // fix typo
    const result = {gene: row.gene, type};

    if (row.variantClass === 'CNA') {
        if (type === 'deletion') {
            return {...result, type: 'copy loss'};
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
    let {drug} = row;
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
    const {biomarker, variantClass, protein} = row;
    if (biomarker.split('+').length > 2) {
        throw new Error('Missing logic to process variant combinations of 3 or more');
    }
    if (protein.trim()) {
        return [[{
            ...row,
            protein: protein.replace(':', ':p.')
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
                variants.push({gene, protein: `${gene}:${hgvsp}`});
            }
        } else if (match = /^(\w+)\s+(.*)$/.exec(variant)) {
            const [, gene, tail] = match;
            if (match = /^exon (\d+) (insertion|deletion)s?$/.exec(tail)) {
                const [, pos, type] = match;
                variants.push({gene, exonic: `e.${pos}${type.slice(0, 3)}`});
            } else {
                variants.push(parseCategoryVariant({biomarker, gene}));
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
const processVariants = async ({conn, row, source}) => {
    const {
        genomic, protein, transcript, cds, type: variantType, gene, exonic
    } = row;
    let proteinVariant,
        cdsVariant,
        categoryVariant,
        genomicVariant,
        exonicVariant;

    if (genomic) {
        const parsed = kbParser.variant.parse(genomic).toJSON();
        const reference1 = await conn.getUniqueRecordBy({
            target: 'Feature',
            filters: {
                AND: [
                    {biotype: 'chromosome'},
                    {
                        OR: [
                            {sourceId: parsed.reference1},
                            {name: parsed.reference1}
                        ]
                    }
                ]
            },
            sort: preferredFeatures
        });
        const type = await conn.getVocabularyTerm(parsed.type);
        genomicVariant = await conn.addVariant({
            target: 'PositionalVariant',
            content: {...parsed, reference1, type},
            existsOk: true
        });
    }

    if (protein) {
        const parsed = kbParser.variant.parse(`${gene}:${protein.split(':')[1]}`).toJSON();
        const [reference1] = await _gene.fetchAndLoadBySymbol(conn, gene);
        const type = await conn.getVocabularyTerm(parsed.type);
        proteinVariant = await conn.addVariant({
            target: 'PositionalVariant',
            content: {...parsed, reference1: rid(reference1), type},
            existsOk: true
        });
    }
    if (transcript && cds) {
        const parsed = kbParser.variant.parse(`${transcript}:${cds}`).toJSON();
        const reference1 = await conn.getUniqueRecordBy({
            target: 'Feature',
            filters: {AND: [{biotype: 'transcript'}, {sourceId: transcript}, {sourceIdVersion: null}]},
            sort: orderPreferredOntologyTerms
        });
        const type = await conn.getVocabularyTerm(parsed.type);
        cdsVariant = await conn.addVariant({
            target: 'PositionalVariant',
            content: {...parsed, reference1, type},
            existsOk: true
        });
    }
    if (exonic) {
        const parsed = kbParser.variant.parse(`${gene}:${exonic}`).toJSON();
        const [reference1] = await _gene.fetchAndLoadBySymbol(conn, gene);
        const type = await conn.getVocabularyTerm(parsed.type);
        exonicVariant = await conn.addVariant({
            target: 'PositionalVariant',
            content: {...parsed, reference1: rid(reference1), type},
            existsOk: true
        });
    }
    try {
        const [reference1] = await _gene.fetchAndLoadBySymbol(conn, gene);
        const type = rid(await conn.getVocabularyTerm(variantType));
        categoryVariant = await conn.addVariant({
            target: 'CategoryVariant',
            content: {type, reference1: rid(reference1)},
            existsOk: true
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
        [genomicVariant, cdsVariant || proteinVariant || exonicVariant]
    ];
    for (const [src, tgt] of combinations) {
        if (src && tgt) {
            await conn.addRecord({
                target: 'Infers',
                content: {
                    out: rid(src),
                    in: rid(tgt),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
    return proteinVariant || cdsVariant || genomicVariant || exonicVariant || categoryVariant;
};

const processRow = async ({row, source, conn}) => {
    // process the protein notation
    // look up the disease by name
    const diseaseName = diseaseMapping[row.disease] || `${row.disease}|${row.disease} cancer`;

    const disease = rid(await conn.getUniqueRecordBy({
        target: 'Disease',
        filters: {name: diseaseName},
        sort: preferredDiseases
    }));
    const therapyName = row.therapy.includes(';')
        ? row.therapy.split(';').map(n => n.toLowerCase().trim()).sort().join(' + ')
        : row.therapy;
    // look up the drug by name
    const drug = rid(await conn.addTherapyCombination(source, therapyName));
    const variants = await Promise.all(row.variants.map(
        async variant => processVariants({conn, row: variant, source})
    ));

    const level = rid(await conn.getUniqueRecordBy({
        target: 'EvidenceLevel',
        filters: {AND: [{name: row.evidenceLevel}, {source: rid(source)}]}
    }));

    const articles = await _pubmed.fetchAndLoadByIds(
        conn,
        row.evidence.filter(ev => !ev.startsWith('NCT'))
    );
    const trials = await Promise.all(
        row.evidence
            .filter(ev => ev.startsWith('NCT'))
            .map(async evidence => _trials.fetchAndLoadById(conn, evidence))
    );

    // determine the relevance of the statement
    const relevance = rid(await conn.getVocabularyTerm(
        relevanceMapping[row.relevance.toLowerCase()] || row.relevance
    ));

    const evidence = [...articles.map(rid), ...trials.map(rid)];

    if (evidence.length === 0) {
        evidence.push(rid(source));
    }

    // create the statement
    await conn.addRecord({
        target: 'Statement',
        content: {
            evidenceLevel: level,
            relevance,
            subject: drug,
            conditions: [...variants.map(rid), disease, drug],
            evidence,
            source: rid(source),
            sourceId: row.sourceId
        },
        existsOk: true,
        fetchExisting: false
    });
};


const uploadFile = async ({conn, filename, errorLogPrefix}) => {
    const rows = await loadDelimToJson(filename);
    logger.info('creating the source record');
    const source = rid(await conn.addRecord({
        target: 'Source',
        existsOk: true,
        content: SOURCE_DEFN
    }));
    const counts = {skip: 0, error: 0, success: 0};

    logger.info('creating the evidence levels');
    await uploadFromJSON({conn, data: evidenceLevels});
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
            ...convertRowFields(HEADER, rows[index])
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
                row,
                error: err,
                index,
                errorMessage: err.toString()
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
                    await processRow({row: {...row, variants: combo, disease}, conn, source});
                    counts.success++;
                } catch (err) {
                    errorList.push({
                        row,
                        error: err,
                        index,
                        errorMessage: err.toString()
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
    fs.writeFileSync(errorLogFile, JSON.stringify({records: errorList}, null, 2));
    logger.info(JSON.stringify(counts));
};


module.exports = {uploadFile, SOURCE_DEFN, kb: true};
