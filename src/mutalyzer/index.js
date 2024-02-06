/**
 * Loader module for the mutalyzer utility
 * @module importer/mutalyzer
 */


const { requestWithRetry } = require('../util');
const { logger } = require('../logging');

const BASE_URL = 'https://mutalyzer.nl/api/normalize/';


/**
 * Given some protein description, fetch and load the corresponding cds
 *
 * url: https://mutalyzer.nl/api/normalize/ENST00000318560:p.F317C
 *
 */
const fetchAndLoadByDescription = async (description) => {
    const url = `${BASE_URL}/${description}`;

    logger.info(`loading description: ${url}`);
    // fetch from the external api
    const result = await requestWithRetry({
        json: true,
        method: 'GET',
        uri: url,
    });

    return result.back_translated_descriptions;
};



module.exports = {
    fetchAndLoadByDescription,
};
