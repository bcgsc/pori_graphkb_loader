'use strict';
/* establishes a connection with the orientdb server */
const OrientDB  = require('orientjs');
const {AttributeError} = require('./error');

/**
 * connects to the server using the config
 * @returns {Promise<orientjs.Server,AttributeError>} returns the server instance on resolve and an
 * attribute error on reject which happens if a required parameter was not given
 */
const connectServer = (opt) => {
    return new Promise((resolve, reject) => {
        for (let param of ['host', 'port', 'serverUsername', 'serverPassword']) {
            if (opt[param] === undefined) {
                throw new AttributeError(`missing required attribute ${param}`);
            }
        }
        const serverConf = {
            host: opt.host,
            HTTPport: opt.port,
            username: opt.serverUsername,
            password: opt.serverPassword
        };
        // set up the database server
        const server = OrientDB(serverConf);
        server.list()
            .then(() => {
                resolve(server);
            }).catch((error) => {
                console.log('error listing databases:', error);
                reject(error);
            });
    });
};

const createDB = (opt) => {
    return new Promise((resolve, reject) => {
        for (let param of ['server', 'name', 'username', 'password']) {
            if (opt[param] === undefined) {
                throw new AttributeError(`missing required attribute ${param}`);
            }
        }
        if (opt.models === undefined) {
            opt.models = {};
        }
        const result = {server: opt.server, name: opt.name, db: null, models: {}};
        const modelNames = Object.keys(opt.models);
        const modelClasses = Array.from(modelNames, x => opt.models[x]);

        opt.server.create({name: opt.name, username: opt.username, password: opt.password})
            .then((con) => {
                result.db = con;
                // alter db to relax blueprint constraints (otherwise null property value error)
                return result.db.query('alter database custom standardElementConstraints=false');
            }).then(() => {
                // now initialize all models
                return Promise.all(Array.from(modelClasses, x => x.createClass(result.db)));
            }).then((modelsList) => {
                for (let i = 0; i < modelsList.length; i++) {
                    result.models[modelNames[i]] = modelsList[i]; 
                }
                resolve(result);
            }).catch((error) => {
                reject(error);
            });
    });
};

module.exports = {connectServer, createDB};
