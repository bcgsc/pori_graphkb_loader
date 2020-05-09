/**
 * Import the UNII for drugs from the FDA
 *
 * @module importer/fda
 */

const {
    orderPreferredOntologyTerms, loadDelimToJson, rid, convertRowFields,
} = require('./../util');
const { SOURCE_DEFN: { name: ncitSourceName } } = require('./../ncit');
const { logger } = require('./../logging');

const { fdaSrs: SOURCE_DEFN } = require('./../sources');

const HEADER = {
    id: 'UNII',
    name: 'PT',
    ncit: 'NCIT',
    pubchem: 'PUBCHEM',
};

/**
 * Given the TAB delimited UNII records file. Load therapy records and NCIT links
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const { filename, conn: api } = opt;
    const jsonList = await loadDelimToJson(filename);
    const source = await api.addRecord({
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
        target: 'Source',
    });

    // only load FDA records if we have already loaded NCIT
    try {
        await api.getUniqueRecordBy({
            filters: { name: ncitSourceName },
            target: 'Source',
        });
    } catch (err) {
        logger.error('Cannot link to NCIT, Unable to find source record');
        throw err;
    }
    const counts = { error: 0, skip: 0, success: 0 };

    logger.info(`loading ${jsonList.length} records`);

    for (let i = 0; i < jsonList.length; i++) {
        const {
            pubchem, id, ncit, name,
        } = convertRowFields(HEADER, jsonList[i]);

        if (!name || !id || (!ncit && !pubchem)) {
            // only load records with at min these 3 values filled out
            counts.skip++;
            continue;
        }
        let ncitRec;
        logger.info(`processing ${id} (${i} / ${jsonList.length})`);

        if (ncit) {
            try {
                ncitRec = await api.getUniqueRecordBy({
                    filters: {
                        AND: [
                            { source: { filters: { name: ncitSourceName }, target: 'Source' } },
                            { sourceId: ncit },
                        ],
                    },
                    sort: orderPreferredOntologyTerms,
                    target: 'Therapy',
                });
            } catch (err) {
                counts.skip++;
                continue;
            }
        }

        let drug;

        try {
            drug = await api.addRecord({
                content: { name, source: rid(source), sourceId: id },
                existsOk: true,
                target: 'Therapy',
            });

            if (ncitRec) {
                await api.addRecord({
                    content: { in: rid(ncitRec), out: rid(drug), source: rid(source) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'crossreferenceof',
                });
            }
            counts.success++;
        } catch (err) {
            counts.error++;
            logger.error(err);
            continue;
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = { SOURCE_DEFN, dependencies: [ncitSourceName], uploadFile };
