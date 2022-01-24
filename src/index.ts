/**
 * Migrates the data from the flatfiles to the graph database
 * @module importer
 * @ignore
 */
import { ApiConnection } from './graphkb';
// import entrez from './entrez/util';
import sources from './sources';

import { logger } from './logging';


const runLoader = async (options, loaderFunc, loaderOptions = {}) => {
    const apiConnection = new ApiConnection(options.graphkb);

    try {
        await apiConnection.setAuth(options);
    } catch (err) {
        throw Error(`Login failed: ${err}`);
    }

    // if (options.pubmed) {
    //     entrez.DEFAULT_QS.api_key = options.pubmed;
    // }

    logger.info('Login Succeeded');

    await loaderFunc({
        ...loaderOptions,
        conn: apiConnection,
        errorLogPrefix: options.errorLogPrefix,
    });

    logger.info(`created: ${JSON.stringify(apiConnection.getCreatedCounts())}`);
    logger.info('upload complete');
};


export {
    runLoader,
    sources,
};
