"use strict";
/* establishes a connection with the orientdb server */
const OrientDB  = require('orientjs');
const models = require('./models');

module.exports = (opt) => {
    const auth = {
        user: opt.dbUsername,
        pass: opt.dbPassword
    };

    // set up the database server
    const server = OrientDB({
        host: opt.host,
        HTTPport: opt.port,
        username: opt.serverUsername,
        password: opt.serverPassword
    });

    // connect to the database through the db server
    const db = server.use({
        name: opt.dbName,
        username: opt.dbUsername,
        password: opt.dbPassword
    });
    console.log('Using Database:'  + db.name);
    

    const nsp = {model: models(db), db:db, server: server};
    nsp.model.publication.db.class.list()
        .then((classes) => {
            console.log('has the following classes');
            for (let c of classes) {
                console.log(` - ${c.name}`);
            }
        }).catch((error) => {
            console.log('error: in listing the classes');
        });
    return nsp;
};
