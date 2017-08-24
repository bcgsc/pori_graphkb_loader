'use strict';

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const conf = require('./../config/db'); // get the database connection configuration
const routes = require('./routes');
const app = express();
const {connectServer, connectDB} = require('./repo/connect');
let server, repo, appServer;


// set up middleware parser to deal with jsons
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
const port = process.env.PORT || 8080;

// set up the routes
const router = express.Router();
app.use('/api', router);
router.use((req, res, next) => {
    console.log('processing api request');
    next();
});

connectServer(conf)
    .then((result) => {
        server = result;
        return connectDB({name: conf.dbName, password: conf.dbPassword, username: conf.dbUsername, server: server});
    }).then((db) => {
        repo = db;
        // start up the server
        routes(router, repo); // second arg here is the DB
        
        // last catch any errors for undefined routes
        // all actual routes should be defined above
        app.use((req, res) => {
            res.status(404);
            res.send({error: 'Not Found'});
        });

        appServer = app.listen(port, () => {
            console.log('server started on port: ' + port);
        });
    }).catch((error) => {
        console.log('error in connection', error);
    });





// cleanup
const cleanup = (msg='') => {
    console.log('cleaning up', msg);
    appServer.close();
    server.close();
    process.exit();
};
process.on('SIGINT', cleanup);
process.on('uncaughtException', cleanup);
