"use strict";
/* establishes a connection with the orientdb server */
import OrientDB from 'orientjs';
import Publication from './publication';

export default function(opt){
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

    // connect to the database through the db server
    const db = server.use({
        name: opt.dbName,
        username: opt.dbUsername,
        password: opt.dbPassword
    });
    console.log('Using Database:'  + db.name);

    return {publication: new Publication(db), db: db, server: server};
};
