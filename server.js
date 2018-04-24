'use strict';

// required packages
const conf = require('./test/config/sample'); // get the database connection configuration
const app = require('./app');
const auth = require('./app/middleware/auth');
const {PERMISSIONS} = require('./app/repo/constants');
const fs = require('fs');

// cleanup
process.on('SIGINT', app.close);
//process.on('uncaughtException', app.close);



(async () => {
    try {
        console.log('creating certificate');
        console.log('creating the admin test token');
        auth.keys.private = fs.readFileSync(conf.private_key);
        const admin = {name: 'admin', '@rid': '#41:0'};
        const checkToken = async (req, res, next) => {
            req.user = admin;
            next();
        };
        auth.checkToken = checkToken;
        const adminToken = await auth.generateToken({user: admin}, 10000000000);
        console.log('test adminToken');
        console.log(adminToken);
        app.listen(conf, true);
    } catch(err) {
        console.error('Failed to start server', err);
        app.close();
        throw err;
    }
})();

