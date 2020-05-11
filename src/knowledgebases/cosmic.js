/**
 * @module importer/cosmic
 */
const fs = require('fs');

const { variant: { parse: variantParser } } = require('@bcgsc/knowledgebase-parser');

const {
    loadDelimToJson,
    convertRowFields,
    hashRecordToId,
} = require('./../util');
const {
    orderPreferredOntologyTerms,
    rid,
} = require('./../graphkb');
const _pubmed = require('./../entrez/pubmed');
const _gene = require('./../entrez/gene');
const { logger } = require('./../logging');

const { cosmic: SOURCE_DEFN } = require('./../sources');

const HEADER = {
    cds: 'CDS Mutation',
    disease: 'Histology Subtype 1',
    diseaseFamily: 'Histology',
    gene: 'Gene Name',
    mutationId: 'ID Mutation',
    protein: 'AA Mutation',
    pubmed: 'Pubmed Id',
    sampleId: 'Sample ID',
    sampleName: 'Sample Name',
    therapy: 'Drug Name',
    transcript: 'Transcript',
};


/**
 * Create and link the variant defuinitions for a single row/record
 */
const processVariants = async ({ conn, record, source }) => {
    let protein,
        cds;

    try {
        // get the hugo gene
        const [gene] = record.gene.split('_'); // convert MAP2K2_ENST00000262948 to MAP2K2
        const [reference1] = await _gene.fetchAndLoadBySymbol(conn, gene);
        // add the protein variant
        let variantString = record.protein;

        if (variantString.startsWith('p.') && variantString.includes('>')) {
            variantString = variantString.replace('>', 'delins');
        }
        const {
            noFeatures, multiFeature, prefix, ...variant
        } = variantParser(variantString, false);
        variant.reference1 = rid(reference1);
        variant.type = rid(await conn.getVocabularyTerm(variant.type));
        protein = rid(await conn.addVariant({
            content: { ...variant },
            existsOk: true,
            target: 'PositionalVariant',
        }));
    } catch (err) {
        logger.error(err);
        throw err;
    }

    // create the cds variant
    if (!record.cds.startsWith('c.?')) {
        let { cds: cdsNotation } = record;
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
                filters: { AND: [{ sourceId: record.transcript }, { biotype: 'transcript' }] },
                sort: orderPreferredOntologyTerms,
                target: 'Feature',
            }));
            // add the cds variant
            const {
                noFeatures, multiFeature, prefix, ...variant
            } = variantParser(cdsNotation, false);
            variant.reference1 = reference1;
            variant.type = rid(await conn.getVocabularyTerm(variant.type));
            cds = rid(await conn.addVariant({
                content: { ...variant },
                existsOk: true,
                target: 'PositionalVariant',
            }));
            await conn.addRecord({
                content: { in: protein, out: cds, source: rid(source) },
                existsOk: true,
                fetchExisting: false,
                target: 'Infers',
            });
        } catch (err) {
            logger.error(err);
        }
    }
    // create the catalog variant
    if (record.mutationId) {
        try {
            const catalog = await conn.addRecord({
                content: { source: rid(source), sourceId: record.mutationId },
                existsOk: true,
                target: 'CatalogueVariant',
            });
            await conn.addRecord({
                content: { in: cds || protein, out: catalog, source: rid(source) },
                existsOk: true,
                fetchExisting: false,
                target: 'Infers',
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
    const variantId = await processVariants({ conn, record, source });
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
        filters: { name: diseaseName },
        sort: orderPreferredOntologyTerms,
        target: 'Disease',
    });
    // create the resistance statement
    const relevance = await conn.getVocabularyTerm('resistance');
    await conn.addRecord({
        content: {
            conditions: [variantId, rid(disease), drug],
            evidence: [rid(record.publication)],
            relevance,
            reviewStatus: 'not required',
            source: rid(source),
            sourceId: record.sourceId,
            subject: drug,
        },
        existsOk: true,
        fetchExisting: false,
        target: 'Statement',
    });
};

/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({ filename, conn, errorLogPrefix }) => {
    const jsonList = await loadDelimToJson(filename);
    // get the dbID for the source
    const source = rid(await conn.addRecord({
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
        target: 'Source',
    }));
    const counts = { error: 0, skip: 0, success: 0 };
    const errorList = [];
    logger.info(`Processing ${jsonList.length} records`);
    // Upload the list of pubmed IDs
    await _pubmed.fetchAndLoadByIds(conn, jsonList.map(rec => rec[HEADER.pubmed]));

    for (let index = 0; index < jsonList.length; index++) {
        const sourceId = hashRecordToId(jsonList[index]);
        const record = { sourceId, ...convertRowFields(HEADER, jsonList[index]) };
        logger.info(`processing (${index} / ${jsonList.length}) ${sourceId}`);

        if (record.protein.startsWith('p.?')) {
            counts.skip++;
            continue;
        }
        record.publication = rid((await _pubmed.fetchAndLoadByIds(conn, [record.pubmed]))[0]);

        try {
            await processCosmicRecord(conn, record, source);
            counts.success++;
        } catch (err) {
            errorList.push({ error: err.toString(), record });
            logger.log('error', err);
            counts.error++;
        }
    }
    const errorJson = `${errorLogPrefix}-cosmic.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({ records: errorList }, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = { SOURCE_DEFN, kb: true, uploadFile };
