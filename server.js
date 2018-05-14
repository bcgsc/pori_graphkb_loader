'use strict';

// required packages
const conf = require('./test/config/sample'); // get the database connection configuration
const {AppServer} = require('./app');
const auth = require('./app/middleware/auth');
const fs = require('fs');
const {createSchema, loadSchema} = require('./app/repo/schema');
const {createUser} = require('./app/repo/base');
const OrientDB  = require('orientjs');


//process.on('uncaughtException', app.close);
let app;

(async () => {
    try {
        const verbose = conf.verbose || process.env.VERBOSE !== '';
        // set up the database server
        const server = OrientDB({
            host: conf.server.host,
            HTTPport: conf.server.port,
            username: conf.server.user,
            password: conf.server.pass
        });
        const exists = await server.exists({name: conf.db.name});
        if (verbose) {
            console.log('db exists', exists, conf.db.name);
        }
        let db, schema;
        if (! exists) {
            if (verbose) {
                console.log('creating the db', conf.db.name);
            }
            db = await server.create({name: conf.db.name, username: conf.db.user, password: conf.db.pass});
            await db.query('alter database custom standardElementConstraints=false');
            if (verbose) {
                console.log('create the schema');
            }
            await createSchema(db, verbose);
            schema = await loadSchema(db, verbose);
            // create the admin user
            const user = await createUser(db, {model: schema.User, userName: 'admin', groupNames: ['admin']});
            if (verbose) {
                console.log('created the user:', user);
            }
            await server.close();
        }
        console.log('creating certificate');
        console.log('creating the admin test token');
        auth.keys.private = fs.readFileSync(conf.private_key);
        const admin = {name: 'admin', '@rid': '#41:0'};
        const checkToken = async (req, res, next) => {
            req.user = admin;
            next();
        };
        auth.checkToken = checkToken;
        const adminToken = await auth.generateToken({user: admin}, null);
        console.log('test adminToken');
        console.log(adminToken);
        app = new AppServer(conf, true, false);
        app.listen();
        // cleanup
        process.on('SIGINT', async () => {
            await app.close();
            process.exit(1);
        });
    } catch(err) {
        console.error('Failed to start server', err);
        app.close();
        throw err;
    }
})();

