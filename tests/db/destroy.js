const conf = require('./config');
const shell = require('shelljs');
let ORIENTDB_HOME = process.env.ORIENTDB_HOME

/* destroy dummy database */
const commands1 = [
    `CONNECT ${conf.emptyDbUrl} ${conf.dbUsername} ${conf.dbPassword}`,
    `DROP DATABASE`
    ];

shell.exec(`${ORIENTDB_HOME}/bin/console.sh "${commands1.join('; ')}"`);

/* destroy the empty database */
const commands2 = [
    `CONNECT ${conf.dummyDbUrl} ${conf.dbUsername} ${conf.dbPassword}`,
    `DROP DATABASE`
    ];

shell.exec(`${ORIENTDB_HOME}/bin/console.sh "${commands2.join('; ')}"`);
