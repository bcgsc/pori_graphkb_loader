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
conf.db.name = `kbapi_${process.env.DATABASE_NAME ? process.env.DATABASE_NAME : `v${process.env.npm_package_version}` }`;
delete conf.port;

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
            const user = await createUser(db, {model: schema.User, userName: process.env.USER || 'admin', groupNames: ['admin']});
            if (verbose) {
                console.log('created the user:', user);
            }
            await db.close();
        }

        console.log('creating certificate');
        auth.keys.private = fs.readFileSync(conf.private_key);
        //conf.disableCats = true;
        app = new AppServer(conf);
        await app.listen();

        // if the user starting the server does not exist, add them as an admin
        try {
            await createUser(app.db, {model: app.schema.User, userName: process.env.USER || 'admin', groupNames: ['admin']});
        } catch (err) {
        }
        // cleanup
        process.on('SIGINT', async () => {
            if (app) {
                await app.close();
            }
            process.exit(1);
        });
    } catch(err) {
        console.error('Failed to start server', err);
        app.close();
        throw err;
    }
})();

