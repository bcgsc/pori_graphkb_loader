/**
 * @module importer/geneList
 */
const { loadDelimToJson } = require('./util');
const { logger } = require('./logging');
const { hgnc: { name: hgnc }, ensembl: { name: ensembl } } = require('./sources');
const { fetchAndLoadBySymbol } = require('./hgnc');

/**
 * Upload the HGNC genes from a list of symbols
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async (opt) => {
    logger.info('loading the external HGNC data');
    const { filename, conn } = opt;
    logger.info(`loading: ${filename}`);
    const genes = await loadDelimToJson(filename);
    const existingGenes = new Set();
    (await conn.getRecords({
        target: 'Feature', returnProperies: ['name', 'sourceId'],
    })).forEach(({ name, sourceId }) => {
        existingGenes.add(sourceId);
        existingGenes.add(name);
    });
    logger.info(`fetched ${existingGenes.size} existing gene names`);
    logger.info(`adding ${genes.length} feature records`);
    const counts = { error: 0, success: 0, exists: 0 };

    for (const { name } of genes) {
        if (existingGenes.has(name)) {
            counts.exists++;
            continue;
        }

        try {
            await fetchAndLoadBySymbol({ symbol: name, conn });
            counts.success++;
        } catch (err) {
            logger.error(`${name} ${err}`);
            counts.error++;
        }
    }
    logger.info(`counts: ${JSON.stringify(counts)}`);
    logger.info(`created: ${JSON.stringify(conn.getCreatedCounts())}`);
};

module.exports = {
    uploadFile,
    dependencies: [ensembl, hgnc],
};
