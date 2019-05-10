/**
 * Loader for the BCGSC custom drug ontology
 * @module importer/drug_ontology
 */

const {loadDelimToJson, rid} = require('./util');
const {logger} = require('./logging');
const {SOURCE_DEFN: {name: drugbankName}} = require('./drugbank');
const {SOURCE_DEFN: {name: chemblName}} = require('./chembl');

const HEADER = {
    name: 'source',
    parent: 'Class_1',
    grandparent1: 'Class_2',
    grandparent2: 'Class_3_pathway',
    drugbank: 'DrugBankID'
};

const SOURCE_DEFN = {
    name: 'GSC Therapeutic Ontology',
    description: 'Therapeutic ontology compiled and curated at the Genome Sciences Centre'
};

/**
 * Try to extact match a drugbank/chembl record. If there isn't one then add this name as a new record instead
 */
const getDrugOrAdd = async (conn, source, name) => {
    let record;
    try {
        record = await conn.getUniqueRecordBy({
            endpoint: 'therapies',
            where: {source: {name: drugbankName}, name}
        });
        return record;
    } catch (err) {}

    try {
        record = await conn.getUniqueRecordBy({
            endpoint: 'therapies',
            where: {source: {name: chemblName}, name}
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
            const [drug, parent, grandparent1, grandparent2] = await Promise.all([
                record[HEADER.name],
                record[HEADER.parent],
                record[HEADER.grandparent1],
                record[HEADER.grandparent2]
            ].map(async name => getDrugOrAdd(conn, source, name)));
            // get the mapped drugbank drug
            if (/^DB\d+$/i.exec(record[HEADER.drugbank])) {
                const dbDrug = rid(await conn.getUniqueRecordBy({
                    endpoint: 'therapies',
                    where: {source: {name: drugbankName}, sourceId: record[HEADER.drugbank]}
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
            if (rid(drug) !== rid(parent)) {
                await conn.addRecord({
                    endpoint: 'subclassof',
                    content: {out: rid(drug), in: rid(parent), source},
                    existsOk: true,
                    fetchExistsing: false
                });
            }
            if (rid(parent) !== rid(grandparent1)) {
                await conn.addRecord({
                    endpoint: 'subclassof',
                    content: {out: rid(parent), in: rid(grandparent1), source},
                    existsOk: true,
                    fetchExistsing: false
                });
            }
            if (rid(parent) !== rid(grandparent2)) {
                await conn.addRecord({
                    endpoint: 'subclassof',
                    content: {out: rid(parent), in: rid(grandparent2), source},
                    existsOk: true,
                    fetchExistsing: false
                });
            }
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};


module.exports = {SOURCE_DEFN, uploadFile};
