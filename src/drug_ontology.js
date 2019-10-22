/**
 * Loader for the BCGSC custom drug ontology
 * @module importer/drug_ontology
 */

const { loadDelimToJson } = require('./util');
const { rid, orderPreferredOntologyTerms } = require('./graphkb');
const { logger } = require('./logging');
const { SOURCE_DEFN: { name: drugbankName } } = require('./drugbank');
const { SOURCE_DEFN: { name: chemblName } } = require('./chembl');

const HEADER = {
    name: 'source',
    parent: 'Class_1',
    grandparent1: 'Class_2',
    grandparent2: 'Class_3_pathway',
    drugbank: 'DrugBankID',
    alias: 'alias',
};

const TAGS = {
    [HEADER.parent]: 'specific drug class',
    [HEADER.grandparent1]: 'general drug class',
    [HEADER.grandparent2]: 'pathway drug class',
};

const SOURCE_DEFN = {
    name: 'gsc therapeutic ontology',
    displayName: 'GSC-TO',
    description: 'Therapeutic ontology compiled and curated at the Genome Sciences Centre',
};

/**
 * Try to extact match a drugbank/chembl record. If there isn't one then add this name as a new record instead
 */
const getDrugOrAdd = async (conn, source, name, rawRecord = {}) => {
    if (!name) {
        return null;
    }
    const tags = [];

    for (const col of [HEADER.parent, HEADER.grandparent1, HEADER.grandparent2]) {
        if (name === rawRecord[col]) {
            tags.push(TAGS[col]);
        }
    }
    let record;

    try {
        record = await conn.getUniqueRecordBy({
            target: 'Therapy',
            filters: {
                AND: [
                    { source: { target: 'Source', filters: { name: drugbankName } } },
                    { name },
                ],
            },
            sort: orderPreferredOntologyTerms,
        });
        return record;
    } catch (err) {}

    try {
        record = await conn.getUniqueRecordBy({
            target: 'Therapy',
            filters: { AND: [{ source: { target: 'Source', filters: { name: chemblName } } }, { name }] },
            sort: orderPreferredOntologyTerms,
        });
        return record;
    } catch (err) {}

    return conn.addRecord({
        target: 'Therapy',
        content: {
            name, sourceId: name, source: rid(source), subsets: tags,
        },
        fetchConditions: { name, sourceId: name, source: rid(source) },
        existsOk: true,
    });
};


/**
 * Create the drug class and link to existing drug classes with identical names
 */
const addDrugClass = async (conn, source, name, rawRecord) => {
    if (!name) {
        return null;
    }

    const tags = [];

    for (const col of [HEADER.parent, HEADER.grandparent1, HEADER.grandparent2]) {
        if (name === rawRecord[col]) {
            tags.push(TAGS[col]);
        }
    }

    const record = await conn.addRecord({
        target: 'Therapy',
        content: {
            name,
            sourceId: name,
            source: rid(source),
            subsets: tags,
        },
        existsOk: true,
        fetchConditions: {
            name,
            sourceId: name,
            source: rid(source),
        },
    });

    // link to drugs with exact name matches
    try {
        const drugbankDrug = await conn.getUniqueRecordBy({
            target: 'Therapy',
            filters: {
                AND: [
                    { source: { target: 'Source', filters: { name: drugbankName } } },
                    { name },
                ],
            },
            sort: orderPreferredOntologyTerms,
        });
        await conn.addRecord({
            target: 'CrossReferenceOf',
            content: { out: rid(record), in: rid(drugbankDrug), source: rid(source) },
            existsOk: true,
            fetchExistsing: false,
        });
    } catch (err) {}
    return record;
};


/**
 * Given a TAB delmited biomart export of Ensembl data, upload the features to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the tab delimited export file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const { filename, conn } = opt;

    const content = await loadDelimToJson(filename);

    const source = rid(await conn.addRecord({
        target: 'Source',
        content: SOURCE_DEFN,
        existsOk: true,
    }));

    const counts = { success: 0, error: 0 };

    for (let i = 0; i < content.length; i++) {
        const record = content[i];
        logger.info(`processing ${record[HEADER.name]} (${i} / ${content.length})`);

        // clean the names
        for (const col of [HEADER.name, HEADER.parent, HEADER.grandparent1, HEADER.grandparent2, HEADER.alias]) {
            record[col] = record[col].trim().toLowerCase().replace(/\binhibitors\b/, 'inhibitor');
        }

        try {
            const drug = await getDrugOrAdd(conn, source, record[HEADER.name], record);

            const [parent, grandparent1, grandparent2] = await Promise.all([
                addDrugClass(conn, source, record[HEADER.parent], record),
                addDrugClass(conn, source, record[HEADER.grandparent1], record),
                addDrugClass(conn, source, record[HEADER.grandparent2], record),
            ]);
            const aliases = await Promise.all(
                record[HEADER.alias].split(/\s*,\s*/)
                    .filter(term => term && term !== record[HEADER.name])
                    .map(async term => getDrugOrAdd(conn, source, term)),
            );
            // link the drug to its alias terms
            await Promise.all(aliases.map(async alias => conn.addRecord({
                target: 'aliasof',
                content: { out: rid(alias), in: rid(drug), source: rid(source) },
                existsOk: true,
            })));

            if (parent) {
                if (rid(drug) !== rid(parent)) {
                    await conn.addRecord({
                        target: 'subclassof',
                        content: { out: rid(drug), in: rid(parent), source },
                        existsOk: true,
                        fetchExistsing: false,
                    });
                }
                if (grandparent1 && rid(parent) !== rid(grandparent1)) {
                    await conn.addRecord({
                        target: 'subclassof',
                        content: { out: rid(parent), in: rid(grandparent1), source },
                        existsOk: true,
                        fetchExistsing: false,
                    });
                }
                if (grandparent2 && rid(parent) !== rid(grandparent2)) {
                    await conn.addRecord({
                        target: 'subclassof',
                        content: { out: rid(parent), in: rid(grandparent2), source },
                        existsOk: true,
                        fetchExistsing: false,
                    });
                }
            }
            // get the mapped drugbank drug
            if (/^DB\d+$/i.exec(record[HEADER.drugbank])) {
                const dbDrug = rid(await conn.getUniqueRecordBy({
                    target: 'Therapy',
                    filters: {
                        AND: [
                            { source: { target: 'Source', filters: { name: drugbankName } } },
                            { sourceId: record[HEADER.drugbank] },
                        ],
                    },
                    sort: orderPreferredOntologyTerms,
                }));

                // now link the records together
                if (dbDrug !== rid(drug)) {
                    await conn.addRecord({
                        target: 'crossreferenceof',
                        content: { out: rid(drug), in: dbDrug, source },
                        existsOk: true,
                        fetchExistsing: false,
                    });
                }
            }
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};


module.exports = { SOURCE_DEFN, uploadFile, dependencies: [drugbankName] };
