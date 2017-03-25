"use strict";
const OrientDB = require('orientjs');

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
        password: opt.serverPassword,
        useToken: true
    });
    
    // try listing all the databases on the server
    /*
    const dbs = server.list()
    .then((dbs) => {
        console.log('dbs.length: ' + dbs.length);
    }).catch(error => {
        console.log('Exception:' + error);
    });
    
    console.log('dbs' + dbs);*/
    
    // connect to the database through the db server
    const db = server.use({
        name: opt.dbName,
        username: opt.dbUsername,
        password: opt.dbPassword
    });
    console.log('Using Database:'  + db.name);
    
    return {
        server:server,
        db:db,
        publication: require('./publication.js')
    };
}; 
