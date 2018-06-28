'use strict';

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const addRoutes = require('./routes');
const OrientDB  = require('orientjs');
const {loadSchema} = require('./repo/schema');
const auth = require('./middleware/auth');
const {generateSwaggerSpec} = require('./routes/openapi');
const {checkToken, generateToken, catsToken} = require('./middleware/auth');  // WARNING: middleware fails if function is not imported by itself
const fs = require('fs');
const http = require('http');
const {VERBOSE} = require('./repo/util');
const HTTP_STATUS = require('http-status-codes');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const {parse} = require('./parser/variant');
const jc = require('json-cycle');
const cors = require('cors');

const logRequests = (req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    if (process.env.DEBUG === '1') {
        console.log(req.headers);
    }
    return next();
};


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
        // add some basic logging
        if (VERBOSE) {
            this.app.use(logRequests);
        }
        this.app.use(cors({
            origin: true
        }));


        this.db = null;
        this.server = null;
        this.conf = conf;

        // set up the routes
        this.router = express.Router();
        this.prefix = `/api/v${process.env.npm_package_version || 'test'}`;
        if (VERBOSE) {
            console.log('AppServer prefix', this.prefix);
        }
        this.app.use(this.prefix, this.router);

        this.router.route('/token').post(async (req, res) => {
            // generate a token to return to the user
            if (req.body.username === undefined || req.body.password === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'body requires both username and password to generate a token'});
            }
            // first level authentication
            let cats = {user: req.body.username, token: null};
            if (! this.conf.disableCats) {  // FOR TESTING
                try {
                    cats = await catsToken(req.body.username, req.body.password);
                } catch (err) {
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
                }
            }
            // kb-level authentication
            let token;
            try {
                token = await generateToken(this.db, cats.user, cats.exp);
            } catch (err) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
            }
            return res.status(HTTP_STATUS.OK).json({kbToken: token, catsToken: cats.token});
        });

        // add the variant parser route
        this.router.post('/parser/variant', async (req, res) => {
            try {
                const parsed = parse(req.body.content);
                res.status(HTTP_STATUS.OK).json({result: parsed});
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(err);
            }
        });
    }

    /**
     * Connect to the database, start the API server, and set dynamically built routes
     */
    async listen() {
        // connect to the database
        if (VERBOSE) {
            console.log('starting db connection');
        }
        const {db, schema} = await connectDB(this.conf);
        this.db = db;
        this.schema = schema;
        // set up the swagger docs
        this.spec = generateSwaggerSpec(schema, {port: this.conf.app.port});
        this.router.use('/spec', swaggerUi.serve, swaggerUi.setup(this.spec, {swaggerOptions: {
            deepLinking: true,
            displayOperationId: true,
            defaultModelRendering: 'model',
            operationsSorter: 'alpha',
            tagsSorter: 'alpha',
            docExpansion: 'none'
        }}));

        this.router.get('/schema', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({schema: jc.decycle(schema)});
        });

        this.router.use(checkToken);

        // create the authentication certificate for managing tokens
        if (! auth.keys.private) {
            auth.keys.private = fs.readFileSync(this.conf.private_key);
        }
        // add the db connection reference to the routes
        addRoutes({router: this.router, db: this.db, schema: schema});
        if (VERBOSE) {
            console.log('Adding 404 capture');
        }
        // catch any other errors
        this.router.use((err, req, res, next) => {  // error handling
            console.error(err.stack);
            return res.status(err.code || HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
        });
        // last catch any errors for undefined routes. all actual routes should be defined above
        this.app.use((req, res) => {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                error: 'Not Found',
                name: 'UrlNotFound',
                message: 'The requested url does not exist',
                url: req.url,
                method: req.method
            });
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
