const { logger } = require('../logging');
const sources = require('../sources');

const uploadFile = async ({ conn }) => {
    for (const [key, source] of Object.entries(sources)) {
        logger.info('Retrieving the record details');

        try {
            const addedSource = await conn.addSource(source);
            logger.info(`Source added successfully. Source, sourceID: ${addedSource.displayName},${addedSource['@rid']}`);
        } catch (err) {
            logger.error(`Error adding source for key ${key}: ${err}`);
        }
    }
};


module.exports = {
    sources, uploadFile,
};
