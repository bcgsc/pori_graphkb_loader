/* eslint-disable one-var */
const fs = require('fs');

const { jsonifyVariant, parseVariant } = require('@bcgsc-pori/graphkb-parser');

const {
    loadDelimToJson,
    hashRecordToId,
} = require('../util');
const {
    // eslint-disable-next-line no-unused-vars
    ApiConnection,
    orderPreferredOntologyTerms,
    rid,
} = require('../graphkb');
const _refseq = require('../entrez/refseq');
const { logger } = require('../logging');

const {
    cgl: SOURCE_DEFN,
    entrezGene: ENTREZGENE_SOURCE_DEFN,
    refseq: REFSEQ_SOURCE_DEFN,
} = require('../sources');


const getTranscript = async (graphkbConn, transcriptId) => {
    let newVersionedTranscript = false;
    let reference1;

    const unversionedId = transcriptId.split('.')[0];
    const version = transcriptId.split('.')[1];

    try {
        // Try to fetch from GraphKB first
        reference1 = await graphkbConn.getUniqueRecordBy({
            filters: {
                AND: [
                    { source: { filters: { name: REFSEQ_SOURCE_DEFN.name }, target: 'Source' } },
                    { sourceId: unversionedId },
                    { sourceIdVersion: version || null },
                    { biotype: 'transcript' },
                ],
            },
            target: 'Feature',
        });
    } catch (err) {
        // If it fail, try to fetch from RefSeq instead
        if (version) {
            const transcripts = await _refseq.fetchAndLoadByIds(graphkbConn, [transcriptId]);

            if (transcripts.length !== 1) {
                throw new Error(`unable to find unique transcript (${transcriptId}) from RefSeq (found: ${transcripts.length})`);
            }
            [reference1] = transcripts;
            newVersionedTranscript = true;
        }
    }

    // If a new versioned transcript gets added,
    // make sure it is linked to the corresponding unversioned transcript
    let reference0;

    if (version && newVersionedTranscript) {
        // unversioned transcript
        try {
            reference0 = await getTranscript(graphkbConn, unversionedId); // recursive call
        } catch (err) {
            logger.warn(`Unable to fetch unversionized transcript ${transcriptId}`);
        }

        // GeneralizationOf edge
        if (reference0) {
            try {
                await graphkbConn.addRecord({
                    content: { in: rid(reference1), out: rid(reference0) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'GeneralizationOf',
                });
                logger.info(`link: unversioned transcript ${rid(reference0)} to versioned transcript ${rid(reference1)}`);
            } catch (err) {
                logger.warn(`failed to link the unversionized transcript ${err}`);
            }
        }
    }

    return reference1;
};

const loadCdsVariant = async (graphkbConn, transcriptId, cdsNotation) => {
    if (!cdsNotation.startsWith('c.')) {
        throw new Error(`invalid HGVSc notation (${cdsNotation})`);
    }

    // get the reference
    const reference1 = await getTranscript(graphkbConn, transcriptId);

    // get the object representation of the variant from parsing
    const {
        noFeatures, multiFeature, prefix, ...variant
    } = parseVariant(cdsNotation, false);
    variant.reference1 = reference1;
    variant.type = rid(await graphkbConn.getVocabularyTerm(variant.type));

    // add the cds variant
    const cds = rid(await graphkbConn.addVariant({
        content: { ...jsonifyVariant(variant) },
        existsOk: true,
        target: 'PositionalVariant',
    }));
    logger.info(`cds: ${transcriptId} ${cdsNotation}; PositionalVariant ${cds}`);

    return cds;
};


const loadProteinVariant = async (graphkbConn, gene, proteinNotation) => {
    if (!proteinNotation) {
        return null;
    }
    if (!proteinNotation.startsWith('p.')) {
        throw new Error(`invalid HGVSp notation (${proteinNotation})`);
    }
    if (proteinNotation[proteinNotation.length - 1] === '=') {
        throw new Error(`unsupported wildtype variant (${proteinNotation})`);
    }
    let proteinNotationFixed = proteinNotation.replace(/^p\.\(/, 'p.').replace(/\)$/, '');

    if (!proteinNotationFixed.includes('fs')) {
        proteinNotationFixed = proteinNotationFixed.replace(/\*$/, 'Ter');
    }
    const reference1 = await graphkbConn.getUniqueRecordBy({
        filters: [
            { name: gene },
            { biotype: 'gene' },
            { source: { filters: { name: ENTREZGENE_SOURCE_DEFN.name }, target: 'Source' } },
        ],
        target: 'Feature',
    });

    // get the object representation of the variant from parsing
    const {
        noFeatures, multiFeature, prefix, ...variant
    } = parseVariant(proteinNotationFixed, false);
    variant.reference1 = reference1;
    variant.type = rid(await graphkbConn.getVocabularyTerm(variant.type));

    // add the protein variant
    const protein = rid(await graphkbConn.addVariant({
        content: { ...jsonifyVariant(variant) },
        existsOk: true,
        target: 'PositionalVariant',
    }));
    logger.info(`protein: ${gene} ${proteinNotation}; PositionalVariant ${protein}`);

    return protein;
};


const loadGenomicVariant = async (graphkbConn, chromosome, position, ref, alt) => {
    if (!ref.length || !alt.length || !position || !chromosome) {
        return null;
    }
    let notation;

    if (ref.length === alt.length && ref.length === 1) {
        notation = `g.${position}${ref}>${alt}`;
    } else {
        if (ref[0] !== alt[0]) {
            throw new Error(`unexpected ref (${ref}) vs alt (${alt}) combination, do not match on first base`);
        }
        let [start, end] = position.split('_').map(p => Number.parseInt(p, 10));
        const refTrunc = ref.slice(1);
        const altTrunc = alt.slice(1);

        if (!refTrunc.length) {
            // insertion or duplication
            if (!end) {
                end = start + 1;
            }
            notation = `g.${start}_${end}ins${refTrunc}`;
        } else if (!altTrunc.length) {
            // deletion
            if (refTrunc.length > 1) {
                if (!end) {
                    end = start + refTrunc.length - 1;
                }
                if (refTrunc.length !== end - start + 1) {
                    throw new Error(`deletion position (${position}) span (${end - start + 1}) does not match the length of reference sequence (${ref.length}) deleted`);
                }
            }
            end = (!end || end === start)
                ? ''
                : `_${end}`;
            notation = `g.${start}${end}del${refTrunc}`;
        } else {
            // indel
            if (refTrunc.length > 1) {
                if (!end) {
                    end = start + refTrunc.length - 1;
                }
                if (refTrunc.length !== end - start + 1) {
                    throw new Error(`indel position (${position}) span (${end - start + 1}) does not match the length of reference sequence (${ref.length}) deleted`);
                }
            }
            end = (!end || end === start)
                ? ''
                : `_${end}`;
            notation = `g.${start}${end}del${refTrunc}ins${altTrunc}`;
        }
    }
    const reference1 = await graphkbConn.getUniqueRecordBy({
        filters: [
            { OR: [{ name: chromosome }, { sourceId: chromosome }] },
            {
                biotype: 'chromosome',
            },
        ],
        target: 'Feature',
    });

    // get the object representation of the variant from parsing
    const {
        noFeatures, multiFeature, prefix, ...variant
    } = parseVariant(notation, false);
    variant.reference1 = reference1;
    variant.type = rid(await graphkbConn.getVocabularyTerm(variant.type));

    // add the genomic variant
    const genomic = rid(await graphkbConn.addVariant({
        content: { ...jsonifyVariant(variant), assembly: 'hg19' },
        existsOk: true,
        target: 'PositionalVariant',
    }));
    logger.info(`genomic: ${chromosome}, ${position}, ${ref}, ${alt}; Parsed as ${notation}; PositionalVariant ${genomic}`);

    return genomic;
};


/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({ filename, conn, errorLogPrefix }) => {
    logger.warn(`
    ATTENTION!
    All genomic variants are assumed to be:
    - reported on the hg19/GRCh37 genome assembly;
    - following the HGVS 3'-rule, not the VCF 5'-rule
      (conversion needed from 'position' to 'pos_CGL')`);

    const counts = { error: 0, skip: 0, success: 0 };
    const errorList = [];

    // Input file
    const jsonList = await loadDelimToJson(filename);
    logger.info(`Processing ${jsonList.length} records`);

    // source, disease & relevance RIDs
    const relevance = await conn.getVocabularyTerm('pathogenic');
    const source = rid(await conn.addSource(SOURCE_DEFN));
    const disease = await conn.getUniqueRecordBy({
        filters: {
            name: 'cancer',
        },
        sort: orderPreferredOntologyTerms,
        target: 'Disease',
    });

    // load all transcripts
    // (entrez sometimes misses requests for single ones for some reason)
    logger.info('loading all transcripts');
    await _refseq.preLoadCache(conn);

    // Main loop over records
    for (let index = 0; index < jsonList.length; index++) {
        const sourceId = hashRecordToId(jsonList[index]);
        const record = jsonList[index];
        logger.verbose(`processing (${index} / ${jsonList.length}) ${sourceId}`);

        /** Uploading variant in CDS, protein and genomic format */
        let protein,
            cds,
            genomic;

        try {
            cds = await loadCdsVariant(conn, record.transcript, record.coding_hgvs);
        } catch (err) {
            logger.warn(`failed to load the cds variant (${record.transcript}:${record.coding_hgvs}) ${err}`);
        }

        try {
            protein = await loadProteinVariant(conn, record.gene, record.protein_hgvs);
        } catch (err) {
            logger.warn(`failed to load the protein variant (${record.gene}:${record.protein_hgvs}) ${err}`);
        }

        try {
            genomic = await loadGenomicVariant(
                conn, record.chr_CGL, record.pos_CGL, record.ref, record.alt,
            );
        } catch (err) {
            logger.warn(`failed to create genomic representation of variant (${record.chromosome}:g.${record.position}${record.ref}>${record.alt}): ${err}`);
        }

        /** Linking variants together with 'Infers' edges */
        if (protein && cds) {
            try {
                await conn.addRecord({
                    content: { in: rid(protein), out: rid(cds) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'Infers',
                });
                logger.info(`link: cds ${rid(cds)} to protein ${rid(protein)}`);
            } catch (err) {
                logger.warn(`failed to link the protein variant to the cds one. ${err}`);
            }
        }

        if (genomic) {
            if (cds) {
                try {
                    await conn.addRecord({
                        content: { in: rid(cds), out: rid(genomic) },
                        existsOk: true,
                        fetchExisting: false,
                        target: 'Infers',
                    });
                    logger.info(`link: genomic ${rid(genomic)} to cds ${rid(cds)}`);
                } catch (err) {
                    logger.warn(`failed to link the genomic variant to the cds one. ${err}`);
                }
            }

            if (protein) {
                try {
                    await conn.addRecord({
                        content: { in: rid(protein), out: rid(genomic) },
                        existsOk: true,
                        fetchExisting: false,
                        target: 'Infers',
                    });
                    logger.info(`link: genomic ${rid(genomic)} to protein ${rid(protein)}`);
                } catch (err) {
                    logger.warn(`failed to link the genomic variant to the protein one. ${err}`);
                }
            }
        }


        /** Loading statement */
        try {
            const variant = protein || cds || genomic;

            if (!variant) {
                throw new Error('unable to load any variants');
            }

            await conn.addRecord({
                content: {
                    conditions: [rid(variant), rid(disease)],
                    description: 'reviewed by Clinical Molecular Geneticist at CGL',
                    evidence: [rid(source)],
                    relevance: rid(relevance),
                    source: rid(source),
                    subject: rid(disease),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'Statement',
            });
            counts.success++;
        } catch (err) {
            logger.error(`${record.gene}:${record.protein_hgvs} ${record.transcript}:${record.coding_hgvs}`);
            logger.error(err);
            counts.error++;
            continue;
        }
    }
    const errorJson = `${errorLogPrefix}-cgl.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({ records: errorList }, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = { uploadFile };
