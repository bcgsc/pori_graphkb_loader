const readXlsxFile = require('read-excel-file/node');
const fs = require('fs');

const { logger } = require('../logging');
const { convertRowFields } = require('../util');
const { rid, orderPreferredOntologyTerms } = require('../graphkb');
const _entrezGene = require('../entrez/gene');
const _pubmed = require('../entrez/pubmed');
const { pubmed: SOURCE_DEFN } = require('../sources');


const uploadFile = async ({ conn, errorLogPrefix }) => {
    logger.info('retrieve the record details');
    try {
        source = await conn.addSource(SOURCE_DEFN)[0];
    } catch (err) {
        logger.error(err);
    }
};

module.exports = {
    SOURCE_DEFN: {}, uploadFile,
};
