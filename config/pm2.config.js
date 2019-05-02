/**
 * PM2 config file. MUST have config.js suffix (https://github.com/Unitech/pm2/issues/3529)
 */
const packageData = require('./../package.json'); // eslint-disable-line

module.exports = {
    apps: [
        {
            name: `${packageData.name.replace(/^@bcgsc\//, '')}_v${packageData.version}`,
            script: 'npm',
            args: 'start',
            watch: false,
            max_restarts: 25,
            min_uptime: 10000, // min ms up before considered fail to start
            env: {
                // common variables
                GKB_LOG_LEVEL: 'debug',
                GKB_DB_PORT: 2481,
                GKB_DB_HOST: 'orientdbdev.bcgsc.ca',
                GKB_DB_MIGRATE: '1',
                GKB_LOG_DIR: 'logs'
            },
            env_production: {
                GKB_DB_CREATE: '0',
                GKB_DB_HOST: 'orientdb02.bcgsc.ca',
                GKB_DB_NAME: 'production',
                GKB_DB_PORT: 2426,
                GKB_KEYCLOAK_KEY_FILE: 'keycloak.id_rsa.pub',
                GKB_KEYCLOAK_URI: 'https://sso.bcgsc.ca/auth/realms/GSC/protocol/openid-connect/token',
                GKB_PORT: 8080,
                GKB_LOG_LEVEL: 'info',
                NODE_ENV: 'production',
                GKB_LOG_MAX_FILES: 28
            },
            env_development: {
                GKB_DB_CREATE: '0',
                GKB_DB_NAME: 'production-sync',
                GKB_PORT: 8081,
                NODE_ENV: 'development',
                GKB_LOG_MAX_FILES: 7
            },
            env_local: {
                GKB_DB_CREATE: '1',
                NODE_ENV: 'local'
            },
            env_test: {
                GKB_DB_CREATE: '1',
                NODE_ENV: 'test',
                GKB_DISABLE_AUTH: '1'
            }
        }
    ]
};
