'use strict';
/* establishes a connection with the orientdb server */
const OrientDB  = require('orientjs');
const {AttributeError} = require('./error');
const {createPermissionsClass} = require('./permissions');
const Promise = require('bluebird');


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


class DB {

    constructor(connection, name) {
        this.conn = connection;
        this.name = name;
        this.models = {};
    }

    get server() {
        return this.conn.server;
    }

    buildModels(models) {
        return new Promise((resolve, reject) => {
            Promise.all(Array.from(models, x => x.createClass(this)))
                .then(() => {
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    buildHeirarchyRecursive(heirarchy, depth) {
        return new Promise((resolve, reject) => {
            if (depth >= heirarchy.length) {
                resolve();
            } else {
                this.buildModels(heirarchy[depth])
                    .then(() => {
                        return this.buildHeirarchyRecursive(heirarchy, depth + 1);
                    }).then(() => {
                        resolve();
                    }).catch((error) => {
                        reject(error);
                    });
            }
        });
    }
    buildHeirarchy(heirarchy) {
        return this.buildHeirarchyRecursive(heirarchy, 0);
    }
}

const createDB = (opt) => {
    return new Promise((resolve, reject) => {
        opt.heirarchy = opt.heirarchy || [];
        for (let param of ['server', 'name', 'username', 'password']) {
            if (opt[param] === undefined) {
                throw new AttributeError(`missing required attribute ${param}`);
            }
        }
        const result = new DB(null, opt.name);

        opt.server.create({name: opt.name, username: opt.username, password: opt.password})
            .then((con) => {
                result.conn = con;
                // alter db to relax blueprint constraints (otherwise null property value error)
                return result.conn.query('alter database custom standardElementConstraints=false');
            }).then(() => {
                return createPermissionsClass(result);
            }).then(() => {
                // now initialize all models
                return result.buildHeirarchy(opt.heirarchy);
            }).then((modelsList) => {
                resolve(result);
            }).catch((error) => {
                reject(error);
            });
    });
};

module.exports = {connectServer, createDB};
