"use strict";

// required packages
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const OrientDB = require('orientjs');
const conf = require('./config/db');  // get the database connection configuration
const db = require('./app/models/kb_orient')(conf);

// set up middleware parser to deal with jsons
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const port = 8080;

// set up the routes
const router = express.Router();
app.use('/api', router);
router.use((req, res, next) => {
    console.log('processing api request');
    next();
});

require('./app/routes')(router, db); // second arg here is the DB

// last catch any errors for undefined routes
// all actual routes should be defined above
app.use((req, res, next) => {
    res.status(404);
    res.send({error: 'Not Found'});
});

// start the server

const appServer = app.listen(port, () => {
    console.log('server started on port: ' + port);
});

// cleanup
const cleanup = (msg='') => {
    console.log('cleaning up', msg);
    appServer.close();
    db.close()
    .then(() => {
        server.close();
        process.exit();
    }).catch(err => {
        console.log('error in closing the db/server', err);
    });
};
process.on('SIGINT', cleanup);
process.on('uncaughtException', cleanup);
process.on('exit', cleanup);
