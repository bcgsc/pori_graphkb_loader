

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
const {getPortPromise} = require('portfinder');

const {logger} = require('./repo/logging');
const {selectCounts} = require('./repo/base');
const {AttributeError} = require('./repo/error');
const {
    checkToken
} = require('./middleware/auth'); // WARNING: middleware fails if function is not imported by itself

const {loadSchema} = require('./repo/schema');

const {generateSwaggerSpec} = require('./routes/openapi');
const {addResourceRoutes} = require('./routes/util');
const {addPostToken} = require('./routes/auth');
const {addKeywordSearchRoute} = require('./routes');

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
    /**
     * @property {express} app the express app instance
     * @property {?http.Server} server the http server running the API
     * @property {?orientjs.Db} the orientjs database connection
     * @property {express.Router} router the main router
     * @property {string} prefix the prefix to use for all routes
     * @property {Object} conf the configuration object
     * @property {?Object.<string,ClassModel>} schema the mapping of class names to models for the db
     */
    constructor(conf = {app: {}}) {
        this.app = express();
        this.app.use(logRequests);
        // set up middleware parser to deal with jsons
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.use(bodyParser.json());
        // add some basic logging
        this.app.use(cors({
            origin: true
        }));


        this.db = null;
        this.schema = null;
        this.server = null;
        this.conf = conf;

        const {app: {host, port}} = conf;
        // app server info
        this.host = host || process.env.HOSTNAME || 'localhost';

        this.port = port !== null
            ? port || process.env.port
            : null;

        // set up the routes
        this.router = express.Router();
        this.prefix = '/api';
        this.app.use(this.prefix, this.router);
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
            },
            customCss: '.swagger-ui .info pre > code { display: block; color: #373939}'
        }));

        this.router.get('/schema', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({schema: jc.decycle(schema)});
        });
        this.router.get('/version', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({
                api: process.env.npm_package_version,
                db: this.conf.db.name
            });
        });
        // read the key file if it wasn't already set
        if (!this.conf.privateKey) {
            logger.log('info', `reading the private key file: ${this.conf.privateKeyFile}`);
            this.conf.privateKey = fs.readFileSync(this.conf.privateKeyFile);
        }
        // if external auth is enabled, read the keycloak public key file for verifying the tokens
        if (!this.conf.disableAuth) {
            if (this.conf.keycloak && this.conf.keycloak.publicKeyFile && !this.conf.keycloak.publicKey) {
                logger.log('info', `reading the keycloak public key file: ${this.conf.keycloak.publicKeyFile}`);
                this.conf.keycloak.publicKey = fs.readFileSync(this.conf.keycloak.publicKeyFile);
            }
        }
        // add the addPostToken
        addPostToken({router: this.router, db, config: this.conf});

        this.router.use(checkToken(this.conf.privateKey));

        // simple routes
        for (const model of Object.values(schema)) {
            addResourceRoutes({
                router: this.router, model, db, schema
            });
        }
        addKeywordSearchRoute({router: this.router, db, config: this.conf});
        // add the stats route
        const classList = Object.keys(this.schema).filter(
            name => !this.schema[name].isAbstract
                && this.schema[name].subclasses.length === 0 // terminal classes only
                && !this.schema[name].embedded
        );
        this.router.get('/stats', async (req, res) => {
            let grouping = req.query.grouping || [];
            if (!(grouping instanceof Array)) {
                grouping = [grouping];
            }
            if (Object.keys(req.query) - !!req.query.grouping > 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError({
                    message: 'only accepts the grouping query parameter',
                    params: Object.keys(req.query)
                }));
            }
            try {
                const stats = await selectCounts(this.db, classList, grouping);
                return res.status(HTTP_STATUS.OK).json(jc.decycle({result: stats}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(jc.decycle(err));
                }
                logger.log('error', err || err.message);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(jc.decycle(err));
            }
        });

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

        if (!this.port) {
            logger.log('info', 'finding an available port');
            this.port = await getPortPromise();
        }
        this.server = http.createServer(this.app).listen(this.port, this.host);
        logger.log('info', `started application server (${this.host}:${this.port})`);
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
