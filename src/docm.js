/**
 * Module to import variant information from http://www.docm.info/api
 *
 * @module importer/docm
 */
const request = require('request-promise');
const Ajv = require('ajv');
const jsonpath = require('jsonpath');

const {variant: {parse: variantParser}} = require('@bcgsc/knowledgebase-parser');

const {
    orderPreferredOntologyTerms, rid, INTERNAL_SOURCE_NAME
} = require('./util');
const _pubmed = require('./pubmed');
const {logger} = require('./logging');
const _hgnc = require('./hgnc');

const ajv = new Ajv();

const SOURCE_DEFN = {
    name: 'database of curated mutations',
    description: 'DoCM, the Database of Curated Mutations, is a highly curated database of known, disease-causing mutations that provides easily explorable variant lists with direct links to source citations for easy verification.',
    url: 'http://www.docm.info',
    usage: 'http://www.docm.info/terms'
};

const BASE_URL = 'http://www.docm.info/api/v1/variants';


const validateVariantSummarySpec = ajv.compile({
    type: 'object',
    properties: {
        hgvs: {type: 'string'},
        gene: {type: 'string'},
        amino_acid: {type: 'string', pattern: '^p\\..*'}
    }
});


/**
 * Parse DOCM specific protein notation into standard HGVS
 */
const parseDocmVariant = (variant) => {
    let match;
    if (match = /^p\.([A-Z]+)(\d+)-$/.exec(variant)) {
        const [, seq] = match;
        const pos = parseInt(match[2], 10);
        if (seq.length === 1) {
            return `p.${seq}${pos}del${seq}`;
        }
        return `p.${seq[0]}${pos}_${seq[seq.length - 1]}${pos + seq.length - 1}del${seq}`;
    } if (match = /^p\.([A-Z][A-Z]+)(\d+)([A-WYZ]+)$/.exec(variant)) { // ignore X since DOCM appears to use it to mean frameshift
        let [, refseq, pos, altSeq] = match;
        pos = parseInt(match[2], 10);
        let prefix = 0;
        for (let i = 0; i < refseq.length && i < altSeq.length; i++) {
            if (altSeq[i] !== refseq[i]) {
                break;
            }
            prefix++;
        }
        pos += prefix;
        refseq = refseq.slice(prefix);
        altSeq = altSeq.slice(prefix);
        if (refseq.length !== 0 && altSeq.length !== 0) {
            if (refseq.length > 1) {
                return `p.${refseq[0]}${pos}_${refseq[refseq.length - 1]}${pos + refseq.length - 1}del${refseq}ins${altSeq}`;
            }
            return `p.${refseq[0]}${pos}del${refseq}ins${altSeq}`;
        }
    }
    return variant;
};


const processRecord = async (opt) => {
    const {
        conn, source
    } = opt;
    const {details, ...record} = opt.record;
    // get the feature by name
    const gene = await _hgnc.fetchAndLoadBySymbol({conn, symbol: record.gene});
    // get the record details
    const counts = {error: 0, success: 0, skip: 0};

    // get the variant
    let {
        noFeatures, prefix, multiFeature, ...variant
    } = variantParser(parseDocmVariant(record.amino_acid), false);

    const variantType = await conn.getUniqueRecordBy({
        endpoint: 'vocabulary',
        where: {name: variant.type, source: {name: INTERNAL_SOURCE_NAME}}
    });
    const defaults = {
        untemplatedSeq: null,
        break1Start: null,
        break1End: null,
        break2Start: null,
        break2End: null,
        refSeq: null,
        truncation: null,
        zygosity: null,
        germline: null
    };
    variant.reference1 = rid(gene);
    variant.type = rid(variantType);
    // create the variant
    variant = await conn.addRecord({
        endpoint: 'positionalvariants',
        content: variant,
        existsOk: true,
        getConditions: Object.assign(defaults, variant)
    });

    for (const diseaseRec of details.diseases) {
        if (!diseaseRec.tags || diseaseRec.tags.length !== 1) {
            counts.skip++;
            continue;
        }
        try {
            // get the vocabulary term
            const relevance = await conn.getUniqueRecordBy({
                endpoint: 'vocabulary',
                where: {name: diseaseRec.tags[0], source: {name: INTERNAL_SOURCE_NAME}}
            });
            // get the disease by name
            const disease = await conn.getUniqueRecordBy({
                endpoint: 'diseases',
                where: {
                    sourceId: `doid:${diseaseRec.doid}`,
                    name: diseaseRec.disease,
                    source: {name: 'disease ontology'}
                },
                sort: orderPreferredOntologyTerms
            });
            // get the pubmed article
            const publication = await _pubmed.fetchArticle(conn, diseaseRec.source_pubmed_id);
            // now create the statement
            await conn.addRecord({
                endpoint: 'statements',
                content: {
                    impliedBy: [{target: rid(disease)}, {target: rid(variant)}],
                    supportedBy: [{target: rid(publication), source: rid(source)}],
                    relevance: rid(relevance),
                    appliesTo: rid(disease),
                    source: rid(source),
                    reviewStatus: 'not required',
                    sourceId: record.hgvs
                },
                existsOk: true,
                fetchExisting: false
            });
            counts.success++;
        } catch (err) {
            logger.error((err.error || err).message);
            console.error(err);
            counts.error++;
        }
    }
    return counts;
};


/**
 * Uses the DOCM API to pull content, parse it and load it into GraphKB
 *
 * @param {object} opt options
 * @param {ApiConnection} opt.conn the api connection object for GraphKB
 * @param {string} [opt.url] the base url for the DOCM api
 */
const upload = async (opt) => {
    const {conn} = opt;
    // load directly from their api:
    logger.info(`loading: ${opt.url || BASE_URL}.json`);
    const recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${BASE_URL}.json`
    });
    logger.info(`loaded ${recordsList.length} records`);
    // add the source node
    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });

    const counts = {
        error: 0, success: 0, skip: 0, highlight: 0
    };
    const filtered = [];
    const pmidList = new Set();

    for (const record of recordsList) {
        if (!validateVariantSummarySpec(record)) {
            logger.error(
                `Spec Validation failed for actionable record #${
                    validateVariantSummarySpec.errors[0].dataPath
                } ${
                    validateVariantSummarySpec.errors[0].message
                } found ${
                    jsonpath.query(record, `$${validateVariantSummarySpec.errors[0].dataPath}`)
                }`
            );
            counts.error++;
            continue;
        }
        if (record.drug_interactions) {
            logger.warn(`Found a record with drug interactions! ${JSON.stringify(record)}`);
            counts.highlight++;
        }
        logger.info(`loading: ${BASE_URL}/${record.hgvs}.json`);
        const details = await request({
            method: 'GET',
            json: true,
            uri: `${BASE_URL}/${record.hgvs}.json`
        });
        record.details = details;

        filtered.push(record);
        for (const diseaseRec of details.diseases) {
            if (diseaseRec.source_pubmed_id) {
                pmidList.add(`${diseaseRec.source_pubmed_id}`);
            }
        }
    }
    logger.info(`loading ${pmidList.size} pubmed articles`);
    await _pubmed.uploadArticlesByPmid(conn, pmidList);
    logger.info(`processing ${filtered.length} remaining docm records`);
    for (const record of filtered) {
        logger.info(record.hgvs);
        try {
            const updates = await processRecord({
                conn, source, record
            });
            counts.success += updates.success;
            counts.error += updates.error;
            counts.skip += updates.skip;
        } catch (err) {
            counts.error++;
            console.error(err);
            logger.error((err.error || err).message);
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = {upload, SOURCE_DEFN, type: 'kb'};
