const {NODE_ENV = 'production'} = process.env;

const dbName = process.env.DB_NAME || `kbapi_v${process.env.npm_package_version}`;
const ENV_PREFIX = 'GKB_';

const create = (envName = NODE_ENV) => {
    // set the configuration defaults
    const server = {
        pass: 'root',
        user: 'root',
        port: 2426,
        host: 'orientdb02.bcgsc.ca'
    };

    const db = {
        name: dbName,
        pass: 'admin',
        user: 'admin',
        create: false,
        migrate: false
    };

    if (envName !== 'production') {
        db.create = true;
        db.migrate = false;
    }

    const keycloak = {
        uri: 'https://sso.bcgsc.ca/auth/realms/GSC/protocol/openid-connect/token',
        clientID: 'GraphKB',
        publicKeyFile: 'keycloak.id_rsa.pub',
        role: 'GraphKB'
    };

    if (envName !== 'production') {
        keycloak.uri = 'http://ga4ghdev01.bcgsc.ca:8080/auth/realms/TestKB/protocol/openid-connect/token';
        keycloak.publicKeyFile = 'keycloak-dev.id_rsa.pub';
    }

    const app = {port: 8080};

    const config = {
        privateKeyFile: 'id_rsa',
        disableAuth: false,
        createUser: true,
        db,
        server,
        keycloak,
        app
    };

    if (envName === 'local') {
        config.disableAuth = true;
    }

    // override any defaults with env variables when set
    for (const [obj, key, envVarName] of [
        [config, 'privateKeyFile', 'KEY_FILE'],
        [config, 'disableAuth', 'DISABLE_AUTH'],
        [config, 'createUser', 'CREATE_USER'],
        [keycloak, 'uri', 'KEYCLOAK_URI'],
        [keycloak, 'clientID', 'KEYCLOAK_CLIENT_ID'],
        [keycloak, 'publicKeyFile', 'KEYCLOAK_KEY_FILE'],
        [keycloak, 'role', 'KEYCLOAK_ROLE'],
        [app, 'port', 'PORT'],
        [db, 'name', 'DB_NAME'],
        [db, 'user', 'DB_USER'],
        [db, 'pass', 'DB_PASS'],
        [server, 'host', 'DB_HOST'],
        [server, 'port', 'DB_PORT'],
        [server, 'user', 'DBS_USER'],
        [server, 'pass', 'DBS_PASS']
    ]) {
        const envKey = `${ENV_PREFIX}${envVarName}`;
        if (process.env[envKey] !== undefined) {
            obj[key] = process.env[envKey];
        }
    }
    return config;
};

module.exports = create;
