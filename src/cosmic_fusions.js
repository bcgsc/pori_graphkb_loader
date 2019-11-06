/**
 * @module importer/cosmic
 */
const fs = require('fs');
const _ = require('lodash');

const {
    loadDelimToJson,
    convertRowFields,
    hashRecordToId,
} = require('./util');
const {
    orderPreferredOntologyTerms,
    rid,
} = require('./graphkb');
const _pubmed = require('./entrez/pubmed');
const _gene = require('./entrez/gene');
const _refseq = require('./entrez/refseq');
const _ensembl = require('./ensembl');

const { logger } = require('./logging');
const { SOURCE_DEFN } = require('./cosmic');

const RECURRENCE_THRESHOLD = 3;

const HEADER = {
    sampleId: 'Sample ID',
    fusionId: 'Fusion ID',
    disease1: 'Primary histology',
    disease2: 'Histology subtype 1',
    disease3: 'Histology subtype 2',
    disease4: 'Histology subtype 3',
    fusionName: 'Translocation Name',
    pubmed: 'PUBMED_PMID',
};

const parseFusionName = (name) => {
    let match;

    if (match = /^(?<gene1>\w+){(?<transcript1>[^}]+)}:r\.1_(?<break1>\d+([-+](\d+|\?))?)_(?<gene2>\w+){(?<transcript2>[^}]+)}:r.(?<break2>\d+([-+](\d+|\?))?)_\d+$/.exec(name)) {
        return match.groups;
    } if (match = /^(\w+){([^}]+)}:r\.\?_(\w+){([^}]+)}:r.\?$/.exec(name)) {
        const [, gene1, transcript1, gene2, transcript2] = match;
        return {
            gene1, transcript1, break1: null, gene2, transcript2, break2: null,
        };
    }

    throw new Error(`Fusion Name format not recognized (${name})`);
};


const processDisease = async ({ conn, record }) => {
    const {
        disease1, disease2, disease3, disease4,
    } = record;
    let disease,
        error;

    for (const rawName of [disease4, disease3, disease2, disease1]) {
        if (rawName === 'NS' || !rawName || disease) {
            continue;
        }
        const diseaseName = rawName.replace(/_/g, ' ')
            .replace('leukaemia', 'leukemia')
            .replace(/\bB cell\b/ig, 'b-cell');

        try {
            disease = await conn.getUniqueRecordBy({
                target: 'Disease',
                filters: { name: diseaseName },
                sort: orderPreferredOntologyTerms,
            });
        } catch (err) {
            error = err;
        }
    }

    if (!disease) {
        throw (error || new Error(`No valid disease types (${disease1}, ${disease2}, ${disease3}, ${disease4})`));
    }
    return disease;
};


const fetchTranscript = async (conn, name) => {
    const match = /^(NM_\d+)(\.(\d+))?$/.exec(name);

    if (match) {
        const [, sourceId,, sourceIdVersion] = match;

        try {
            const transcript = await conn.getUniqueRecordBy({
                target: 'Feature',
                filters: {
                    AND: [
                        { biotype: 'transcript' },
                        { source: { target: 'Source', filters: { name: _refseq.SOURCE_DEFN.name } } },
                        { sourceId },
                        { sourceIdVersion },
                    ],
                },
                sort: orderPreferredOntologyTerms,
            });
            return transcript;
        } catch (err) {
            // pull directly from refseq
            const [transcript] = await _refseq.fetchAndLoadByIds(conn, [name]);
            return transcript;
        }
    }
    return conn.getUniqueRecordBy({
        target: 'Feature',
        filters: {
            AND: [
                { biotype: 'transcript' },
                { source: { target: 'Source', filters: { name: _ensembl.SOURCE_DEFN.name } } },
                { sourceId: name },
                { sourceIdVersion: null },
            ],
        },
        sort: orderPreferredOntologyTerms,
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
        pos: start,
        offset,
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
            target: 'ElementOf',
            content: { out: rid(transcript1), in: rid(gene1), source },
            existsOk: true,
            fetchExisting: false,
        }),
        conn.addRecord({
            target: 'ElementOf',
            content: { out: rid(transcript2), in: rid(gene2), source },
            existsOk: true,
            fetchExisting: false,
        }),
    ]);

    // create the variants
    const general = await conn.addRecord({
        target: 'CategoryVariant',
        content: {
            reference1: rid(gene1),
            reference2: rid(gene2),
            type: variantType,
        },
        existsOk: true,
    });
    let specific;

    if ((parsed.break1 || parsed.break2) && !geneOnly) {
        specific = await conn.addRecord({
            target: 'PositionalVariant',
            content: {
                reference1: transcript1,
                reference2: transcript2,
                type: variantType,
                break1Start: parseRnaPosition(parsed.break1),
                break2Start: parseRnaPosition(parsed.break2),
                displayName: `(${gene1.displayName},${gene2.displayName}):fusion(r.${parsed.break1},r.${parsed.break2})`,
            },
            existsOk: true,
        });
        await conn.addRecord({
            target: 'Inters',
            content: {
                out: rid(specific),
                in: rid(general),
            },
            existsOk: true,
            fetchExisting: false,
        });
    }
    return specific || general;
};


const processCosmicRecord = async ({
    conn, record, source, relevance, variantType, geneOnly, diseaseSpecific,
}) => {
    // get the disease name
    let disease;

    if (diseaseSpecific) {
        disease = rid(await processDisease({ conn, record }));
    } else {
        disease = rid(await conn.getUniqueRecordBy({
            target: 'Disease',
            filters: { name: 'cancer' },
            sort: orderPreferredOntologyTerms,
        }));
    }
    const publications = await _pubmed.fetchAndLoadByIds(conn, record.publications);

    const variant = rid(await processVariants({
        conn, record, variantType, source, geneOnly,
    }));


    // create the recurrence statement
    await conn.addRecord({
        target: 'Statement',
        content: {
            relevance,
            subject: disease,
            conditions: [variant, disease],
            evidence: publications.map(rid),
            source: rid(source),
            reviewStatus: 'not required',
            sourceId: record.sourceId,
        },
        existsOk: true,
        fetchExisting: false,
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
        genes, disease1, disease2, disease3, disease4,
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
const uploadFile = async ({ filename, conn, errorLogPrefix }) => {
    const jsonList = await loadDelimToJson(filename);
    // get the dbID for the source
    const source = rid(await conn.addRecord({
        target: 'Source',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
    }));
    const counts = { success: 0, error: 0, skip: 0 };
    const errorList = [];
    logger.info(`Processing ${jsonList.length} records`);

    const recurrenceCounts = {}; // position specific fusions
    const diseaseGeneRecurrence = {}; // gene only but disease specific
    const geneRecurrence = {}; // gene only and not disease specific
    const records = jsonList.map(row => convertRowFields(HEADER, row));
    const relevance = rid(await conn.getVocabularyTerm('recurrent'));
    const variantType = rid(await conn.getVocabularyTerm('fusion'));

    await _pubmed.fetchAndLoadByIds(conn, records.map(rec => rec.pumbed));

    // find recurrence 'counts'
    for (const record of records) {
        const {
            fusionName, disease1, disease2, disease3, disease4,
        } = record;

        if (!fusionName) {
            continue;
        }
        const recurrenceId = hashRecordToId({
            fusionName, disease1, disease2, disease3, disease4,
        });

        if (recurrenceCounts[recurrenceId] === undefined) {
            recurrenceCounts[recurrenceId] = [];
        }
        recurrenceCounts[recurrenceId].push(record);

        // simple recc
        const geneRecId = createGeneReccurrenceId(record);

        if (diseaseGeneRecurrence[geneRecId] === undefined) {
            diseaseGeneRecurrence[geneRecId] = [];
        }
        diseaseGeneRecurrence[geneRecId].push(record);

        // non-disease specific recurrence
        const nonSpecificRecId = createGeneReccurrenceId(_.omit(record, ['disease1', 'disease2', 'disease3', 'disease4']));

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
                record: { ...reprRecord, publications, sourceId },
                source,
                variantType,
                relevance,
                geneOnly,
                diseaseSpecific,
            });
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
            errorList.push({
                record: {
                    sourceId, reprRecord, sampleCount, publications, diseaseSpecific, geneOnly,
                },
                error: err,
                errorMessage: err.toString(),
            });
        }
    }

    const errorJson = `${errorLogPrefix}-cosf.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({ records: errorList }, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = { uploadFile, SOURCE_DEFN, kb: true };
