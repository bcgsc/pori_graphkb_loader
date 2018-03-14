let ORIENTDB_HOME = process.env.ORIENTDB_HOME;

let sampleDbName = 'test_sample';

const server = {
    pass: process.env.DATABASE_SERVER_PASS || 'root',
    user: process.env.DATABASE_SERVER_USER || 'root',
    port: process.env.DATABASE_PORT || 2480,
    host: process.env.DATABASE_HOST || 'localhost' 
}

const db = {
    name: sampleDbName,
    url: `plocal:${ORIENTDB_HOME}/databases/${sampleDbName}`,
    pass: process.env.DATABASE_PASS || 'admin',
    user: process.env.DATABASE_USER || 'admin',
    host: server.host,
    port: server.port,
    export: `${__dirname}/../data/sample_db.gz` 
}

module.exports = {server, db, app: {port: process.env.PORT || 8080}};
