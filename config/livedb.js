const {ORIENTDB_HOME} = process.env;

const dbName = process.env.DB_NAME || 'kbapi_v1.0.0';

const server = {
    pass: process.env.DBS_PASS || 'root',
    user: process.env.DBS_USER || 'root',
    port: process.env.DB_PORT || 2426,
    host: process.env.DB_HOST || 'orientdb02.bcgsc.ca'
};

const db = {
    name: dbName,
    url: `plocal:${ORIENTDB_HOME}/databases/${dbName}`,
    pass: process.env.DB_PASS || 'admin',
    user: process.env.DB_USER || 'admin',
    host: server.host,
    port: server.port
};

module.exports = {
    server,
    db,
    app: {port: process.env.PORT || 8080},
    privateKeyFile: process.env.KEY_FILE || 'id_rsa',
    disableAuth: process.env.DISABLE_AUTH === '1'
};
