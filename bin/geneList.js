const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { loadDelimToJson } = require('../src/util');
const { logger } = require('../src/logging');
const { fetchAndLoadBySymbol } = require('../src/hgnc');

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
    logger.info('fetching existing gene names to avoid spamming external APIs');
    const existingGenes = new Set();
    (await conn.getRecords({
        target: 'Feature',
        returnProperies: ['name', 'sourceId'],
        filters: [{ biotype: 'gene' }, { source: { target: 'Source', filters: { name: 'hgnc' } } }],
    })).forEach(({ name, sourceId }) => {
        existingGenes.add(sourceId);
        existingGenes.add(name);
    });
    logger.info(`fetched ${existingGenes.size} existing gene names`);
    logger.info(`adding ${genes.length} feature records`);
    const counts = { error: 0, success: 0, exists: 0 };

    for (const { name } of genes) {
        if (existingGenes.has(name.toLowerCase())) {
            counts.exists++;
            continue;
        }

        try {
            await fetchAndLoadBySymbol({ symbol: name, conn });
            counts.success++;
        } catch (err) {
            try {
                await fetchAndLoadBySymbol({ symbol: name, conn, paramType: 'prev_symbol' });
            } catch (err2) {
                logger.error(`${name} ${err}`);
                counts.error++;
            }
        }
    }
    logger.info(`counts: ${JSON.stringify(counts)}`);
};


const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            name: 'filename',
            description: 'path to the tab delimited list of gene names',
            type: fileExists,
            required: true,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
