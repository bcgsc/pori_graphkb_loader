/**
 * @module importer/oncokb
 */
const request = require('request-promise');
const Ajv = require('ajv');
const fs = require('fs');

const kbParser = require('@bcgsc/knowledgebase-parser');

const {
    preferredDiseases,
    preferredDrugs,
    rid,
    checkSpec
} = require('./util');
const _pubmed = require('./entrez/pubmed');
const _hgnc = require('./hgnc');
const _ncit = require('./ncit');
const {logger} = require('./logging');

const SOURCE_DEFN = {
    name: 'oncokb',
    description: 'OncoKB is a precision oncology knowledge base and contains information about the effects and treatment implications of specific cancer gene alterations. It is developed and maintained by the Knowledge Systems group in the Marie Josée and Henry R. Kravis Center for Molecular Oncology at Memorial Sloan Kettering Cancer Center (MSK), in partnership with Quest Diagnostics and Watson for Genomics, IBM.',
    usage: 'https://oncokb.org/terms',
    url: 'https://oncokb.org',
    displayName: 'OncoKB'
};

const ajv = new Ajv();


const actionableRecordSpec = ajv.compile({
    type: 'object',
    properties: {
        cancerType: {type: 'string'},
        drugs: {type: 'string'},
        gene: {type: 'string'},
        level: {type: 'string'},
        pmids: {type: 'string'},
        proteinChange: {type: 'string'}, // TODO: Link variant to protein change with 'infers' where different
        variant: {type: 'string'}
    }
});
const annotatedRecordSpec = ajv.compile({
    type: 'object',
    properties: {
        gene: {type: 'string'},
        mutationEffect: {type: 'string'},
        mutationEffectPmids: {type: 'string'},
        oncogenicity: {type: 'string'},
        proteinChange: {type: 'string'}, // TODO: Link variant to protein change with 'infers' where different
        variant: {type: 'string'}
    }
});
const drugRecordSpec = ajv.compile({
    type: 'object',
    required: ['drugName', 'uuid'],
    properties: {
        uuid: {type: 'string', format: 'uuid'},
        ncitCode: {type: 'string', pattern: '^C\\d+$'},
        drugName: {type: 'string'},
        synonyms: {
            type: 'array',
            items: {type: 'string'}
        }
    }
});
const curatedGeneSpec = ajv.compile({
    type: 'object',
    requried: ['entrezGeneId', 'oncogene', 'tsg'],
    properties: {
        entrezGeneId: {type: 'number'},
        oncogene: {type: 'boolean'},
        tsg: {type: 'boolean'}
    }
});

const VOCABULARY_MAPPING = {
    'oncogenic mutations': 'oncogenic mutation',
    fusions: 'fusion',
    'truncating mutations': 'truncating',
    'promoter mutations': 'promoter mutation'
};

const DISEASE_MAPPING = {
    'all tumors': 'disease of cellular proliferation',
    'cns cancer': 'central nervous system cancer',
    'non-langerhans cell histiocytosis/erdheim-chester disease': 'non-langerhans-cell histiocytosis'
};

const VOCABULARY_CACHE = {};

const getVocabulary = async (conn, term) => {
    const stdTerm = term.trim().toLowerCase();
    if (VOCABULARY_CACHE[stdTerm]) {
        return VOCABULARY_CACHE[stdTerm];
    }
    const rec = await conn.getVocabularyTerm(stdTerm);
    VOCABULARY_CACHE[rec.sourceId] = rec;
    return rec;
};

/**
 * Parse the variant string preresentation from oncokb to its graphkB equivalent
 */
const parseVariantName = (variantIn, {reference1} = {}) => {
    const variant = variantIn.toLowerCase();
    try {
        kbParser.variant.parse(`p.${variant}`, false);
        return {type: `p.${variant}`};
    } catch (err) {}
    let match = /^([a-z])?(\d+)_([a-z])?(\d+)splice$/.exec(variant);
    if (match) {
        return {
            type: `p.(${
                match[1] || '?'
            }${
                match[2]}_${match[3] || '?'
            }${
                match[4]
            })spl`
        };
    } if (variant.endsWith('_splice')) {
        return {type: `p.${variant.replace('_splice', 'spl')}`};
    } if (match = /^([^-\s]+)-([^-\s]+) fusion$/i.exec(variant)) {
        if (!reference1 || match[1].toLowerCase() === reference1.toLowerCase()) {
            return {
                type: 'fusion',
                reference2: match[2].trim().toLowerCase()
            };
        } if (match[2].toLowerCase() === reference1.toLowerCase()) {
            return {
                type: 'fusion',
                reference2: reference1.toLowerCase(),
                reference1: match[1].trim().toLowerCase()
            };
        }
        throw new Error(`the fusion in the variant ${
            variant
        } does not match the name of the gene feature ${
            reference1
        }`);
    } if (match = /^exon (\d+) (mutation|insertion|deletion|deletion\/insertion|splice mutation|indel)s?$/i.exec(variant)) {
        const [, pos, type] = match;
        if (type === 'deletion/insertion' || type === 'indel') {
            return {type: `e.${pos}delins`};
        } if (type === 'splice mutation') {
            return {type: `e.${pos}spl`};
        }
        return {type: `e.${pos}${type.slice(0, 3)}`};
    } if (VOCABULARY_MAPPING[variant.toLowerCase().trim()] !== undefined) {
        return {type: VOCABULARY_MAPPING[variant.toLowerCase().trim()]};
    } if (match = /^Exon (\d+) and (\d+) deletion$/i.exec(variant)) {
        return {type: `e.${match[1]}_${match[2]}del`};
    }
    throw new Error(`Unable to parse variant notation (variantIn=${variantIn}, reference1=${reference1})`);
};


/**
 * Parse the variant string and return the new variant record with all appropriate calculated linked records
 */
const processVariant = async (opt) => {
    // first try to retrieve the gene rawRecord
    const {
        conn, rawRecord
    } = opt;
    let gene1,
        type,
        reference2,
        gene2;

    if (rawRecord.gene.toLowerCase() === 'other biomarkers') {
        try {
            const vocab = rawRecord.variant.trim().toLowerCase();
            if (vocab !== 'microsatellite instability-high') {
                throw new Error(`unsupported biomarker variant ${rawRecord.variant}`);
            }
            type = 'strong signature';
            gene1 = await conn.getUniqueRecordBy({
                endpoint: 'signatures',
                where: {name: 'microsatellite instability'}
            });
        } catch (err) {
            logger.warn(`failed to retrieve the associated vocabulary for (variant=${rawRecord.variant})`);
            throw err;
        }
    } else {
        // gene-base variant
        try {
            gene1 = await _hgnc.fetchAndLoadBySymbol({conn, symbol: rawRecord.entrezGeneId, paramType: 'entrez_id'});
        } catch (err) {
            logger.error(err);
            throw err;
        }

        // determine the type of variant we are dealing with
        try {
            ({type, reference2} = parseVariantName(
                rawRecord.variant,
                {reference1: gene1.name}
            ));
        } catch (err) {
            type = rawRecord.variant;
        }
        try {
            if (reference2) {
                gene2 = await _hgnc.fetchAndLoadBySymbol({conn, symbol: reference2});
            }
        } catch (err) {
            logger.warn(`Failed to retrieve hugo gene ${reference2}`);
            throw err;
        }
    }
    // swap them for fusions listed in opposite order
    if (reference2
        && gene2
        && reference2.name === gene1.name
        && reference2.name !== gene2.name
    ) {
        [gene1, gene2] = [gene2, gene1];
    }

    // if it fits one of the known term types usethat, otherwise attempt to parse as if protein notation
    let variantUrl;
    const defaults = {
        zygosity: null,
        germline: null,
        reference2: null
    };
    let variant,
        variantType = type;
    try {
        variantType = await getVocabulary(conn, variantType);
        variantUrl = 'categoryvariants';
        variant = {};
    } catch (err) {}

    if (!variant) {
        try {
            variant = kbParser.variant.parse(type, false).toJSON();
        } catch (err) {
            try {
                // try with adding a p prefix also
                variant = kbParser.variant.parse(`p.${type}`, false).toJSON();
            } catch (err2) {}
            logger.warn(`failed to parse the variant (${type}) for record (gene=${rawRecord.gene}, variant=${rawRecord.variant})`);
            throw err;
        }

        variantUrl = 'positionalvariants';
        try {
            variantType = await getVocabulary(conn, variant.type);
        } catch (err) {
            logger.warn(`failed to retrieve the variant type (${variant.type})`);
        }
        Object.assign(defaults, {
            untemplatedSeq: null,
            break1Start: null,
            break1End: null,
            break2Start: null,
            break2End: null,
            refSeq: null,
            truncation: null
        });
    }
    variant.reference1 = rid(gene1);
    if (gene2) {
        variant.reference2 = rid(gene2);
    }
    variant.type = rid(variantType);
    // create the variant
    for (const [key, value] of Object.entries(variant)) {
        if (value instanceof kbParser.position.Position) {
            variant[key] = value.toJSON();
        }
    }

    variant = await conn.addVariant({
        endpoint: variantUrl,
        content: variant,
        existsOk: true
    });

    return variant;
};


const processDisease = async (opt) => {
    const {conn, diseaseName} = opt;
    // next attempt to find the cancer type (oncotree?)
    let disease;
    try {
        disease = await conn.getUniqueRecordBy({
            endpoint: 'diseases',
            where: {name: diseaseName},
            sort: preferredDiseases
        });
    } catch (err) {
        if (diseaseName.includes('/')) {
            disease = await conn.getUniqueRecordBy({
                endpoint: 'diseases',
                where: {name: diseaseName.split('/')[0].trim()},
                sort: preferredDiseases
            });
        } else {
            throw err;
        }
    }
    return disease;
};


/**
 * Parses an actionable record from OncoKB and querys the GraphKB for existing terms
 * Converts this record into a GraphKB statement (where possible) and uploads the statement to the GraphKB
 * http://oncokb.org/api/v1/utils/allActionableVariants.json
 *
 * @param opt {object} options
 * @param opt.conn {ApiConnection} the connection object for sending requests to the GraphKB server
 * @param opt.rawRecord {object} the record directly from OncoKB
 * @param opt.source {object} the oncokb source object
 * @param opt.pubmedSource {object} the source object for pubmed entries
 */
const processActionableRecord = async (opt) => {
    // first try to retrieve the gene rawRecord
    const {
        conn, rawRecord, sources: {oncokb}
    } = opt;
    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    const variant = await processVariant(opt);
    // next attempt to find the cancer type (oncotree?)
    const disease = await processDisease({conn, diseaseName: rawRecord.cancerType});

    // find the drug
    let drug;
    try {
        drug = await conn.getUniqueRecordBy({
            endpoint: 'therapies',
            where: {name: rawRecord.drug, source: rid(oncokb)},
            sort: preferredDrugs
        });
    } catch (err) {
        if (rawRecord.drug.includes('+')) {
            // add the combination therapy as a new therapy defined by oncokb
            drug = await conn.addTherapyCombination(oncokb, rawRecord.drug, {matchSource: true});
        } else {
            throw err;
        }
    }


    // get the evidence level and determine the relevance
    const level = await conn.getUniqueRecordBy({
        endpoint: 'evidencelevels',
        where: {sourceId: rawRecord.level, source: rid(oncokb)}
    });

    let relevance = level.name.startsWith('r')
        ? 'resistance'
        : 'sensitivity';
    relevance = await getVocabulary(conn, relevance);

    // find/add the publications
    const publications = await Promise.all(
        rawRecord.pmids
            .split(',')
            .filter(pmid => pmid && pmid.trim())
            .map(async pmid => _pubmed.fetchArticle(conn, pmid.trim()))
    );

    // make the actual statement
    await conn.addRecord({
        endpoint: 'statements',
        content: {
            impliedBy: [rid(variant), rid(disease)],
            supportedBy: publications.map(rid),
            relevance: rid(relevance),
            appliesTo: rid(drug),
            source: rid(oncokb),
            reviewStatus: 'not required',
            evidenceLevel: rid(level)
        },
        existsOk: true,
        fetchExisting: false
    });
};

/**
 * parsing from http://oncokb.org/api/v1/utils/allAnnotatedVariants.json
 */
const processAnnotatedRecord = async (opt) => {
    const {
        conn, rawRecord, sources: {oncokb}
    } = opt;

    rawRecord.gene = rawRecord.gene.toLowerCase().trim();
    const variant = await processVariant(opt);
    // next attempt to find the cancer type (oncotree?)
    let disease;
    if (rawRecord.cancerType) {
        disease = await processDisease({conn, diseaseName: rawRecord.cancerType});
    }
    rawRecord.mutationEffect = rawRecord.mutationEffect.replace(/-/g, ' ');
    let relevance1;
    try {
        relevance1 = await getVocabulary(conn, rawRecord.mutationEffect);
    } catch (err) {}
    let relevance2;
    try {
        relevance2 = await getVocabulary(conn, rawRecord.oncogenicity);
    } catch (err) {}

    if (!relevance1 && !relevance2) {
        throw new Error(`unable to find vocabulary terms: ${rawRecord.mutationEffect} or ${rawRecord.oncogenicity}`);
    }
    // make the actual functional statement
    const impliedBy = [rid(variant)];
    if (disease) {
        impliedBy.push(rid(disease));
    }
    // find/add the publications
    const publications = await Promise.all(
        rawRecord.mutationEffectPmids
            .split(',')
            .filter(pmid => pmid && pmid.trim())
            .map(async pmid => _pubmed.fetchArticle(conn, pmid.trim()))
    );

    let count = 0;
    if (relevance1) {
        await conn.addRecord({
            endpoint: 'statements',
            content: {
                impliedBy,
                supportedBy: publications.map(rid),
                relevance: rid(relevance1),
                appliesTo: rid(variant.reference1),
                source: rid(oncokb),
                reviewStatus: 'not required'
            },
            existsOk: true,
            fetchExisting: false
        });
        count++;
    }
    // make the oncogenicity statement
    if (relevance2) {
        await conn.addRecord({
            endpoint: 'statements',
            content: {
                impliedBy,
                supportedBy: publications.map(rid),
                relevance: rid(relevance2),
                appliesTo: null,
                source: rid(oncokb),
                reviewStatus: 'not required'
            },
            existsOk: true,
            fetchExisting: false
        });
        count++;
    }
    return count;
};


/**
 * Add the oncokb evidence level terms. Pulls data from: http://oncokb.org/api/v1/levels
 */
const addEvidenceLevels = async (conn, source) => {
    const URL = 'http://oncokb.org/api/v1/levels';
    const levels = await request({
        method: 'GET',
        uri: URL,
        json: true
    });
    const result = {};
    for (let [level, desc] of Object.entries(levels)) {
        if (!/^LEVEL_[A-Z0-9]+$/.exec(level)) {
            throw new kbParser.error.ParsingError({
                message: `Error in parsing the level name: ${level}`,
                expected: '/^LEVEL_[A-Z0-9]+$/',
                observed: level
            });
        }
        level = level.slice('LEVEL_'.length);
        const record = await conn.addRecord({
            endpoint: 'evidencelevels',
            content: {
                source: rid(source),
                sourceId: level,
                name: level,
                description: desc,
                url: URL
            },
            fetchConditions: {sourceId: level, name: level, source: rid(source)},
            existsOk: true
        });
        result[level] = record;
    }
    return result;
};


/**
 * Download all actionable records and process them
 * Creates the equivalent GraphKB records
 *
 * @param {object} opt
 * @param {string} opt.URL base url to use for accessing oncokb
 * @param {object} opt.counts record success/error tracking for reporting to the parent function
 * @param {object|string} opt.oncokb the oncokb 'source' record
 * @param {ApiConnection} opt.conn the GraphKB api connection
 */
const processActionableRecords = async ({
    URL, conn, counts, oncokb
}) => {
    // load directly from their api:
    const errorList = [];
    logger.info(`loading: ${URL}/utils/allActionableVariants.json`);
    const recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${URL}/utils/allActionableVariants.json`
    });
    logger.info(`loaded ${recordsList.length} records`);
    const records = [];
    const pmidList = new Set();
    for (let i = 0; i < recordsList.length; i++) {
        const rawRecord = recordsList[i];
        try {
            checkSpec(actionableRecordSpec, rawRecord, () => i);
        } catch (err) {
            logger.error(err);
            errorList.push({row: rawRecord, error: err});
            counts.error++;
            continue;
        }
        records.push(rawRecord);
        for (const pmid of rawRecord.pmids.split(',')) {
            pmidList.add(pmid.trim());
        }
    }
    logger.info(`loading ${pmidList.size} pubmed articles`);
    await _pubmed.uploadArticlesByPmid(conn, Array.from(pmidList));

    logger.info(`processing ${records.length} remaining oncokb records`);

    for (const rawRecord of records) {
        for (const drug of Array.from(rawRecord.drugs.split(','), x => x.trim().toLowerCase()).filter(x => x.length > 0)) {
            rawRecord.drug = drug;
            rawRecord.cancerType = rawRecord.cancerType.toLowerCase().trim();
            rawRecord.cancerType = DISEASE_MAPPING[rawRecord.cancerType] === undefined
                ? rawRecord.cancerType
                : DISEASE_MAPPING[rawRecord.cancerType];

            rawRecord.variant = VOCABULARY_MAPPING[rawRecord.variant] === undefined
                ? rawRecord.variant
                : VOCABULARY_MAPPING[rawRecord.variant];

            try {
                await processActionableRecord({
                    conn, rawRecord, sources: {oncokb}
                });
                counts.success++;
            } catch (err) {
                errorList.push({row: rawRecord, error: (err.error || err)});
                counts.errors++;
                logger.error((err.error || err).message);
            }
        }
    }
    return errorList;
};


/**
 * Download all annotated records and process them
 * Creates the equivalent GraphKB records
 *
 * @param {object} opt
 * @param {string} opt.URL base url to use for accessing oncokb
 * @param {object} opt.counts record success/error tracking for reporting to the parent function
 * @param {object|string} opt.oncokb the oncokb 'source' record
 * @param {ApiConnection} opt.conn the GraphKB api connection
 */
const processAnnotatedRecords = async ({
    URL, conn, counts, oncokb
}) => {
    // load directly from their api:
    const errorList = [];
    logger.info(`loading: ${URL}/utils/allAnnotatedVariants.json`);
    const recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${URL}/utils/allAnnotatedVariants.json`
    });
    logger.info(`loaded ${recordsList.length} records`);
    const records = [];
    const pmidList = new Set();
    for (let i = 0; i < recordsList.length; i++) {
        const rawRecord = recordsList[i];
        try {
            checkSpec(annotatedRecordSpec, rawRecord);
        } catch (err) {
            logger.error(err);
            errorList.push({row: rawRecord, error: err});
            counts.error++;
            continue;
        }
        if (rawRecord.mutationEffect === 'Inconclusive' && rawRecord.oncogenicity === 'Inconclusive') {
            counts.skip += 2;
            continue;
        }
        records.push(rawRecord);
        for (const pmid of rawRecord.mutationEffectPmids.split(',') || []) {
            pmidList.add(pmid.trim());
        }
    }

    logger.info(`loading ${pmidList.size} pubmed articles`);
    await _pubmed.uploadArticlesByPmid(conn, Array.from(pmidList));

    logger.info(`processing ${records.length} remaining oncokb records`);
    for (const rawRecord of records) {
        let expect = 0;
        if (rawRecord.mutationEffect !== 'Inconclusive') {
            expect++;
        }
        if (rawRecord.oncogenicity !== 'Inconclusive') {
            expect++;
        }
        if (rawRecord.cancerType) {
            rawRecord.cancerType = rawRecord.cancerType.toLowerCase().trim();
            rawRecord.cancerType = DISEASE_MAPPING[rawRecord.cancerType] === undefined
                ? rawRecord.cancerType
                : DISEASE_MAPPING[rawRecord.cancerType];
        }

        rawRecord.variant = VOCABULARY_MAPPING[rawRecord.variant] === undefined
            ? rawRecord.variant
            : VOCABULARY_MAPPING[rawRecord.variant];

        try {
            const statementCount = await processAnnotatedRecord({
                conn, rawRecord, sources: {oncokb}
            });
            counts.success += statementCount;
            counts.errors += expect - statementCount;
            counts.skip += 2 - expect;
        } catch (err) {
            logger.error((err.error || err).message);
            errorList.push({row: rawRecord, error: (err.error || err)});
            counts.errors++;
        }
    }
    return errorList;
};

/**
 * Upload the gene curation as tumour supressive or oncogenic statements
 */
const uploadAllCuratedGenes = async ({conn, baseUrl = URL, source}) => {
    const genes = await request(`${baseUrl}/utils/allCuratedGenes`, {
        method: 'GET',
        json: true
    });

    const tsg = rid(await conn.getVocabularyTerm('tumour suppressive'));
    const oncogene = rid(await conn.getVocabularyTerm('oncogenic'));

    for (const gene of genes) {
        logger.info(`processing gene: ${gene.entrezGeneId}`);
        let record;
        try {
            checkSpec(curatedGeneSpec, gene, g => g.entrezGeneId);
            record = rid(await _hgnc.fetchAndLoadBySymbol({
                conn,
                symbol: gene.entrezGeneId,
                paramType: 'entrez_id'
            }));
        } catch (err) {
            logger.error(err);
            continue;
        }
        // now add the TSG or oncogene statement
        const relevance = [];
        if (gene.oncogene) {
            relevance.push(oncogene);
        }
        if (gene.tsg) {
            relevance.push(tsg);
        }
        await Promise.all(relevance.map(async (rel) => {
            try {
                await conn.addRecord({
                    endpoint: 'statements',
                    content: {
                        impliedBy: [record],
                        supportedBy: [rid(source)],
                        source: rid(source),
                        description: gene.summary,
                        appliesTo: record,
                        relevance: rel
                    },
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err) {
                logger.error(err);
            }
        }));
    }
};

/**
 * Load the drug ontology from OncoKB
 */
const uploadAllTherapies = async ({conn, URL, source}) => {
    const drugs = await request(`${URL}/drugs`, {
        method: 'GET',
        json: true
    });

    const aliases = [];


    for (const drug of drugs) {
        logger.info(`processing drug: ${drug.uuid}`);
        let record;
        try {
            checkSpec(drugRecordSpec, drug, d => d.uuid);
            record = await conn.addRecord({
                endpoint: 'therapies',
                content: {source, sourceId: drug.uuid, name: drug.drugName},
                existsOk: true
            });
        } catch (err) {
            logger.error(err);
            continue;
        }

        // link to NCIT
        if (drug.ncitCode) {
            try {
                const ncit = await conn.getUniqueRecordBy({
                    endpoint: 'therapies',
                    where: {sourceId: drug.ncitCode, source: {name: _ncit.SOURCE_DEFN.name}},
                    sort: preferredDrugs
                });
                await conn.addRecord({
                    endpoint: 'crossreferenceof',
                    content: {out: rid(record), in: rid(ncit), source},
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err) {
                logger.warn(`Failed to link ${drug.uuid} to ${drug.ncitCode}`);
            }
        }

        // link to the alias terms
        drug.synonyms.forEach(syn => aliases.push([record, syn]));
    }

    const addAlias = async ([record, aliasName]) => {
        if (aliasName.toLowerCase().trim() === record.name) {
            return;
        }
        try {
            const alias = await conn.getUniqueRecordBy({
                endpoint: 'therapies',
                where: {
                    source, name: aliasName
                }
            });
            await conn.addRecord({
                endpoint: 'AliasOf',
                content: {out: rid(record), in: rid(alias), source},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            try {
                const alias = await conn.addRecord({
                    endpoint: 'therapies',
                    content: {
                        source, name: aliasName, sourceId: aliasName
                    },
                    existsOk: true
                });
                await conn.addRecord({
                    endpoint: 'AliasOf',
                    content: {out: rid(record), in: rid(alias), source},
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err2) {
                logger.warn(`Failed to link alias ${record.sourceId} to ${aliasName} (${err2})`);
            }
        }
    };

    await Promise.all(aliases.map(addAlias));
};

/**
 * Upload the OncoKB statements from the OncoKB API into GraphKB
 *
 * @param {object} opt options
 * @param {string} [opt.url] the base url for fetching from the OncoKB Api
 * @param {ApiConnection} opt.conn the GraphKB api connection object
 */
const upload = async (opt) => {
    const {conn, errorLogPrefix} = opt;
    const URL = opt.url || 'http://oncokb.org/api/v1';

    // add the source node
    const oncokb = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });

    const counts = {errors: 0, success: 0, skip: 0};

    const errorList = [];
    logger.info('load oncogene/tumour suppressor list');
    await uploadAllCuratedGenes({conn, baseUrl: URL, source: oncokb});
    logger.info('load drug ontology');
    await uploadAllTherapies({conn, URL, source: rid(oncokb)});

    await addEvidenceLevels(conn, oncokb);
    errorList.push(...await processActionableRecords({
        conn, oncokb, URL, counts
    }));
    errorList.push(...await processAnnotatedRecords({
        conn, oncokb, URL, counts
    }));
    const errorOutput = `${errorLogPrefix}-oncokbErrors.json`;
    logger.info(`writing errors to ${errorOutput}`);
    fs.writeFileSync(errorOutput, JSON.stringify({records: errorList}, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = {
    upload,
    parseVariantName,
    SOURCE_DEFN,
    kb: true,
    specs: {
        actionableRecordSpec,
        annotatedRecordSpec,
        drugRecordSpec,
        curatedGeneSpec
    }
};
