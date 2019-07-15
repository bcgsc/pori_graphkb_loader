/**
 * Loader for the BCGSC custom drug ontology
 * @module importer/drug_ontology
 */

const {loadDelimToJson, rid, orderPreferredOntologyTerms} = require('./util');
const {logger} = require('./logging');
const {SOURCE_DEFN: {name: drugbankName}} = require('./drugbank');
const {SOURCE_DEFN: {name: chemblName}} = require('./chembl');

const HEADER = {
    name: 'source',
    parent: 'Class_1',
    grandparent1: 'Class_2',
    grandparent2: 'Class_3_pathway',
    drugbank: 'DrugBankID',
    alias: 'alias'
};

const SOURCE_DEFN = {
    name: 'GSC Therapeutic Ontology',
    description: 'Therapeutic ontology compiled and curated at the Genome Sciences Centre'
};

/**
 * Try to extact match a drugbank/chembl record. If there isn't one then add this name as a new record instead
 */
const getDrugOrAdd = async (conn, source, name) => {
    if (!name.trim()) {
        return null;
    }
    let record;
    try {
        record = await conn.getUniqueRecordBy({
            endpoint: 'therapies',
            where: {source: {name: drugbankName}, name},
            sort: orderPreferredOntologyTerms
        });
        return record;
    } catch (err) {}

    try {
        record = await conn.getUniqueRecordBy({
            endpoint: 'therapies',
            where: {source: {name: chemblName}, name},
            sort: orderPreferredOntologyTerms
        });
        return record;
    } catch (err) {}

    return conn.addRecord({
        endpoint: 'therapies',
        content: {name, sourceId: name, source: rid(source)},
        existsOk: true
    });
};


/**
 * Try to extact match a drugbank/chembl record. If there isn't one then add this name as a new record instead
 */
const addDrugClass = async (conn, source, name, tags) => {
    if (!name.trim()) {
        return null;
    }

    const record = await conn.addRecord({
        endpoint: 'therapies',
        content: {
            name,
            sourceId: name,
            source: rid(source),
            subsets: tags
        },
        existsOk: true,
        fetchConditions: {
            name,
            sourceId: name,
            source: rid(source)
        }
    });

    // link to drugs with exact name matches
    try {
        const drugbankDrug = await conn.getUniqueRecordBy({
            endpoint: 'therapies',
            where: {source: {name: drugbankName}, name},
            sort: orderPreferredOntologyTerms
        });
        await conn.addRecord({
            endpoint: 'crossreferenceof',
            content: {out: rid(record), in: rid(drugbankDrug), source: rid(source)},
            existsOk: true,
            fetchExistsing: false
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
    const {filename, conn} = opt;

    const content = await loadDelimToJson(filename);

    const source = rid(await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true
    }));

    const counts = {success: 0, error: 0};

    for (const record of content) {
        logger.info(`processing ${record[HEADER.name]}`);
        try {
            const drug = await getDrugOrAdd(conn, source, record[HEADER.name]);
            const [parent, grandparent1, grandparent2] = await Promise.all([
                addDrugClass(conn, source, record[HEADER.parent], ['class1']),
                addDrugClass(conn, source, record[HEADER.grandparent1], ['class2']),
                addDrugClass(conn, source, record[HEADER.grandparent2], ['class3_pathway'])
            ]);
            const aliases = await Promise.all(
                record[HEADER.alias].split(/\s*,\s*/)
                    .filter(term => term)
                    .map(async term => getDrugOrAdd(conn, source, term))
            );
            // link the drug to its alias terms
            await Promise.all(aliases.map(async alias => conn.addRecord({
                endpoint: 'aliasof',
                content: {out: rid(alias), in: rid(drug), source: rid(source)},
                existsOk: true
            })));
            // get the mapped drugbank drug
            if (/^DB\d+$/i.exec(record[HEADER.drugbank])) {
                const dbDrug = rid(await conn.getUniqueRecordBy({
                    endpoint: 'therapies',
                    where: {source: {name: drugbankName}, sourceId: record[HEADER.drugbank]},
                    sort: orderPreferredOntologyTerms
                }));
                // now link the records together
                if (dbDrug !== rid(drug)) {
                    await conn.addRecord({
                        endpoint: 'crossreferenceof',
                        content: {out: rid(drug), in: dbDrug, source},
                        existsOk: true,
                        fetchExistsing: false
                    });
                }
            } else {
                logger.info('No corresponding drugbank drug');
            }
            if (parent) {
                if (rid(drug) !== rid(parent)) {
                    await conn.addRecord({
                        endpoint: 'subclassof',
                        content: {out: rid(drug), in: rid(parent), source},
                        existsOk: true,
                        fetchExistsing: false
                    });
                }
                if (grandparent1 && rid(parent) !== rid(grandparent1)) {
                    await conn.addRecord({
                        endpoint: 'subclassof',
                        content: {out: rid(parent), in: rid(grandparent1), source},
                        existsOk: true,
                        fetchExistsing: false
                    });
                }
                if (grandparent2 && rid(parent) !== rid(grandparent2)) {
                    await conn.addRecord({
                        endpoint: 'subclassof',
                        content: {out: rid(parent), in: rid(grandparent2), source},
                        existsOk: true,
                        fetchExistsing: false
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


module.exports = {SOURCE_DEFN, uploadFile, dependencies: [drugbankName]};
