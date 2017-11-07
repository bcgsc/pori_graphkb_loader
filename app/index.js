'use strict';

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const conf = require('./../config/db'); // get the database connection configuration
const routes = require('./routes');
const {connectServer, connectDB} = require('./repo/connect');

const listen = async (port) => {
    const app = express();
    const {connectServer, connectDB} = require('./repo/connect');
    
    // set up middleware parser to deal with jsons
    app.use(bodyParser.urlencoded({extended: true}));
    app.use(bodyParser.json());
    
    // set up the routes
    const router = express.Router();
    app.use('/api', router);
    router.use((req, res, next) => {
        console.log('(HTTP request)', req.method, req.url);
        next();
    });
    // connect to the database
    const dbServer = await connectServer(conf);
    const dbConn = await connectDB({name: conf.dbName, password: conf.dbPassword, username: conf.dbUsername, server: dbServer});
    // add the db connection reference to the routes
    routes(router, dbConn);
    // last catch any errors for undefined routes. all actual routes should be defined above
    app.use((req, res) => {
        res.status(404);
        res.send({error: 'Not Found'});
    });
    
    const appServer = await app.listen(port);
    console.log('started application server at:', appServer.address().port)
    // cleanup
    const cleanup = (msg='') => {
        console.log('cleaning up', msg);
        appServer.close();
        dbServer.close();
        process.exit();
    };
    process.on('SIGINT', cleanup);
    process.on('uncaughtException', cleanup);
    return app;
};


module.exports = listen(process.env.PORT || 8080);
