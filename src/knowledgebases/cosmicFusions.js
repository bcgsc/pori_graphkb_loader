/**
 * @module importer/cosmic
 */
const fs = require('fs');
const _ = require('lodash');

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
const _refseq = require('./../entrez/refseq');
const _ensembl = require('./../ensembl');
const { loadClassifications, processDisease } = require('./cosmic');

const { logger } = require('./../logging');
const { cosmic: SOURCE_DEFN } = require('./../sources');

const RECURRENCE_THRESHOLD = 3;

const HEADER = {
    disease: 'HISTOLOGY_SUBTYPE_1',
    diseaseFamily: 'PRIMARY_HISTOLOGY',
    exon1: '5\'_LAST_OBSERVED_EXON',
    exon2: '3\'_FIRST_OBSERVED_EXON',
    fusionId: 'FUSION_ID',
    fusionName: 'TRANSLOCATION_NAME',
    gene1: '5\'_GENE_NAME',
    gene2: '3\'_GENE_NAME',
    pubmed: 'PUBMED_PMID',
    sampleId: 'SAMPLE_ID',
};

const parseFusionName = (name) => {
    let match;

    if (match = /^(?<gene1>\w+){(?<transcript1>[^}]+)}:r\.1_(?<break1>\d+([-+](\d+|\?))?)_(?<gene2>\w+){(?<transcript2>[^}]+)}:r.(?<break2>\d+([-+](\d+|\?))?)_\d+$/.exec(name)) {
        return match.groups;
    } if (match = /^(\w+){([^}]+)}:r\.\?_(\w+){([^}]+)}:r.\?$/.exec(name)) {
        const [, gene1, transcript1, gene2, transcript2] = match;
        return {
            break1: null, break2: null, gene1, gene2, transcript1, transcript2,
        };
    }

    throw new Error(`Fusion Name format not recognized (${name})`);
};


const fetchTranscript = async (conn, name) => {
    const match = /^(NM_\d+)(\.(\d+))?$/.exec(name);

    if (match) {
        const [, sourceId,, sourceIdVersion] = match;

        try {
            const transcript = await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { biotype: 'transcript' },
                        { source: { filters: { name: _refseq.SOURCE_DEFN.name }, target: 'Source' } },
                        { sourceId },
                        { sourceIdVersion },
                    ],
                },
                sort: orderPreferredOntologyTerms,
                target: 'Feature',
            });
            return transcript;
        } catch (err) {
            // pull directly from refseq
            const [transcript] = await _refseq.fetchAndLoadByIds(conn, [name]);
            return transcript;
        }
    }
    return conn.getUniqueRecordBy({
        filters: {
            AND: [
                { biotype: 'transcript' },
                { source: { filters: { name: _ensembl.SOURCE_DEFN.name }, target: 'Source' } },
                { sourceId: name },
                { sourceIdVersion: null },
            ],
        },
        sort: orderPreferredOntologyTerms,
        target: 'Feature',
    });
};


const parseRnaPosition = (pos) => {
    const match = /^(\d+)([-+](\d+|\?))?$/.exec(pos);

    if (!match) {
        throw new Error(`failed to parse rna position (${pos})`);
    }
    const [, start, offsetRaw] = match;
    let offset = offsetRaw || '';

    if (offsetRaw && offsetRaw.startsWith('+')) {
        offset = offsetRaw.slice(1);
    }
    if (offset.includes('?')) {
        offset = null;
    } else if (offset === '') {
        offset = 0;
    }

    return {
        '@class': 'RnaPosition',
        offset,
        pos: start,
    };
};


const processVariants = async ({
    conn, record, variantType, source, geneOnly,
}) => {
    const parsed = parseFusionName(record.fusionName);

    // fetch the features
    const [transcript1, transcript2] = await Promise.all(
        [parsed.transcript1, parsed.transcript2].map(async tname => fetchTranscript(conn, tname)),
    );
    // fetch the features
    const [gene1] = await _gene.fetchAndLoadBySymbol(conn, parsed.gene1);
    const [gene2] = await _gene.fetchAndLoadBySymbol(conn, parsed.gene2);

    await Promise.all([
        conn.addRecord({
            content: { in: rid(gene1), out: rid(transcript1), source },
            existsOk: true,
            fetchExisting: false,
            target: 'ElementOf',
        }),
        conn.addRecord({
            content: { in: rid(gene2), out: rid(transcript2), source },
            existsOk: true,
            fetchExisting: false,
            target: 'ElementOf',
        }),
    ]);

    // create the variants
    const general = await conn.addRecord({
        content: {
            reference1: rid(gene1),
            reference2: rid(gene2),
            type: variantType,
        },
        existsOk: true,
        target: 'CategoryVariant',
    });
    let specific;

    if ((parsed.break1 || parsed.break2) && !geneOnly) {
        specific = await conn.addRecord({
            content: {
                break1Start: parseRnaPosition(parsed.break1),
                break2Start: parseRnaPosition(parsed.break2),
                displayName: `(${gene1.displayName},${gene2.displayName}):fusion(r.${parsed.break1},r.${parsed.break2})`,
                reference1: transcript1,
                reference2: transcript2,
                type: variantType,
            },
            existsOk: true,
            target: 'PositionalVariant',
        });
        await conn.addRecord({
            content: {
                in: rid(general),
                out: rid(specific),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'Inters',
        });
    }
    return specific || general;
};


const processCosmicRecord = async ({
    conn, record, source, relevance, variantType, geneOnly, diseaseSpecific,
}) => {
    // get the disease name
    const disease = rid(await processDisease(conn, record));
    const publications = await _pubmed.fetchAndLoadByIds(conn, record.publications);

    const variant = rid(await processVariants({
        conn, geneOnly, record, source, variantType,
    }));


    // create the recurrence statement
    await conn.addRecord({
        content: {
            conditions: [variant, disease],
            evidence: publications.map(rid),
            relevance,
            reviewStatus: 'not required',
            source: rid(source),
            sourceId: record.sourceId,
            subject: disease,
        },
        existsOk: true,
        fetchExisting: false,
        target: 'Statement',
    });
};


const createGeneReccurrenceId = (record) => {
    const {
        fusionName, disease1, disease2, disease3, disease4,
    } = record;
    const patt = /([^_{}]+){[^}]+}:((r\.\?)|(r\.[^_]+_[^_]+))/g;
    const genes = [];
    let match = patt.exec(fusionName);

    while (match) {
        const [, gene] = match;
        genes.push(gene);
        match = patt.exec(fusionName);
    }
    const geneRecId = hashRecordToId({
        disease1, disease2, disease3, disease4, genes,
    });
    return geneRecId;
};

/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({
    filename, conn, mappingFilename, errorLogPrefix,
}) => {
    const jsonList = await loadDelimToJson(filename);
    const mapping = await loadClassifications(mappingFilename);
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

    const recurrenceCounts = {}; // position specific fusions
    const diseaseGeneRecurrence = {}; // gene only but disease specific
    const geneRecurrence = {}; // gene only and not disease specific
    const records = jsonList.map(row => convertRowFields(HEADER, row));
    const relevance = rid(await conn.getVocabularyTerm('recurrent'));
    const variantType = rid(await conn.getVocabularyTerm('fusion'));

    await _pubmed.fetchAndLoadByIds(conn, records.map(rec => rec.pumbed));

    // pre-process/clean records
    for (const record of records) {
        record.ncit = (mapping[record.diseaseFamily] || {})[record.disease];

        record.disease = record.disease.toUpperCase() === 'NS'
            ? ''
            : record.disease;

        record.diseaseFamily = record.diseaseFamily.toUpperCase() === 'NS'
            ? ''
            : record.diseaseFamily;

        if (!record.disease && !record.diseaseFamily) {
            record.diseaseFamily = 'cancer';
        }

        [record.gene1] = record.gene1.split('_');
        [record.gene2] = record.gene2.split('_');
    }

    // find recurrence 'counts'
    for (const record of records) {
        const {
            fusionName, fusionId, diseaseFamily, disease, gene1, gene2, exon1, exon2,
        } = record;

        if (!fusionName) {
            continue;
        }
        const recurrenceId = hashRecordToId({
            disease, diseaseFamily, fusionId, fusionName,
        });

        if (recurrenceCounts[recurrenceId] === undefined) {
            recurrenceCounts[recurrenceId] = [];
        }
        recurrenceCounts[recurrenceId].push(record);

        // simple recc
        if (!gene1 || !gene2) {
            // cannot do gene level counts for non-gene fusions
            continue;
        }
        const geneRecId = hashRecordToId({
            disease, diseaseFamily, exon1, exon2, gene1, gene2,
        });

        if (diseaseGeneRecurrence[geneRecId] === undefined) {
            diseaseGeneRecurrence[geneRecId] = [];
        }
        diseaseGeneRecurrence[geneRecId].push(record);

        // non-disease specific recurrence
        const nonSpecificRecId = hashRecordToId({
            exon1, exon2, gene1, gene2,
        });

        if (geneRecurrence[nonSpecificRecId] === undefined) {
            geneRecurrence[nonSpecificRecId] = [];
        }
        geneRecurrence[nonSpecificRecId].push(record);
    }

    const recIdList = Object.keys(recurrenceCounts);
    logger.info(`processing ${recIdList.length} recurrent fusion statements`);
    const processed = new Set();

    for (let i = 0; i < recIdList.length; i++) {
        let sourceId = recIdList[i];
        const group = recurrenceCounts[sourceId];
        const sampleCount = (new Set(group.map(row => row.sampleId))).size;
        const [reprRecord] = group; // records are the same for fields being used
        let geneOnly = false,
            diseaseSpecific = true;

        if (sampleCount < RECURRENCE_THRESHOLD) {
            // these are processed as gene-only statements
            const geneRecId = createGeneReccurrenceId(reprRecord);
            const geneSampleCount = (new Set(diseaseGeneRecurrence[geneRecId].map(row => row.sampleId))).size;

            if (processed.has(geneRecId)) {
                continue;
            }
            sourceId = geneRecId;
            processed.add(geneRecId);

            if (geneSampleCount < RECURRENCE_THRESHOLD) {
                // now try with non-specific diseases
                const nonSpecificRecId = createGeneReccurrenceId(_.omit(reprRecord, ['disease1', 'disease2', 'disease3', 'disease4']));

                if (processed.has(nonSpecificRecId)) {
                    continue;
                }
                processed.add(nonSpecificRecId);
                const nsCount = (new Set(geneRecurrence[nonSpecificRecId].map(row => row.sampleId))).size;

                if (nsCount < RECURRENCE_THRESHOLD) {
                    counts.skip++;
                    continue;
                }
                sourceId = nonSpecificRecId;
                diseaseSpecific = false;
            }
            geneOnly = true; // IMPORTANT
        }
        if ([reprRecord.disease1, reprRecord.disease2, reprRecord.disease3, reprRecord.disease4].every(d => d.toUpperCase() === 'NS')) {
            reprRecord.disease4 = 'cancer';
        }

        const publications = Array.from(new Set(group.map(r => r.pubmed)));
        logger.info(`processing (${i} / ${recIdList.length}) ${reprRecord.fusionName}`);

        try {
            await processCosmicRecord({
                conn,
                diseaseSpecific,
                geneOnly,
                record: { ...reprRecord, publications, sourceId },
                relevance,
                source,
                variantType,
            });
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
            errorList.push({
                error: err,
                errorMessage: err.toString(),
                record: {
                    diseaseSpecific, geneOnly, publications, reprRecord, sampleCount, sourceId,
                },
            });
        }
    }

    const errorJson = `${errorLogPrefix}-cosf.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({ records: errorList }, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = { SOURCE_DEFN, kb: true, uploadFile };
