/**
 * Migrates the data from the flatfiles to the graph database
 * @module importer
 * @ignore
 */
const { ApiConnection } = require('./graphkb');
const { DEFAULT_QS } = require('./entrez/util');
const { logger, getFilename } = require('./logging');


const stdOptions = [
    {
        alias: 'h',
        description: 'Print this help menu',
        name: 'help',
    },
    {
        default: `${process.env.GKB_URL || 'https://graphkbdev-api.bcgsc.ca/api'}`,
        description: 'URL for the KB API',
        env: 'GKB_URL',
        name: 'graphkb',
    },
    {
        default: 'graphkb_importer',
        description: 'ldap username required for access to the kb (USER|GKB_USER)',
        env: 'GKB_USER',
        name: 'username',
        required: true,
    },
    {
        description: 'the password for access to the kb api (GKB_PASS)',
        env: 'GKB_PASS',
        name: 'password',
        required: true,
    },
    {
        description: 'The pubmed API key to use for pubmed requests',
        env: 'PUBMED_API_KEY',
        name: 'pubmed',
    },
    {
        default: `${process.cwd()}/errorLog-${new Date().valueOf()}`,
        description: 'prefix to use for any module specific log files that are written',
        name: 'errorLogPrefix',
    },
];


const runLoader = async (options, loaderFunc, loaderOptions = {}) => {
    const apiConnection = new ApiConnection(options.graphkb);
    await apiConnection.setAuth(options);

    if (options.pubmed) {
        DEFAULT_QS.api_key = options.pubmed;
    }

    logger.info('Login Succeeded');

    await loaderFunc({
        ...loaderOptions,
        conn: apiConnection,
        errorLogPrefix: options.errorLogPrefix,
    });

    if (getFilename()) {
        logger.info(`logs written to ${getFilename()}`);
    }
    logger.info(`created: ${JSON.stringify(apiConnection.getCreatedCounts())}`);
    logger.info('upload complete');
};


module.exports = { runLoader, stdOptions };
