'use strict';

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const defaultConf = require('./../config/default'); // get the database connection configuration
const addRoutes = require('./routes');
const OrientDB  = require('orientjs');
const {loadSchema} = require('./repo/schema');
const auth = require('./middleware/auth');
const {parseNullQueryParams} = require('./middleware');
const fs = require('fs');


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
            console.log('loading the schema');
        }
    } catch (err) {
        server.close();
        throw err;
    }
    let schema;
    try {
        schema = await loadSchema(db, verbose);
    } catch (err) {
        server.close();
        throw err;
    }
    if (verbose) {
        console.log('loaded the schema');
    }
    // create the admin user
    return {server, db, schema};
};


class AppServer {
    constructor(conf={app: {}}, verbose=false) {
        this.app = express();
        this.verbose = verbose;
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
        if (verbose) {
            this.router.use((req, res, next) => {
                console.log(`[${req.method}] ${req.url}`, req.body);
                next();
            });
        }
        this.router.use(auth.checkToken);
        this.router.use(parseNullQueryParams);
    }
    async listen() {
        // connect to the database
        const {db, schema} = await connectDB(this.conf, this.verbose);
        this.db = db;
        // create the authentication certificate for managing tokens
        if (! auth.keys.private) {
            auth.keys.private = fs.readFileSync(this.conf.private_key);
        }
        // add the db connection reference to the routes
        addRoutes({router: this.router, db: this.db, schema: schema, verbose: this.verbose});
        // last catch any errors for undefined routes. all actual routes should be defined above
        this.app.use((req, res) => {
            res.status(404);
            res.send({error: 'Not Found', name: 'UrlNotFound', message: 'The requested url does not exist'});
        });
        //appServer = await https.createServer({cert: keys.cert, key: keys.private, rejectUnauthorized: false}, app).listen(conf.app.port || defaultConf.app.port);
        this.server = await this.app.listen(this.conf.app.port || defaultConf.app.port);
        if (this.verbose) {
            console.log('started application server at:', this.server.address().port);
        }
    }
    async close() {
        if (this.verbose)
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
