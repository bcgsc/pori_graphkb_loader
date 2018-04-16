'use strict';

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const defaultConf = require('./../config/default'); // get the database connection configuration
const add_routes = require('./routes');
const OrientDB  = require('orientjs');
const {loadSchema} = require('./repo/schema');
const {populateCache} = require('./repo/base');
const https = require('https');
const selfsigned = require('selfsigned');
const auth = require('./middleware/auth');


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
router.use(auth.checkToken)


const connectDB = async (conf, verbose=true) => {
    // set up the database server
    const server = OrientDB({
        host: conf.server.host,
        HTTPport: conf.server.port,
        username: conf.server.user,
        password: conf.server.pass
    });
    if (verbose) {
        console.log(`connecting to the database: ${conf.db.name} as ${conf.db.user}`);
    }
    let db;
    try {
        db = await server.use({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
        if (verbose) {
            console.log(`loading the schema`);
        }
    } catch (err) {
        server.close();
        throw err;
    }
    const schema = await loadSchema(db, verbose);
    // create the admin user
    return {server, db, schema};
};

const listen = async (conf={app: {}}, verbose=false) => {
    // connect to the database
    const {server, db, schema} = await connectDB(conf, verbose);
    orientServer = server;
    dbServer = db;
    // create the authentication certificate for managing tokens
    if (! auth.keys.key ) {
        const keys = await selfsigned.generate();
        auth.keys.key = keys.private;
    }
    // add the db connection reference to the routes
    add_routes({router, db, schema});
    // last catch any errors for undefined routes. all actual routes should be defined above
    app.use((req, res) => {
        res.status(404);
        res.send({error: 'Not Found'});
    });
    //appServer = await https.createServer({cert: keys.cert, key: keys.private, rejectUnauthorized: false}, app).listen(conf.app.port || defaultConf.app.port);
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
