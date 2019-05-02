
const dbName = process.env.DB_NAME || `kbapi_v${process.env.npm_package_version}`;

const create = () => {
    // set the configuration defaults
    const server = {
        pass: process.env.GKB_DBS_PASS || 'root',
        user: process.env.GKB_DBS_USER || 'root',
        port: process.env.GKB_DB_PORT || 2424,
        host: process.env.GKB_DB_HOST || 'localhost'
    };

    const db = {
        name: process.env.GKB_DB_NAME || dbName,
        pass: process.env.GKB_DB_PASS || 'admin',
        user: process.env.GKB_DB_USER || 'admin',
        create: process.env.GKB_DB_CREATE === '1',
        migrate: process.env.GKB_DB_MIGRATE === '1'
    };

    const keycloak = {
        uri: process.env.GKB_KEYCLOAK_URI || 'http://ga4ghdev01.bcgsc.ca:8080/auth/realms/TestKB/protocol/openid-connect/token',
        clientID: process.env.GKB_KEYCLOAK_CLIENT_ID || 'GraphKB',
        publicKeyFile: process.env.GKB_KEYCLOAK_KEY_FILE || 'keycloak.id_rsa.pub',
        role: process.env.GKB_KEYCLOAK_ROLE || 'GraphKB'
    };

    const app = {port: process.env.GKB_PORT || 8080};

    const config = {
        privateKeyFile: process.env.GKB_KEY_FILE || 'id_rsa',
        disableAuth: process.env.GKB_DISABLE_AUTH === '1',
        createUser: process.env.GKB_CREATE_USER === undefined
            ? true
            : process.env.GKB_CREATE_USER === '1',
        db,
        server,
        keycloak,
        app
    };
    return config;
};

module.exports = create;
