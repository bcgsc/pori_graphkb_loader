/**
 * Module to import variant information from http://www.docm.info/api
 *
 * @module importer/docm
 */
const request = require('request-promise');
const Ajv = require('ajv');
const fs = require('fs');

const {variant: {parse: variantParser}} = require('@bcgsc/knowledgebase-parser');

const {
    orderPreferredOntologyTerms, rid, checkSpec
} = require('./util');
const _pubmed = require('./pubmed');
const {logger} = require('./logging');
const _hgnc = require('./hgnc');

const ajv = new Ajv();

const SOURCE_DEFN = {
    name: 'database of curated mutations',
    displayName: 'DoCM',
    description: 'DoCM, the Database of Curated Mutations, is a highly curated database of known, disease-causing mutations that provides easily explorable variant lists with direct links to source citations for easy verification.',
    url: 'http://www.docm.info',
    usage: 'http://www.docm.info/terms'
};

const BASE_URL = 'http://www.docm.info/api/v1/variants';


const variantSummarySpec = ajv.compile({
    type: 'object',
    required: ['hgvs'],
    properties: {
        hgvs: {type: 'string'}
    }
});


const recordSpec = ajv.compile({
    type: 'object',
    required: ['reference_version', 'hgvs', 'gene', 'reference', 'variant', 'start', 'stop', 'variant_type'],
    properties: {
        hgvs: {type: 'string'},
        gene: {type: 'string'},
        amino_acid: {type: 'string', pattern: '^p\\..*'},
        reference_version: {type: 'string'},
        reference: {type: 'string', pattern: '^([ATGC]*|-)$'},
        variant: {type: 'string', pattern: '^([ATGC]*|-)$'},
        start: {type: 'number', min: 1},
        stop: {type: 'number', min: 1},
        chromosome: {type: 'string'},
        variant_type: {type: 'string', enum: ['SNV', 'DEL', 'INS', 'DNV']}
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


const buildGenomicVariant = ({
    reference, variant, chromosome, start, stop, variant_type: variantType
}) => {
    if (variantType === 'SNV') {
        return `${chromosome}:g.${start}${reference}>${variant}`;
    } if (variantType === 'DEL') {
        if (start === stop) {
            return `${chromosome}:g.${start}del${reference}`;
        }
        return `${chromosome}:g.${start}_${stop}del${reference}`;
    } if (variantType === 'INS') {
        return `${chromosome}:g.${start}_${stop}ins${variant}`;
    }
    if (start === stop) {
        return `${chromosome}:g.${start}del${reference}ins${variant}`;
    }
    return `${chromosome}:g.${start}_${stop}del${reference}ins${variant}`;
};

/**
 * Create the protein and genomic variants
 */
const processVariants = async ({conn, source, record: docmRecord}) => {
    const {
        amino_acid: aminoAcid,
        gene,
        chromosome,
        reference_version: assembly,
        start,
        stop
    } = docmRecord;
    // get the feature by name
    let protein,
        genomic;

    try {
        // create the protein variant
        const reference1 = await _hgnc.fetchAndLoadBySymbol({conn, symbol: gene});
        let {
            noFeatures, prefix, multiFeature, ...variant
        } = variantParser(parseDocmVariant(aminoAcid), false);
        const type = await conn.getVocabularyTerm({term: variant.type});
        protein = variant = await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {...variant, type, reference1: rid(reference1)},
            existsOk: true
        });
    } catch (err) {
        logger.error(`Failed to process protein notation (${gene}:${aminoAcid})`);
        throw err;
    }

    try {
        // create the genomic variant
        let {
            noFeatures, prefix, multiFeature, ...variant
        } = variantParser(buildGenomicVariant(docmRecord), false);
        const type = await conn.getVocabularyTerm({term: variant.type});
        const reference1 = await conn.getUniqueRecordBy({
            endpoint: 'features',
            where: {
                sourceId: chromosome,
                name: chromosome,
                or: 'name,sourceId',
                biotype: 'chromosome'
            },
            sortFunc: orderPreferredOntologyTerms
        });
        genomic = variant = await conn.addVariant({
            endpoint: 'positionalvariants',
            content: {
                ...variant, type, reference1: rid(reference1), assembly: assembly.toLowerCase().trim()
            },
            existsOk: true
        });
    } catch (err) {
        logger.error(`Failed to process genomic notation (${chromosome}.${assembly}:g.${start}_${stop})`);
        logger.error(err);
    }
    // TODO: create the cds variant? currently unclear if cdna or cds notation
    // link the variants together
    if (genomic) {
        await conn.addRecord({
            endpoint: 'infers',
            content: {out: rid(genomic), in: rid(protein), source: rid(source)},
            existsOk: true,
            fetchExisting: false
        });
    }
    // return the protein variant
    return protein;
};


const processRecord = async (opt) => {
    const {
        conn, source, record
    } = opt;
    // get the record details
    const counts = {error: 0, success: 0, skip: 0};

    // get the variant
    const variant = await processVariants({conn, source, record});

    if (!variant) {
        throw new Error('Failed to parse either variant');
    }

    for (const diseaseRec of record.diseases) {
        if (!diseaseRec.tags || diseaseRec.tags.length !== 1) {
            counts.skip++;
            continue;
        }
        try {
            // get the vocabulary term
            const relevance = await conn.getVocabularyTerm({term: diseaseRec.tags[0], conn});
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
                    impliedBy: [rid(disease), rid(variant)],
                    supportedBy: [rid(publication)],
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

    for (const summaryRecord of recordsList) {
        try {
            checkSpec(variantSummarySpec, summaryRecord);
        } catch (err) {
            logger.error(err);
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
    for (let index = 0; index < filtered.length; index++) {
        const record = filtered[index];
        logger.info(`(${index} / ${filtered.length}) ${record.hgvs}`);
        try {
            checkSpec(recordSpec, record);
            // replace - as empty
            record.reference = record.reference.replace('-', '');
            record.variant = record.variant.replace('-', '');
            const updates = await processRecord({
                conn, source, record
            });
            counts.success += updates.success;
            counts.error += updates.error;
            counts.skip += updates.skip;
        } catch (err) {
            errorList.push({record, error: err});
            counts.error++;
            console.error((err.error || err));
            logger.error((err.error || err).message);
        }
    }
    logger.info(JSON.stringify(counts));
    const errorsJSON = `${errorLogPrefix}-docm.json`;
    logger.info(`writing: ${errorsJSON}`);
    fs.writeFileSync(errorsJSON, JSON.stringify({records: errorList}, null, 2));
};

module.exports = {
    upload, SOURCE_DEFN, type: 'kb', specs: {variantSummarySpec, recordSpec}
};
