

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const OrientDB = require('orientjs');
const fs = require('fs');
const http = require('http');
const jc = require('json-cycle');
const cors = require('cors');
const HTTP_STATUS = require('http-status-codes');
const swaggerUi = require('swagger-ui-express');

const {parse} = require('knowledgebase-parser').variant;

const auth = require('./middleware/auth');
const {logger} = require('./repo/logging');
const {
    checkToken, generateToken, catsToken
} = require('./middleware/auth'); // WARNING: middleware fails if function is not imported by itself

const {loadSchema} = require('./repo/schema');

const {generateSwaggerSpec} = require('./routes/openapi');
const {addResourceRoutes} = require('./routes/util');


const logRequests = (req, res, next) => {
    logger.log('info', `[${req.method}] ${req.url}`);
    return next();
};


const connectDB = async (conf) => {
    // set up the database server
    const server = OrientDB({
        host: conf.server.host,
        port: conf.server.port,
        username: conf.server.user,
        password: conf.server.pass
    });
    logger.log('info', `connecting to the database (${conf.db.name}) as ${conf.db.user}`);
    let db;
    try {
        db = await server.use({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
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
    // create the admin user
    return {server, db, schema};
};


class AppServer {
    constructor(conf = {app: {}}) {
        this.app = express();
        // set up middleware parser to deal with jsons
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.use(bodyParser.json());
        // add some basic logging
        this.app.use(logRequests);
        this.app.use(cors({
            origin: true
        }));


        this.db = null;
        this.server = null;
        this.conf = conf;

        // set up the routes
        this.router = express.Router();
        this.prefix = `/api/v${process.env.npm_package_version || 'test'}`;
        this.app.use(this.prefix, this.router);

        this.router.route('/token').post(async (req, res) => {
            // generate a token to return to the user
            if (req.body.username === undefined || req.body.password === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'body requires both username and password to generate a token'});
            }
            // first level authentication
            let cats = {user: req.body.username, token: null};
            if (!this.conf.disableCats) { // FOR TESTING
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
        logger.log('info', `starting db connection (${this.conf.server.host}:${this.conf.server.port})`);
        const {db, schema} = await connectDB(this.conf);
        this.db = db;
        this.schema = schema;
        // set up the swagger docs
        this.spec = generateSwaggerSpec(schema, {port: this.conf.app.port});
        this.router.use('/spec', swaggerUi.serve, swaggerUi.setup(this.spec, {
            swaggerOptions: {
                deepLinking: true,
                displayOperationId: true,
                defaultModelRendering: 'model',
                operationsSorter: 'alpha',
                tagsSorter: 'alpha',
                docExpansion: 'none'
            }
        }));

        this.router.get('/schema', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({schema: jc.decycle(schema)});
        });

        this.router.use(checkToken);

        // create the authentication certificate for managing tokens
        if (!auth.keys.private) {
            auth.keys.private = fs.readFileSync(this.conf.private_key);
        }
        // simple routes
        for (const model of Object.values(schema)) {
            addResourceRoutes({
                router: this.router, model, db, schema
            });
        }

        logger.log('info', 'Adding 404 capture');
        // catch any other errors
        this.router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
            logger.log('error', err.stack);
            return res.status(err.code || HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
        });
        // last catch any errors for undefined routes. all actual routes should be defined above
        this.app.use((req, res) => res.status(HTTP_STATUS.NOT_FOUND).json({
            error: `Not Found: ${req.route}`,
            name: 'UrlNotFound',
            message: `The requested url does not exist: ${req.url}`,
            url: req.url,
            method: req.method
        }));

        this.server = await http.createServer(this.app).listen(this.conf.app.port);
        logger.log('info', `started application server (${this.server.address().host || process.env.HOSTNAME}:${this.server.address().port})`);
    }

    async close() {
        logger.log('info', 'cleaning up');
        try {
            if (this.server) {
                await this.server.close();
            }
        } catch (err) {
            logger.log('error', err);
        }
        try {
            if (this.db) {
                await this.db.close();
            }
        } catch (err) {
            logger.log('error', err);
        }
    }
}

module.exports = {AppServer};
