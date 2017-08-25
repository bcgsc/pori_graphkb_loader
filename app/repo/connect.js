'use strict';
/* establishes a connection with the orientdb server */
const OrientDB  = require('orientjs');
const {AttributeError} = require('./error');
const {createPermissionsClass} = require('./permissions');
const Promise = require('bluebird');
// model DB classes
const {KBVertex, KBEdge, KBUser, KBRole, History, Record} = require('./base.js');
const {Context} = require('./context.js');
const {Event, PositionalEvent, CategoryEvent} = require('./event.js');
const {Evidence, Publication, Study, Journal, ClinicalTrial, ExternalSource} = require('./evidence.js');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf} = require('./feature');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDeprecatedBy} = require('./ontology.js');
const {Position, Range, GenomicPosition, ExonicPosition, CodingSequencePosition, ProteinPosition, CytobandPosition} = require('./position.js');
const {Review, ReviewAppliesTo} = require('./review.js');
const {Statement, AppliesTo, AsComparedTo, Requires, SupportedBy} = require('./statement.js');
const {Target} = require('./target.js');
const {Vocab} = require('./vocab.js');


const defaultHeirarchy = [
    [KBRole, History],
    [KBUser],
    [KBVertex, KBEdge],
    [Position, Context, Evidence, Vocab],
    [
        Range, GenomicPosition, ExonicPosition, CodingSequencePosition, ProteinPosition, CytobandPosition,
        Ontology, Feature, Statement, Study, Journal, ExternalSource, Event, Target
    ],
    [
        ClinicalTrial, Publication, 
        Review, AppliesTo, AsComparedTo, Requires, SupportedBy, 
        Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDeprecatedBy,
        PositionalEvent, CategoryEvent,
        FeatureDeprecatedBy, FeatureAliasOf
    ]
];


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

    buildModels(models, create) {
        return new Promise((resolve, reject) => {
            Promise.all(Array.from(models, x => create ? x.createClass(this) : x.loadClass(this)))
                .then(() => {
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    getRecord(rid) {
        return new Promise((resolve, reject) => {
            this.conn.record.get(rid)
                .then((rec) => {
                    resolve(new Record(rec));
                }).catch((err) => {
                    reject(err);
                });
        });
    }

    buildHeirarchyRecursive(heirarchy, depth, create=true) {
        return new Promise((resolve, reject) => {
            if (depth >= heirarchy.length) {
                resolve();
            } else {
                this.buildModels(heirarchy[depth], create)
                    .then(() => {
                        return this.buildHeirarchyRecursive(heirarchy, depth + 1, create);
                    }).then(() => {
                        resolve();
                    }).catch((error) => {
                        reject(error);
                    });
            }
        });
    }
    buildHeirarchy(heirarchy, create=true) {
        return this.buildHeirarchyRecursive(heirarchy, 0, create);
    }

    loadModels() {
        return this.buildHeirarchyRecursive(defaultHeirarchy, 0, false);
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
            }).then(() => {
                resolve(result);
            }).catch((error) => {
                reject(error);
            });
    });
};


const connectDB = (opt) => {
    return new Promise((resolve, reject) => {
        for (let param of ['server', 'name', 'username', 'password']) {
            if (opt[param] === undefined) {
                throw new AttributeError(`missing required attribute ${param}`);
            }
        }
        const result = new DB(null, opt.name);

        result.conn = opt.server.use({name: opt.name, username: opt.username, password: opt.password});
        result.loadModels()
            .then(() => {
                resolve(result);
            }).catch((error) => {
                reject(error);
            });
    });
};

module.exports = {connectServer, createDB, connectDB, defaultHeirarchy};
