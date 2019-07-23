/**
 * @module importer/cosmic
 */
const fs = require('fs');

const {variant: {parse: variantParser}} = require('@bcgsc/knowledgebase-parser');

const {
    preferredDiseases,
    loadDelimToJson,
    rid,
    convertRowFields,
    orderPreferredOntologyTerms
} = require('./util');
const _pubmed = require('./pubmed');
const _hgnc = require('./hgnc');
const {logger} = require('./logging');

const SOURCE_DEFN = {
    url: 'https://cancer.sanger.ac.uk/cosmic',
    displayName: 'COSMIC',
    name: 'cosmic',
    usage: 'https://cancer.sanger.ac.uk/cosmic/license',
    description: 'COSMIC, the Catalogue Of Somatic Mutations In Cancer, is the world\'s largest and most comprehensive resource for exploring the impact of somatic mutations in human cancer.'
};

const HEADER = {
    gene: 'Gene Name',
    protein: 'AA Mutation',
    therapy: 'Drug Name',
    diseaseFamily: 'Histology',
    disease: 'Histology Subtype 1',
    pubmed: 'Pubmed Id',
    sampleName: 'Sample Name',
    sampleId: 'Sample ID',
    mutationId: 'ID Mutation',
    transcript: 'Transcript',
    cds: 'CDS Mutation'
};


const getRecordId = record => `${record.sampleName}:${record.sampleId}:${record.mutationId}`;

/**
 * Create and link the variant defuinitions for a single row/record
 */
const processVariants = async ({conn, record, source}) => {
    let protein,
        cds;

    try {
        // get the hugo gene
        const [gene] = record.gene.split('_'); // convert MAP2K2_ENST00000262948 to MAP2K2
        const reference1 = rid(await _hgnc.fetchAndLoadBySymbol({conn, symbol: gene}));
        // add the protein variant
        let variantString = record.protein;
        if (variantString.startsWith('p.') && variantString.includes('>')) {
            variantString = variantString.replace('>', 'delins');
        }
        const {
            noFeatures, multiFeature, prefix, ...variant
        } = variantParser(variantString, false);
        variant.reference1 = reference1;
        variant.type = rid(await conn.getVocabularyTerm(variant.type));
        protein = rid(await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {...variant},
            existsOk: true
        }));
    } catch (err) {
        logger.error(err);
        throw err;
    }
    // create the cds variant
    if (!record.cds.startsWith('c.?')) {
        let {cds: cdsNotation} = record;
        const match = /^(.*[^ATCG])([ACTG]+)>([ATCG]+)$/.exec(cdsNotation);
        if (match) {
            const [, prefix, ref, alt] = match;
            if (ref.length > 1 || ref.length !== alt.length) {
                cdsNotation = `${prefix}del${ref}ins${alt}`;
            }
        }
        try {
        // get the hugo gene
            const reference1 = rid(await conn.getUniqueRecordBy({
                endpoint: 'features',
                where: {sourceId: record.transcript, biotype: 'transcript'},
                sort: orderPreferredOntologyTerms
            }));
            // add the cds variant
            const {
                noFeatures, multiFeature, prefix, ...variant
            } = variantParser(cdsNotation, false);
            variant.reference1 = reference1;
            variant.type = rid(await conn.getVocabularyTerm(variant.type));
            cds = rid(await conn.addVariant({
                endpoint: 'positionalvariants',
                content: {...variant},
                existsOk: true
            }));
            await conn.addRecord({
                endpoint: 'infers',
                content: {out: cds, in: protein, source: rid(source)},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            logger.error(err);
        }
    }
    // create the catalog variant
    if (record.mutationId) {
        try {
            const catalog = await conn.addRecord({
                endpoint: 'cataloguevariants',
                content: {source: rid(source), sourceId: record.mutationId},
                existsOk: true
            });
            await conn.addRecord({
                endpoint: 'infers',
                content: {out: catalog, in: cds || protein, source: rid(source)},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            logger.error(err);
        }
    }

    // return the protein variant
    return protein;
};

const processCosmicRecord = async (conn, record, source) => {
    // get the protein variant
    const variantId = await processVariants({conn, record, source});
    // get the drug by name
    const drug = await conn.getTherapy(record.therapy.toLowerCase().replace(/ - ns$/, ''));
    // get the disease by name
    let diseaseName = record.disease === 'NS'
        ? record.diseaseFamily
        : record.disease;
    diseaseName = diseaseName.replace(/_/g, ' ');
    diseaseName = diseaseName.replace('leukaemia', 'leukemia');
    diseaseName = diseaseName.replace('tumour', 'tumor');
    const disease = await conn.getUniqueRecordBy({
        endpoint: 'diseases',
        where: {name: diseaseName},
        sort: preferredDiseases
    });
    // create the resistance statement
    const relevance = await conn.getVocabularyTerm('resistance');
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
const uploadFile = async ({filename, conn, errorLogPrefix}) => {
    const jsonList = await loadDelimToJson(filename);
    // get the dbID for the source
    const source = rid(await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    }));
    const counts = {success: 0, error: 0, skip: 0};
    const errorList = [];
    logger.info(`Processing ${jsonList.length} records`);
    // Upload the list of pubmed IDs
    await _pubmed.uploadArticlesByPmid(conn, jsonList.map(rec => rec[HEADER.pubmed]));

    for (let index = 0; index < jsonList.length; index++) {
        const record = convertRowFields(HEADER, jsonList[index]);
        logger.info(`processing (${index} / ${jsonList.length}) ${getRecordId(record)}`);
        if (record.protein.startsWith('p.?')) {
            counts.skip++;
            continue;
        }
        record.publication = rid(await _pubmed.fetchArticle(conn, record.pubmed));
        try {
            await processCosmicRecord(conn, record, source);
            counts.success++;
        } catch (err) {
            errorList.push({record, error: err.toString()});
            logger.log('error', err);
            counts.error++;
        }
    }
    const errorJson = `${errorLogPrefix}-cosmic.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({records: errorList}, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = {uploadFile, SOURCE_DEFN, type: 'kb'};
