'use strict';

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const defaultConf = require('./../config/default'); // get the database connection configuration
const add_routes = require('./routes');
const {connectServer, connectDB} = require('./repo/connect');


let orientServer, dbServer, appServer;
const app = express();
// set up middleware parser to deal with jsons
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

// set up the routes
const router = express.Router();
app.use('/api', router);
router.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
});

const listen = async (conf={app: {}}) => {
    orientServer = await connectServer(Object.assign({}, defaultConf.server, conf.server));
    dbServer = await connectDB(Object.assign({}, defaultConf.db, conf.db, {server: orientServer}));
    // add the db connection reference to the routes
    add_routes(router, dbServer);
    // last catch any errors for undefined routes. all actual routes should be defined above
    app.use((req, res) => {
        res.status(404);
        res.send({error: 'Not Found'});
    });
    appServer = await app.listen(conf.app.port || defaultConf.app.port);
    console.log('started application server at:', appServer.address().port);

}

const close = async () => {
    console.log('cleaning up');
    try {
        if (appServer) {
            await appServer.close();
        }
    } catch (err) {
        console.error(err);
    }
    try {
        if (dbServer) {
            await dbServer.close();
        }
    } catch (err) {
        console.error(err);
    }
    process.exit();
}

module.exports = {app, listen, close};
