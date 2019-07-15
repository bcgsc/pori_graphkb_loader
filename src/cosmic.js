/**
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
    rid,
    INTERNAL_SOURCE_NAME
} = require('./util');
const _pubmed = require('./pubmed');
const {logger} = require('./logging');

const SOURCE_DEFN = {
    url: 'https://cancer.sanger.ac.uk/cosmic',
    name: 'cosmic',
    usage: 'https://cancer.sanger.ac.uk/cosmic/license',
    description: 'COSMIC, the Catalogue Of Somatic Mutations In Cancer, is the world\'s largest and most comprehensive resource for exploring the impact of somatic mutations in human cancer.'
};

const HEADER = {
    gene: 'Gene Name',
    mutation: 'AA Mutation',
    therapy: 'Drug Name',
    disease: 'Histology Subtype 1',
    pubmed: 'Pubmed Id',
    sampleName: 'Sample Name',
    sampleId: 'Sample ID',
    mutationId: 'ID Mutation'
};


const variantDefaults = {
    untemplatedSeq: null,
    break1Start: null,
    break1End: null,
    break2Start: null,
    break2End: null,
    refSeq: null,
    truncation: null,
    zygosity: null,
    germline: null,
    reference2: null
};


const getRecordId = record => `${record[HEADER.sampleName]}:${record[HEADER.sampleId]}:${record[HEADER.mutationId]}`;

const processCosmicRecord = async (conn, record, source) => {
    // get the hugo gene
    const gene = await conn.getUniqueRecordBy({
        endpoint: 'features',
        where: {name: record[HEADER.gene], source: {name: 'hgnc'}},
        sort: orderPreferredOntologyTerms
    });
    // add the protein variant
    let variantString = record[HEADER.mutation];
    if (variantString.startsWith('p.') && variantString.includes('>')) {
        variantString = variantString.replace('>', 'delins');
    }
    const {
        noFeatures, multiFeature, prefix, ...variant
    } = variantParser(variantString, false);
    variant.reference1 = rid(gene);
    variant.type = rid(await conn.getUniqueRecordBy({
        endpoint: 'vocabulary',
        where: {name: variant.type, source: {name: INTERNAL_SOURCE_NAME}}
    }));
    const variantId = rid(await conn.addRecord({
        endpoint: 'positionalvariants',
        content: {...variant},
        fetchConditions: {...variantDefaults, ...variant},
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
    const drug = await conn.getUniqueRecordBy({
        endpoint: 'therapies',
        where: {name: record[HEADER.therapy].toLowerCase().replace(/ - ns$/, '')},
        sort: preferredDrugs
    });
    // get the disease by name
    let diseaseName = record[HEADER.disease] === 'NS'
        ? record.Histology
        : record[HEADER.disease];
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
        where: {name: 'resistance', source: {name: INTERNAL_SOURCE_NAME}}
    });
    await conn.addRecord({
        endpoint: 'statements',
        content: {
            relevance,
            appliesTo: drug,
            impliedBy: [variantId, rid(disease)],
            supportedBy: [rid(record.publication)],
            source: rid(source),
            reviewStatus: 'not required',
            sourceId: getRecordId(record)
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
    logger.info(`Processing ${jsonList.length} records`);
    // Upload the list of pubmed IDs
    await _pubmed.uploadArticlesByPmid(conn, jsonList.map(rec => rec[HEADER.pubmed]));

    for (const record of jsonList) {
        if (record[HEADER.mutation] === 'p.?') {
            counts.skip++;
            continue;
        }
        record.publication = await _pubmed.fetchArticle(conn, record[HEADER.pubmed]);
        try {
            await processCosmicRecord(conn, record, source);
            counts.success++;
        } catch (err) {
            logger.log('warn', `failed to process ${getRecordId(record)}`);
            logger.log('error', err);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = {uploadFile, SOURCE_DEFN, type: 'kb'};
