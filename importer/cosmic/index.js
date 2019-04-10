/**
 * | | |
 * | --- | --- |
 * | Source | COSMIC |
 * | About | https://cancer.sanger.ac.uk/cosmic/about |
 * | Source Type | Knowledgebase |
 * | Data Example | https://cancer.sanger.ac.uk/cosmic/download (CosmicResistanceMutations.tsv.gz) |
 * | Data Format | Tab-delimited|
 *
 * Import COSMIC resistance mutation statements
 *
 * Expects column names like
 * - Gene Name
 * - Transcript
 * - Census Gene
 * - Drug Name
 * - ID Mutation
 * - AA Mutation
 * - CDS Mutation
 * - Primary Tissue
 * - Tissue Subtype 1
 * - Tissue Subtype 2
 * - Histology
 * - Histology Subtype 1
 * - Histology Subtype 2
 * - Pubmed Id
 * - CGP Study
 * - Somatic Status
 * - Sample Type
 * - Zygosity
 * - Genome Coordinates (GRCh38)
 * - Tier
 *
 * @module importer/cosmic
 */
const {variant: {parse: variantParser}} = require('@bcgsc/knowledgebase-parser');

const {
    orderPreferredOntologyTerms,
    preferredDrugs,
    preferredDiseases,
    loadDelimToJson,
    rid
} = require('../util');
const {
    fetchArticle,
    uploadArticlesByPmid
} = require('../pubmed');
const {logger} = require('../logging');


const THERAPY_MAPPING = {
    'tyrosine kinase inhibitor - ns': 'tyrosine kinase inhibitor',
    'endocrine therapy': 'hormone therapy agent'
};

const {SOURCE_DEFN} = require('./constants');


const processCosmicRecord = async (conn, record, source) => {
    // get the hugo gene
    const gene = await conn.getUniqueRecordBy({
        endpoint: 'features',
        where: {name: record['Gene Name'], source: {name: 'hgnc'}},
        sort: orderPreferredOntologyTerms
    });
    // add the protein variant
    let variantString = record['AA Mutation'];
    if (variantString.startsWith('p.') && variantString.includes('>')) {
        variantString = variantString.replace('>', 'delins');
    }
    const {
        noFeatures, multiFeature, prefix, ...variant
    } = variantParser(variantString, false);
    variant.reference1 = rid(gene);
    variant.type = rid(await conn.getUniqueRecordBy({
        endpoint: 'vocabulary',
        where: {name: variant.type, source: {name: 'bcgsc'}}
    }));
    const variantId = rid(await conn.addRecord({
        endpoint: 'positionalvariants',
        content: variant,
        existsOk: true
    }));
    // get the enst transcript
    // const gene = await getRecordBy('features', {name: record['Transcript'], source: {name: 'ensembl'}, biotype: 'transcript'}, conn, orderPreferredOntologyTerms);
    // add the cds variant
    // get the chromosome
    // add the genome variant
    // link the variants
    // add the cosmic ID entry
    // link the cosmic ID to all variants
    // get the drug by name
    record['Drug Name'] = record['Drug Name'].toLowerCase();
    if (THERAPY_MAPPING[record['Drug Name']] !== undefined) {
        record['Drug Name'] = THERAPY_MAPPING[record['Drug Name']];
    }
    const drug = await conn.getUniqueRecordBy({
        endpoint: 'therapies',
        where: {name: record['Drug Name']},
        sort: preferredDrugs
    });
    // get the disease by name
    let diseaseName = record['Histology Subtype 1'] === 'NS'
        ? record.Histology
        : record['Histology Subtype 1'];
    diseaseName = diseaseName.replace(/_/g, ' ');
    diseaseName = diseaseName.replace('leukaemia', 'leukemia');
    diseaseName = diseaseName.replace('tumour', 'tumor');
    const disease = await conn.getUniqueRecordBy({
        endpoint: 'diseases',
        where: {name: diseaseName},
        sort: preferredDiseases
    });
    // create the resistance statement
    const relevance = await conn.getUniqueRecordBy({
        endpoint: 'vocabulary',
        where: {name: 'resistance', source: {name: 'bcgsc'}}
    });
    await conn.addRecord({
        endpoint: 'statements',
        content: {
            relevance,
            appliesTo: drug,
            impliedBy: [{target: variantId}, {target: rid(disease)}],
            supportedBy: [{target: rid(record.publication), source}],
            source: rid(source),
            reviewStatus: 'not required'
        },
        existsOk: true,
        fetchExisting: false
    });
};

/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const jsonList = await loadDelimToJson(filename);
    // get the dbID for the source
    const source = rid(await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    }));
    const counts = {success: 0, error: 0, skip: 0};
    const errorCache = {};
    logger.info(`Processing ${jsonList.length} records`);
    // Upload the list of pubmed IDs
    await uploadArticlesByPmid(conn, jsonList.map(rec => rec['Pubmed Id']));

    for (const record of jsonList) {
        if (record['AA Mutation'] === 'p.?') {
            counts.skip++;
            continue;
        }
        record.publication = await fetchArticle(conn, record['Pubmed Id']);
        try {
            await processCosmicRecord(conn, record, source);
            counts.success++;
        } catch (err) {
            logger.log('error', err);
            const {message} = (err.error || err);
            if (errorCache[message] === undefined) {
                errorCache[message] = err;
            }
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
    logger.info(`${Object.keys(errorCache).length} unique errors`);
};

module.exports = {uploadFile, SOURCE_DEFN};
