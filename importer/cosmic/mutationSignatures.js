const fs = require('fs');

const {logger} = require('../logging');
const {rid} = require('./../util');

const {SOURCE_DEFN} = require('./constants');


const uploadFile = async ({conn, filename}) => {
    logger.info(`Loading the ${filename} mutation signatures data`);

    const {records} = JSON.parse(fs.readFileSync(filename));

    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });

    logger.info(`uploading ${records.length} records`);
    await Promise.all(records.map(async (sig) => {
        const {
            sourceId, aetiology, additional, comments, url, sourceIdVersion
        } = sig;
        const description = [aetiology, additional, comments].filter(x => x).join(' ');
        return conn.addRecord({
            endpoint: '/signatures',
            existsOk: true,
            content: {
                name: sourceId,
                sourceId,
                source: rid(source),
                description,
                url,
                sourceIdVersion
            }
        });
    }));
    logger.log('info', 'Signatures loaded');
};

module.exports = {uploadFile, SOURCE_DEFN};
