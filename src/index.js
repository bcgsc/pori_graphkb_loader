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
        name: 'help',
        alias: 'h',
        description: 'Print this help menu',
    },
    {
        name: 'graphkb',
        default: `${process.env.GKB_URL || 'https://graphkbdev-api.bcgsc.ca/api'}`,
        description: 'URL for the KB API',
        env: 'GKB_URL',
    },
    {
        name: 'username',
        default: 'graphkb_importer',
        required: true,
        description: 'ldap username required for access to the kb (USER|GKB_USER)',
        env: 'GKB_USER',
    },
    {
        name: 'password',
        required: true,
        env: 'GKB_PASS',
        description: 'the password for access to the kb api (GKB_PASS)',
    },
    {
        name: 'pubmed',
        env: 'PUBMED_API_KEY',
        description: 'The pubmed API key to use for pubmed requests',
    },
    {
        name: 'errorLogPrefix',
        description: 'prefix to use for any module specific log files that are written',
        default: `${process.cwd()}/errorLog-${new Date().valueOf()}`,
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
    logger.info('upload complete');
};


module.exports = { runLoader, stdOptions };
