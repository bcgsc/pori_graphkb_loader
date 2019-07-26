const fs = require('fs');
const kbParser = require('@bcgsc/knowledgebase-parser');

const {
    loadDelimToJson,
    rid,
    convertRowFields,
    INTERNAL_SOURCE_NAME,
    orderPreferredOntologyTerms,
    preferredDiseases,
    preferredFeatures
} = require('./util');
const {logger} = require('./logging');
const _hgnc = require('./hgnc');
const _trials = require('./clinicaltrialsgov');
const _pubmed = require('./entrez/pubmed');
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


const parseCategoryVariant = (row) => {
    const type = row.biomarker.slice(row.gene.length).trim();
    const result = {reference1: row.gene, type};

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
    for (const item of row.evidence.split(';')) {
        if (item.startsWith('PMID:')) {
            evidence.push(item.slice('PMID:'.length));
        } else if (/^NCT\d+$/.exec(item)) {
            evidence.push(item);
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
    if (!row.biomarker.includes('+')) {
        return [[row]]; // single variant in multiple forms
    }

    if (row.biomarker.split('+').length > 2) {
        throw new Error('Missing logic to process variant combinations of 3 or more');
    }

    const combinations = [];

    for (const variant of row.biomarker.split(/\s*\+\s*/)) {
        let match;
        const variants = [];
        if (match = /^(\w+) \(([A-Z0-9*]+)\)$/.exec(variant)) {
            for (const protein of match[2].splice(',')) {
                variants.push({gene: match[1], protein: `${match[1]}:${protein}`});
            }
        } else if (match = /^(\w+)\s.*$/.exec(variant)) {
            variants.push(parseCategoryVariant({biomarker: row.biomarker, gene: match[1]}));
        }
        combinations.push(variants);
    }

    const result = [];
    // all combinations with 1 from each level
    for (let i = 0; i < combinations[0].length; i++) {
        for (let j = 0; j < combinations[1].length; j++) {
            result.push([combinations[0][i], combinations[1][j]]);
        }
    }
    return result;
};

/**
 * parse and add the variant records
 * returns the variant to be linked to the statement (protein > cds > category)
 */
const processVariants = async ({conn, row, source}) => {
    let proteinVariant,
        cdsVariant,
        categoryVariant,
        genomicVariant;

    if (row.genomic) {
        const parsed = kbParser.variant.parse(row.genomic).toJSON();
        const reference1 = await conn.getUniqueRecordBy({
            endpoint: 'features',
            where: {
                biotype: 'chromosome',
                sourceId: parsed.reference1,
                name: parsed.reference1,
                or: 'sourceId,name'
            },
            sort: preferredFeatures
        });
        const type = await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: parsed.type, source: {name: INTERNAL_SOURCE_NAME}},
            sort: orderPreferredOntologyTerms
        });
        genomicVariant = await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {...parsed, reference1, type},
            existsOk: true
        });
    }

    if (row.protein) {
        const parsed = kbParser.variant.parse(`${row.gene}:p.${row.protein.split(':')[1]}`).toJSON();
        const reference1 = rid(await _hgnc.fetchAndLoadBySymbol({conn, symbol: row.gene}));
        const type = rid(await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: parsed.type, source: {name: INTERNAL_SOURCE_NAME}},
            sort: orderPreferredOntologyTerms
        }));
        proteinVariant = await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {...parsed, reference1, type},
            existsOk: true
        });
    }
    if (row.transcript && row.cds) {
        const parsed = kbParser.variant.parse(`${row.transcript}:${row.cds}`).toJSON();
        const reference1 = await conn.getUniqueRecordBy({
            endpoint: 'features',
            where: {biotype: 'transcript', sourceId: row.transcript, sourceIdVersion: null},
            sort: orderPreferredOntologyTerms
        });
        const type = rid(await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: parsed.type, source: {name: INTERNAL_SOURCE_NAME}},
            sort: orderPreferredOntologyTerms
        }));
        cdsVariant = await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {...parsed, reference1, type},
            existsOk: true
        });
    }
    try {
        const parsed = parseCategoryVariant(row);
        const reference1 = rid(await _hgnc.fetchAndLoadBySymbol({conn, symbol: parsed.reference1}));
        const type = rid(await conn.getUniqueRecordBy({
            endpoint: 'vocabulary',
            where: {name: parsed.type, source: {name: INTERNAL_SOURCE_NAME}},
            sort: orderPreferredOntologyTerms
        }));
        categoryVariant = await conn.addVariant({
            endpoint: 'categoryvariants',
            content: {...parsed, type, reference1},
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
        [proteinVariant || cdsVariant || genomicVariant, categoryVariant],
        [cdsVariant || genomicVariant, proteinVariant],
        [genomicVariant, cdsVariant || proteinVariant]
    ];
    for (const [src, tgt] of combinations) {
        if (src && tgt) {
            await conn.addRecord({
                endpoint: 'infers',
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
    return proteinVariant || cdsVariant || genomicVariant || categoryVariant;
};

const processRow = async ({row, source, conn}) => {
    // process the protein notation
    // look up the disease by name
    const disease = rid(await conn.getUniqueRecordBy({
        endpoint: 'diseases',
        where: {name: row.disease},
        sort: preferredDiseases
    }));
    const therapyName = row.therapy.includes(';')
        ? row.therapy.split(';').map(n => n.toLowerCase().timr()).sort().join(' + ')
        : row.therapy;
    // look up the drug by name
    const drug = rid(await conn.addTherapyCombination(source, therapyName));

    const variants = await Promise.all(row.variants.map(
        async variant => processVariants({conn, row: variant, source})
    ));

    const level = rid(await conn.getUniqueRecordBy({
        endpoint: 'evidencelevels',
        where: {name: row.evidenceLevel, source: {name: SOURCE_DEFN.name}}
    }));

    const articles = await _pubmed.uploadArticlesByPmid(
        conn,
        row.evidence.filter(ev => !ev.startsWith('NCT'))
    );
    const trials = await Promise.all(
        row.evidence
            .filter(ev => ev.startsWith('NCT'))
            .map(async evidence => _trials.fetchAndLoadById(conn, evidence))
    );

    // determine the relevance of the statement
    const relevance = rid(await conn.getUniqueRecordBy({
        endpoint: 'vocabulary',
        where: {name: relevanceMapping[row.relevance.toLowerCase()] || row.relevance}
    }));

    // create the statement
    await conn.addRecord({
        endpoint: 'statements',
        content: {
            evidenceLevel: level,
            relevance,
            appliesTo: drug,
            impliedBy: [...variants.map(rid), disease],
            supportedBy: [...articles.map(rid), ...trials.map(rid)],
            source: rid(source)
        },
        existsOk: true,
        fetchExisting: false
    });
};


const uploadFile = async ({conn, filename, errorLogPrefix}) => {
    const rows = await loadDelimToJson(filename);
    logger.info('creating the source record');
    const source = rid(await conn.addRecord({
        endpoint: 'sources',
        existsOk: true,
        content: SOURCE_DEFN
    }));
    const counts = {skip: 0, error: 0, success: 0};

    logger.info('creating the evidence levels');
    await uploadFromJSON({conn, data: evidenceLevels});
    const errorList = [];

    logger.info(`loading ${rows.length} rows`);
    for (let index = 0; index < rows.length; index++) {
        const row = convertRowFields(HEADER, rows[index]);
        row.therapy = parseTherapy(row);

        if (row.evidenceLevel.includes(',')) {
            logger.info(`skipping row #${index} due to multiple evidence levels (${row.evidenceLevel})`);
            counts.skip++;
            continue;
        } if (row.disease.includes(';')) {
            logger.info(`skipping row #${index} due to multiple diseases (${row.disease})`);
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
            logger.info(`skipping row #${index} for evidence parsing error (${err})`);
            counts.skip++;
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

        for (const combo of variants) {
            try {
                logger.info(`processing row #${index}`);
                await processRow({row: {...row, variants: combo}, conn, source});
                counts.success++;
            } catch (err) {
                if (err.statusCode >= 300) {
                    throw err;
                }
                errorList.push({row, error: err, index});
                logger.error(err);
                counts.error++;
            }
        }
    }
    const errorLogFile = `${errorLogPrefix}-cgi.json`;
    logger.info(`writing errors to: ${errorLogFile}`);
    fs.writeFileSync(errorLogFile, JSON.stringify({records: errorList}, null, 2));
    logger.info(JSON.stringify(counts));
};


module.exports = {uploadFile, SOURCE_DEFN, kb: true};
