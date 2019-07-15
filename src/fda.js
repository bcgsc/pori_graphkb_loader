/**
 * Import the UNII for drugs from the FDA
 *
 * @module importer/fda
 */

const {
    orderPreferredOntologyTerms, loadDelimToJson, rid
} = require('./util');
const {logger} = require('./logging');

const SOURCE_DEFN = {
    name: 'fda',
    url: 'https://fdasis.nlm.nih.gov/srs',
    comment: 'https://www.fda.gov/ForIndustry/DataStandards/SubstanceRegistrationSystem-UniqueIngredientIdentifierUNII/default.htm',
    description: 'The overall purpose of the joint FDA/USP Substance Registration System (SRS) is to support health information technology initiatives by generating unique ingredient identifiers (UNIIs) for substances in drugs, biologics, foods, and devices. The UNII is a non- proprietary, free, unique, unambiguous, non semantic, alphanumeric identifier based on a substance’s molecular structure and/or descriptive information.'
};

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
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });
    let ncitSource;
    try {
        ncitSource = await api.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'NCIT'}
        });
    } catch (err) {
        logger.error('Cannot link to NCIT, Unable to find source record');
        throw err;
    }
    logger.info(`loading ${jsonList.length} records`);
    let skipCount = 0;
    for (const record of jsonList) {
        if (!record.PT.length || !record.UNII.length || !record.PT.trim().toLowerCase()) {
            skipCount++;
            continue;
        }
        const name = record.PT.trim().toLowerCase();
        let ncitRec;
        logger.info(`processing ${record.UNII} (${i} / ${jsonList.length})`);
        try {
            ncitRec = await api.getUniqueRecordBy({
                endpoint: 'therapies',
                where: {source: {name: ncitSourceName}, sourceId: record.NCIT},
                sort: orderPreferredOntologyTerms
            });
        } catch (err) {
            counts.skip++;
            continue;
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
            counts.error++;
            logger.error(err);
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
                logger.log('error', `failed cross-linking from ${name} to ${record.NCIT}`);
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
    logger.info(JSON.stringify(counts));
};

module.exports = {uploadFile, SOURCE_DEFN, dependencies: ['ncit']};
