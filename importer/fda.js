/**
 * | | |
 * | --- | --- |
 * | Source | FDA |
 * | About | https://www.fda.gov/ForIndustry/DataStandards/SubstanceRegistrationSystem-UniqueIngredientIdentifierUNII/default.htm |
 * | Source Type | Ontology |
 * | Data Example| https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip |
 * | Data Format| Tab Delimited |
 *
 * Import the UNII for drugs from the FDA
 *
 * @module importer/fda
 */

const {
    orderPreferredOntologyTerms, loadDelimToJson, rid
} = require('./util');
const {logger, progress} = require('./logging');

const SOURCE_NAME = 'fda';

/**
 * Given the TAB delimited UNII records file. Load therapy records and NCIT links
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const {filename, conn: api} = opt;
    const jsonList = await loadDelimToJson(filename);
    const source = await api.addRecord({
        endpoint: 'sources',
        content: {name: SOURCE_NAME, url: 'https://fdasis.nlm.nih.gov/srs'},
        existsOk: true
    });
    let ncitSource;
    try {
        ncitSource = await api.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'NCIT'}
        });
    } catch (err) {
        progress('x\n');
    }
    logger.info(`loading ${jsonList.length} records`);
    let skipCount = 0;
    for (const record of jsonList) {
        if (!record.PT.length || !record.UNII.length || !record.PT.trim().toLowerCase()) {
            skipCount++;
            continue;
        }
        const name = record.PT.trim().toLowerCase();
        if (record.NCIT.length === 0) {
            if (!/\S+[mn][ia]b\b/i.exec(name) && !name.includes('interferon')) {
                skipCount++;
                continue;
            }
        }
        // only load records with at min these 3 values filled out
        let drug;
        try {
            drug = await api.addRecord({
                endpoint: 'therapies',
                content: {name, sourceId: record.UNII, source: rid(source)},
                existsOk: true
            });
        } catch (err) {
            logger.error(`Unable to add drug Record (UNII: ${record.UNII}) (error: ${err})`);
            continue;
        }
        if (ncitSource && record.NCIT.length) {
            let ncitRec;
            try {
                ncitRec = await api.getUniqueRecordBy({
                    endpoint: 'therapies',
                    where: {source: {name: 'ncit'}, sourceId: record.NCIT},
                    sort: orderPreferredOntologyTerms
                });
            } catch (err) {
                progress('x');
            }
            if (ncitRec) {
                await api.addRecord({
                    endpoint: 'aliasof',
                    content: {source: rid(source), out: rid(drug), in: rid(ncitRec)},
                    existsOk: true
                });
            }
        }
    }
    logger.info(`\nskipped ${skipCount} records`);
};

module.exports = {uploadFile};
