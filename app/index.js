"use strict";

// required packages
import express from 'express';
import bodyParser from 'body-parser';
import conf from './../config/db'; // get the database connection configuration
import connect from './db/connect';
import routes from './routes';
const app = express();
const repo = connect(conf);

// set up middleware parser to deal with jsons
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const port = process.env.PORT || 8080;

// set up the routes
const router = express.Router();
app.use('/api', router);
router.use((req, res, next) => {
    console.log('processing api request');
    next();
});

routes(router, repo); // second arg here is the DB

// last catch any errors for undefined routes
// all actual routes should be defined above
app.use((req, res, next) => {
    res.status(404);
    res.send({error: 'Not Found'});
});

// start the server

const appServer = app.listen(port, () => {
    console.log('server started on port: ' + port);
});

// cleanup
const cleanup = (msg='') => {
    console.log('cleaning up', msg);
    appServer.close();
    repo.db.close()
    .then(() => {
        repo.server.close();
        process.exit();
    }).catch(err => {
        console.log('error in closing the db/server', err);
    });
};
process.on('SIGINT', cleanup);
process.on('uncaughtException', cleanup);
