'use strict';

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const addRoutes = require('./routes');
const OrientDB  = require('orientjs');
const {loadSchema} = require('./repo/schema');
const auth = require('./middleware/auth');
const fs = require('fs');
const http = require('http');
const {VERBOSE} = require('./repo/util');


const connectDB = async (conf) => {
    // set up the database server
    const server = OrientDB({
        host: conf.server.host,
        HTTPport: conf.server.port,
        username: conf.server.user,
        password: conf.server.pass
    });
    if (VERBOSE) {
        console.log(`connecting to the database: ${conf.db.name} as ${conf.db.user}`);
    }
    let db;
    try {
        db = await server.use({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
        if (VERBOSE) {
            console.log('loading the schema');
        }
    } catch (err) {
        server.close();
        throw err;
    }
    let schema;
    try {
        schema = await loadSchema(db);
    } catch (err) {
        db.close();
        throw err;
    }
    if (VERBOSE) {
        console.log('loaded the schema');
    }
    // create the admin user
    return {server, db, schema};
};


class AppServer {
    constructor(conf={app: {}}) {
        this.app = express();
        // set up middleware parser to deal with jsons
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.use(bodyParser.json());
        this.db = null;
        this.server = null;
        this.conf = conf;

        // set up the routes
        this.router = express.Router();
        this.app.use('/api', this.router);
        // add some basic logging
        if (VERBOSE) {
            this.router.use((req, res, next) => {
                console.log(`[${req.method}] ${req.url}`, req.body);
                next();
            });
        }
        this.router.use(auth.checkToken);
    }
    async listen() {
        // connect to the database
        if (VERBOSE) {
            console.log('starting db connection');
        }
        const {db, schema} = await connectDB(this.conf);
        this.db = db;
        // create the authentication certificate for managing tokens
        if (! auth.keys.private) {
            auth.keys.private = fs.readFileSync(this.conf.private_key);
        }
        // add the db connection reference to the routes
        addRoutes({router: this.router, db: this.db, schema: schema});
        if (VERBOSE) {
            console.log('Adding 404 capture');
        }
        // last catch any errors for undefined routes. all actual routes should be defined above
        this.app.use((req, res) => {
            res.status(404);
            res.send({error: 'Not Found', name: 'UrlNotFound', message: 'The requested url does not exist'});
        });
        //appServer = await https.createServer({cert: keys.cert, key: keys.private, rejectUnauthorized: false}, app).listen(conf.app.port || defaultConf.app.port);
        this.server = await http.createServer(this.app).listen(this.conf.app.port);
        //this.server = await this.app.listen(this.conf.app.port, this.conf.app.host);
        if (VERBOSE) {
            console.log('started application server at:', this.server.address().host, this.server.address().port);
        }
    }
    async close() {
        if (VERBOSE)
            console.log('cleaning up');
        try {
            if (this.server) {
                await this.server.close();
            }
        } catch (err) {
            console.error(err);
        }
        try {
            if (this.db) {
                await this.db.close();
            }
        } catch (err) {
            console.error(err);
        }
    }
}

module.exports = {AppServer};
