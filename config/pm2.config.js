/**
 * PM2 config file. MUST have config.js suffix (https://github.com/Unitech/pm2/issues/3529)
 */
const packageData = require('./../package.json'); // eslint-disable-line
const env = require('./../app/config');

let suffix = '';
if (process.env['bamboo.deploy.environment']) {
    suffix = `_${process.env['bamboo.deploy.environment']}`;
}

module.exports = {
    apps: [
        {
            name: `${packageData.name.replace(/^@bcgsc\//, '')}_v${packageData.version}${suffix}`,
            script: 'npm',
            args: 'start',
            watch: false,
            max_restarts: 25,
            min_uptime: 10000, // min ms up before considered fail to start
            env: env.common || {},
            env_production: {...env.production || {}, NODE_ENV: 'production'},
            env_development: {...env.development || {}, NODE_ENV: 'development'},
            env_local: {...env.local || {}, NODE_ENV: 'local'},
            env_test: {...env.test || {}, NODE_ENV: 'test'}
        }
    ]
};
