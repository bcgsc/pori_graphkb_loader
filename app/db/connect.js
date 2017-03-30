"use strict";
/* establishes a connection with the orientdb server */
const OrientDB  = require('orientjs');

module.exports = (opt) => {
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
        const connection = {
            server: server,
            conf: serverConf,
            reconnect: function() {
                this.server = OrientDB(this.conf);
            },
            drop: function(opt) {
                return new Promise((resolve, reject) => {
                    this.server.drop(opt)
                        .then(() => {
                            resovle();
                        }).catch((error) => {
                            if (error.type === 'com.orientechnologies.common.io.OIOException') { // connection dropped. reconnect
                                this.reconnect();
                                return this.server.drop(opt);
                            } else {
                                reject(error);
                            }
                        }).then(() => {
                            resolve();
                        }).catch((error) => {
                            reject(error);
                        });
                });
            },
            create: function(opt) {
                return this.server.create(opt);
            }
        }
        server.list()
            .then((dbList) => {
                console.log('Databases on the Server:');
                for (let c of dbList) {
                    console.log(` - ${c.name}`);
                }
                resolve(connection);
            }).catch((error) => {
                console.log('error listing databases:', error);
                reject(error);
            })
    });
};
