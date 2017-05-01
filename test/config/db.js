let ORIENTDB_HOME = process.env.ORIENTDB_HOME;

let emptyDbName = 'test_empty';
let dummyDbName = 'test_dummy';

module.exports = {
    host: 'localhost',
    port: 2480,
    serverUsername: 'root',
    serverPassword: 'root',
    dbUsername: 'admin',
    dbPassword: 'admin',
    emptyDbName: emptyDbName,
    dummyDbName: dummyDbName,
    emptyDbUrl: `plocal:${ORIENTDB_HOME}/databases/${emptyDbName}`,
    dummyDbUrl: `plocal:${ORIENTDB_HOME}/databases/${dummyDbName}`,
};
