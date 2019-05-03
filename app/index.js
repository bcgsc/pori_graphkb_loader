

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const http = require('http');
const jc = require('json-cycle');
const cors = require('cors');
const HTTP_STATUS = require('http-status-codes');
const swaggerUi = require('swagger-ui-express');
const {getPortPromise} = require('portfinder');

const {logger} = require('./repo/logging');
const {selectCounts} = require('./repo/commands');
const {AttributeError} = require('./repo/error');
const {
    checkToken
} = require('./middleware/auth'); // WARNING: middleware fails if function is not imported by itself

const {connectDB} = require('./repo');

const {generateSwaggerSpec} = require('./routes/openapi');
const {addResourceRoutes} = require('./routes/util');
const {addPostToken} = require('./routes/auth');
const {addKeywordSearchRoute, addGetRecordsByList} = require('./routes');
const config = require('./config');

const BOOLEAN_FLAGS = [
    'GKB_USER_CREATE',
    'GKB_DB_CREATE',
    'GKB_DISABLE_AUTH',
    'GKB_DB_MIGRATE'
];

const logRequests = (req, res, next) => {
    logger.log('info', `[${req.method}] ${req.url}`);
    return next();
};


const createConfig = (overrides = {}) => {
    const ENV = {
        GKB_HOST: process.env.HOSTNAME,
        ...config.common,
        ...config[process.env.NODE_ENV] || {}
    };
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('GKB_')) {
            ENV[key] = value;
        }
    }
    Object.assign(ENV, overrides);

    for (const flag of BOOLEAN_FLAGS) {
        if (typeof ENV[flag] === 'string') {
            if (['0', 'f', 'false'].includes(ENV[flag].toLowerCase().trim())) {
                ENV[flag] = false;
            } else {
                ENV[flag] = true;
            }
        } else {
            ENV[flag] = Boolean(ENV[flag]);
        }
    }
    console.log(ENV);

    return ENV;
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
    constructor(conf = createConfig()) {
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

        // app server info
        this.host = conf.GKB_HOST;
        this.port = conf.GKB_PORT;

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
        const {
            GKB_DB_HOST,
            GKB_DB_PORT,
            GKB_KEY_FILE,
            GKB_DB_NAME,
            GKB_DISABLE_AUTH,
            GKB_KEYCLOAK_KEY_FILE
        } = this.conf;

        logger.log('info', `starting db connection (${GKB_DB_HOST}:${GKB_DB_PORT})`);
        const {db, schema} = await connectDB(this.conf);
        this.db = db;
        this.schema = schema;
        // set up the swagger docs
        this.spec = generateSwaggerSpec(schema, {port: this.port});
        this.router.use('/spec', swaggerUi.serve, swaggerUi.setup(this.spec, {
            swaggerOptions: {
                deepLinking: true,
                displayOperationId: true,
                defaultModelRendering: 'model',
                operationsSorter: 'alpha',
                tagsSorter: (tag1, tag2) => {
                    // show the 'default' group at the top
                    if (tag1 === 'General') {
                        return -1;
                    } if (tag2 === 'General') {
                        return 1;
                    }
                    return tag1.localeCompare(tag2);
                },
                docExpansion: 'none'
            },
            customCss: '.swagger-ui .info pre > code { display: block; color: #373939}'
        }));
        this.router.get('/spec.json', (req, res) => {
            res.status(HTTP_STATUS.OK).json(this.spec);
        });

        this.router.get('/schema', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({schema: jc.decycle(schema)});
        });
        this.router.get('/version', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({
                api: process.env.npm_package_version,
                db: GKB_DB_NAME
            });
        });
        // read the key file if it wasn't already set
        if (!this.conf.GKB_KEY) {
            logger.log('info', `reading the private key file: ${GKB_KEY_FILE}`);
            this.conf.GKB_KEY = fs.readFileSync(GKB_KEY_FILE);
        }
        // if external auth is enabled, read the keycloak public key file for verifying the tokens
        if (!GKB_DISABLE_AUTH && GKB_KEYCLOAK_KEY_FILE && !this.conf.GKB_KEYCLOAK_KEY) {
            logger.log('info', `reading the keycloak public key file: ${GKB_KEYCLOAK_KEY_FILE}`);
            this.conf.GKB_KEYCLOAK_KEY = fs.readFileSync(GKB_KEYCLOAK_KEY_FILE);
        }
        // add the addPostToken
        addPostToken({router: this.router, db, config: this.conf});

        this.router.use(checkToken(this.conf.GKB_KEY));

        // simple routes
        for (const model of Object.values(schema)) {
            addResourceRoutes({
                router: this.router, model, db, schema
            });
        }
        addKeywordSearchRoute({router: this.router, db, config: this.conf});
        addGetRecordsByList({router: this.router, db, config: this.conf});
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

module.exports = {AppServer, createConfig};
