const { logger } = require('../logging');
const { rid } = require('../graphkb');
const { pubmed: SOURCE_DEFN } = require('../sources');

const uploadFile = async ({ conn }) => {
    logger.info('retrieve the record details');

    try {
        const source = rid(await conn.addSource(SOURCE_DEFN));
        logger.log('info', `pubmed source: ${source}`);
    } catch (err) {
        logger.error(err);
    }
};

module.exports = {
    SOURCE_DEFN: {}, uploadFile,
};
