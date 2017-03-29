const conf = require('./config');
const shell = require('shelljs');
let ORIENTDB_HOME = process.env.ORIENTDB_HOME

console.log('\n\nsetting up the empty database\n')
/* set up and load the database with the dummy data */
const commands1 = [
    'set echo true',
    `connect remote:localhost ${conf.serverUsername} ${conf.serverPassword}`,
    'list databases',
    `CREATE DATABASE ${conf.emptyDbUrl} ${conf.serverUsername} ${conf.serverPassword} plocal`,
    ];

shell.exec(`${ORIENTDB_HOME}/bin/console.sh "${commands1.join('; ')}"`);

/* set up and create the empty database */
console.log('\n\nsetting up the dummy database\n')
const commands2 = [
    'set echo true',
    `connect remote:localhost ${conf.serverUsername} ${conf.serverPassword}`,
    'list databases',
    `CREATE DATABASE ${conf.dummyDbUrl} ${conf.serverUsername} ${conf.serverPassword} plocal`
    ];

var temp = `${ORIENTDB_HOME}/bin/console.sh "${commands2.join('; ')}"`;
console.log('executing:', temp);
shell.exec(temp);
