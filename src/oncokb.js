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
    checkSpec,
    hashRecordToId
} = require('./util');
const _pubmed = require('./entrez/pubmed');
const _entrezGene = require('./entrez/gene');
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
        entrezGeneId: {type: 'number'},
        gene: {type: 'string'},
        level: {type: 'string'},
        pmids: {type: 'string'},
        proteinChange: {type: 'string'}, // TODO: Link variant to protein change with 'infers' where different
        variant: {type: 'string'},
        abstracts: {type: 'string'}
    }
});
const annotatedRecordSpec = ajv.compile({
    type: 'object',
    properties: {
        gene: {type: 'string'},
        entrezGeneId: {type: 'number'},
        mutationEffect: {type: 'string'},
        mutationEffectPmids: {type: 'string'},
        oncogenicity: {type: 'string'},
        proteinChange: {type: 'string'}, // TODO: Link variant to protein change with 'infers' where different
        variant: {type: 'string'},
        mutationEffectAbstracts: {type: 'string'}
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

const variantSpec = ajv.compile({
    type: 'object',
    required: ['gene', 'consequence', 'name', 'proteinStart', 'proteinEnd', 'alteration'],
    properties: {
        gene: {
            type: 'object',
            required: ['entrezGeneId'],
            properties: {entrezGeneId: {type: 'number'}}
        },
        consequence: {
            type: 'object',
            required: ['term'],
            properties: {term: {type: 'string'}}
        },
        proteinStart: {type: 'number'},
        proteinEnd: {type: 'number'},
        name: {type: 'string'},
        alteration: {type: 'string'}
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
    } if (match = /^exon (\d+) (mutation|insertion|deletion|deletion\/insertion|splice mutation|indel|missense mutation)s?$/i.exec(variant)) {
        const [, pos, type] = match;
        if (type === 'deletion/insertion' || type === 'indel') {
            return {type: `e.${pos}delins`};
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
const processVariant = async (conn, {
    gene, variantName, entrezGeneId, alternate
}) => {
    let gene1,
        type,
        reference2,
        gene2;

    if (gene.toLowerCase() === 'other biomarkers') {
        try {
            const vocab = variantName.trim().toLowerCase();
            if (vocab !== 'microsatellite instability-high') {
                throw new Error(`unsupported biomarker variant ${variantName}`);
            }
            type = 'strong signature';
            gene1 = await conn.getUniqueRecordBy({
                endpoint: 'signatures',
                where: {name: 'microsatellite instability'}
            });
        } catch (err) {
            logger.warn(`failed to retrieve the associated vocabulary for (variant=${variantName})`);
            throw err;
        }
    } else {
        // gene-base variant
        try {
            [gene1] = await _entrezGene.fetchAndLoadByIds(conn, [entrezGeneId]);
        } catch (err) {
            logger.error(err);
            throw err;
        }

        // determine the type of variant we are dealing with
        try {
            ({type, reference2} = parseVariantName(
                variantName,
                {reference1: gene1.name}
            ));
        } catch (err) {
            type = variantName;
        }
        try {
            if (reference2) {
                const candidates = await _entrezGene.fetchAndLoadBySymbol(conn, reference2);
                if (candidates.length !== 1) {
                    throw new Error(`Unable to find single (${candidates.length}) unique records by symbol (${reference2})`);
                }
                gene2 = candidates[0];
            }
        } catch (err) {
            logger.warn(err);
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
    let variantUrl,
        variant,
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
            logger.warn(`failed to parse the variant (${type}) for record (gene=${gene}, variant=${variantName})`);
            throw err;
        }

        variantUrl = 'positionalvariants';
        try {
            variantType = await getVocabulary(conn, variant.type);
        } catch (err) {
            logger.warn(`failed to retrieve the variant type (${variant.type})`);
        }
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
    // if there is an alternate representation, link it to this one
    if (alternate) {
        const {variant: altVariantName, entrezGeneId: altGeneId} = alternate;
        let reference1;
        if (altGeneId === entrezGeneId) {
            ({reference1} = variant);
        } else {
            [reference1] = await _entrezGene.fetchAndLoadByIds(conn, [altGeneId]);
        }
        try {
            // try with adding a p prefix also
            const parsed = kbParser.variant.parse(altVariantName, false).toJSON();
            parsed.reference1 = rid(reference1);
            parsed.type = rid(await getVocabulary(conn, parsed.type));
            const altVariant = rid(await conn.addVariant({
                endpoint: 'positionalvariants',
                content: parsed,
                existsOk: true
            }));
            await conn.addRecord({
                endpoint: 'infers',
                content: {
                    out: altVariant,
                    in: rid(variant)
                },
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            logger.warn(`failed to parse the alternate variant form (${alternate.variant}) for record (gene=${gene}, variant=${variantName})`);
            logger.error(err);
        }
    }

    return variant;
};


const processDisease = async (conn, diseaseName) => {
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
 * Convert abstract citation to a sourceId findable in GraphKB
 *
 * @example
 * parseAbstractCitation('Camidge et al. Abstract# 8001, ASCO 2014 http://meetinglibrary.asco.org/content/132030-144')
 * {source: {name: 'ASCO'}, year: 2014, abstractNumber: 80001}
 */
const parseAbstractCitation = (citation) => {
    let match;
    if (match = /.*Abstract\s*#\s*([A-Z0-9a-z][A-Za-z0-9-]+)[.,]? (AACR|ASCO),? (2\d{3})[., ]*/.exec(citation)) {
        const [, abstractNumber, sourceName, year] = match;
        return {abstractNumber, year, source: {name: sourceName}};
    }
    throw new Error(`unable to parse abstract citation (${citation})`);
};

/**
 * Parses an actionable record from OncoKB and querys the GraphKB for existing terms
 * Converts this record into a GraphKB statement (where possible) and uploads the statement to the GraphKB
 * http://oncokb.org/api/v1/utils/allActionableVariants.json
 *
 * @param opt {object} options
 * @param opt.conn {ApiConnection} the connection object for sending requests to the GraphKB server
 * @param opt.record {object} the record from OncoKB (post-parsing)
 * @param opt.source {object} the oncokb source object
 */
const processRecord = async ({
    conn, record, source, variantMap = {}
}) => {
    // get the variant
    const {
        gene,
        variantName,
        diseaseName,
        entrezGeneId,
        support,
        drug = null,
        levelName,
        relevanceName,
        appliesToTarget
    } = record;
    const key = `${entrezGeneId}:${variantName}`;
    const variant = await processVariant(conn, {
        gene, entrezGeneId, variantName, alternate: variantMap[key]
    });
    // next attempt to find the cancer type (oncotree?)
    let disease;
    if (diseaseName) {
        disease = await processDisease(conn, diseaseName);
    }

    // find the drug
    let therapy;
    if (drug) {
        try {
            therapy = await conn.getUniqueRecordBy({
                endpoint: 'therapies',
                where: {name: drug, source},
                sort: preferredDrugs
            });
        } catch (err) {
            if (drug.includes('+')) {
            // add the combination therapy as a new therapy defined by oncokb
                therapy = await conn.addTherapyCombination(source, drug, {matchSource: true});
            } else {
                throw err;
            }
        }
    }

    // get the evidence level and determine the relevance
    let level;
    if (levelName) {
        level = await conn.getUniqueRecordBy({
            endpoint: 'evidencelevels',
            where: {sourceId: levelName, source}
        });
    }
    const relevance = await getVocabulary(conn, relevanceName);

    // find/add the publications
    const pmids = support.filter(pmid => /^\d+$/.exec(pmid.trim()));
    const abstracts = [];

    for (const abstract of support.filter(pmid => !/^\d+$/.exec(pmid.trim()))) {
        let parsed;
        try {
            parsed = parseAbstractCitation(abstract);
        } catch (err) {
            // only report parsing error when statement will otherwise fail
            if (pmids.length < 1) {
                logger.warn(err);
            }
            continue;
        }
        try {
            const absRecord = await conn.getUniqueRecordBy({
                endpoint: 'abstracts',
                where: parsed
            });
            abstracts.push(absRecord);
        } catch (err) {
            logger.warn(err);
        }
    }
    const publications = await _pubmed.fetchAndLoadByIds(conn, pmids);

    const content = {
        impliedBy: [rid(variant)],
        supportedBy: [...publications.map(rid), ...abstracts.map(rid)],
        relevance: rid(relevance),
        source,
        reviewStatus: 'not required'
    };
    if (disease) {
        content.impliedBy.push(rid(disease));
    }
    if (appliesToTarget === 'drug') {
        content.appliesTo = rid(therapy);
    } else if (appliesToTarget === 'gene') {
        content.appliesTo = rid(variant.reference1);
    } else if (appliesToTarget === 'variant') {
        content.appliesTo = rid(variant);
    } else {
        throw new Error(`Unrecognized appliesToTarget (${appliesToTarget})`);
    }
    if (level) {
        content.evidenceLevel = rid(level);
    }
    // make the actual statement
    await conn.addRecord({
        endpoint: 'statements',
        content,
        existsOk: true,
        fetchExisting: false
    });
};


const parseActionableRecord = (rawRecord) => {
    checkSpec(actionableRecordSpec, rawRecord);

    const statements = [];
    let disease = rawRecord.cancerType.toLowerCase().trim();
    disease = DISEASE_MAPPING[disease] || disease;
    const variant = VOCABULARY_MAPPING[rawRecord.variant] || rawRecord.variant;
    const support = rawRecord.pmids.split(',').filter(pmid => pmid && pmid.trim());
    support.push(...(rawRecord.abstracts || '').split(';').filter(c => c.trim()));
    const relevance = rawRecord.level.startsWith('r')
        ? 'resistance'
        : 'sensitivity';

    for (const drug of Array.from(rawRecord.drugs.split(','), x => x.trim().toLowerCase()).filter(x => x.length > 0)) {
        statements.push({
            variantName: variant,
            _raw: rawRecord,
            gene: rawRecord.gene.toLowerCase().trim(),
            diseaseName: disease,
            drug,
            levelName: rawRecord.level,
            relevanceName: relevance,
            support,
            entrezGeneId: rawRecord.entrezGeneId,
            appliesToTarget: 'drug'
        });
    }

    return statements;
};


const parseAnnotatedRecord = (rawRecord) => {
    checkSpec(annotatedRecordSpec, rawRecord);
    const support = rawRecord.mutationEffectPmids
        .split(',')
        .filter(pmid => pmid && pmid.trim());
    const gene = rawRecord.gene.toLowerCase().trim();
    const variant = VOCABULARY_MAPPING[rawRecord.variant] || rawRecord.variant;

    support.push(...(rawRecord.mutationEffectAbstracts || '').split(';').filter(c => c.trim()));
    return [{
        _raw: rawRecord,
        relevanceName: rawRecord.mutationEffect.replace(/-/g, ' ').toLowerCase().trim(),
        gene,
        variantName: variant,
        support,
        entrezGeneId: rawRecord.entrezGeneId,
        appliesToTarget: 'gene'
    }, {
        _raw: rawRecord,
        variantName: variant,
        relevanceName: rawRecord.oncogenicity.toLowerCase().trim(),
        gene,
        support,
        entrezGeneId: rawRecord.entrezGeneId,
        appliesToTarget: 'variant'
    }];
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
            [record] = await _entrezGene.fetchAndLoadByIds(conn, [gene.entrezGeneId]);
            record = rid(record);
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
        drug.synonyms
            .filter(syn => syn.toLowerCase().trim() !== record.name)
            .forEach(syn => aliases.push([record, syn]));
    }

    const addAlias = async ([record, aliasName]) => {
        if (aliasName.toLowerCase().trim() === record.name) {
            return;
        }

        try {
            const alias = await conn.addRecord({
                endpoint: 'therapies',
                content: {
                    source,
                    name: aliasName,
                    sourceId: record.sourceId,
                    dependency: rid(record)
                },
                existsOk: true
            });
            await conn.addRecord({
                endpoint: 'AliasOf',
                content: {out: rid(record), in: rid(alias), source},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            logger.warn(`Failed to link alias ${record.sourceId} to ${aliasName} (${err})`);
        }
    };

    await Promise.all(aliases.map(addAlias));
};


const getVariantDescriptions = async (url) => {
    // grab all the variant details
    const variantMap = {};
    const variantRecords = await request(`${url}/variants`, {
        method: 'GET',
        json: true
    });
    for (const record of variantRecords) {
        try {
            checkSpec(variantSpec, record);
        } catch (err) {
            logger.error(err);
            continue;
        }
        const {alteration, name, gene: {entrezGeneId}} = record;
        if (alteration === name) {
            continue;
        }
        const key = `${entrezGeneId}:${name}`;
        const match = /^([A-Z])?(\d+)_([A-Z])?(\d+)(\S+)$/.exec(alteration);
        if (!match) {
            logger.error(`unexpected variant alteration pattern (${alteration})`);
        } else {
            const [, startAA, start, endAA, end, rawType] = match;
            const type = rawType.replace('splice', 'spl').replace('mis', '?');
            let variant = `p.(${startAA || '?'}${start}_${endAA || '?'}${end})${type}`;
            if (type === 'ins') {
                variant = `p.(${startAA || '?'}${start}_${endAA || '?'}${end})_(${startAA || '?'}${start}_${endAA || '?'}${end})${type}`;
            }
            variantMap[key] = {entrezGeneId, variant};
        }
    }
    return variantMap;
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
    const source = rid(await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    }));

    const variantMap = await getVariantDescriptions(URL);

    logger.info('pre-loading entrez genes');
    await _entrezGene.preLoadCache(conn);
    logger.info('pre-loading pubmed articles');
    await _pubmed.preLoadCache(conn);
    logger.info('load oncogene/tumour suppressor list');
    await uploadAllCuratedGenes({conn, baseUrl: URL, source});
    logger.info('load drug ontology');
    await uploadAllTherapies({conn, URL, source});
    await addEvidenceLevels(conn, source);

    const records = [];
    const counts = {errors: 0, success: 0, skip: 0};
    const errorList = [];
    // download and parse all variants
    for (const file of ['allActionableVariants', 'allAnnotatedVariants']) {
        logger.info(`loading: ${URL}/utils/${file}.json`);
        const result = await request({
            method: 'GET',
            json: true,
            uri: `${URL}/utils/${file}.json`
        });
        const parser = file === 'allActionableVariants'
            ? parseActionableRecord
            : parseAnnotatedRecord;

        logger.info(`loaded ${result.length} records`);
        for (const record of result) {
            try {
                records.push(...parser(record));
            } catch (err) {
                counts.errors++;
                errorList.push({...record, error: err.error || err, errorMessage: err.toString()});
            }
        }
    }
    // upload variant statements
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        logger.info(`processing (${i} / ${records.length})`);
        if (record.relevanceName === 'inconclusive') {
            counts.skip++;
            logger.info('skipping inconclusive statement');
            continue;
        }
        try {
            await processRecord({
                conn, source, record, variantMap
            });
            counts.success++;
        } catch (err) {
            counts.errors++;
            logger.error(err);
            if (err.toString().includes('Cannot convert undefined or null to object')) {
                console.log(record);
                throw err;
            }
            errorList.push({...record, error: err.error || err, errorMessage: err.toString()});
        }
    }
    const errorOutput = `${errorLogPrefix}-oncokb.json`;
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
