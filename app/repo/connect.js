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
const connectServer = async (opt) => {
    for (let param of ['host', 'port', 'user', 'pass']) {
        if (opt[param] === undefined) {
            return Promise.reject(new AttributeError(`missing required attribute ${param}`));
        }
    }
    const serverConf = {
        host: opt.host,
        HTTPport: opt.port,
        username: opt.user,
        password: opt.pass
    };
    // set up the database server
    const server = OrientDB(serverConf);
    try {
        await server.list();
        return Promise.resolve(server);
    } catch (err) {
        return Promise.reject(err);
    }
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
        return Promise.all(Array.from(models, x => create ? x.createClass(this) : x.loadClass(this)));
    }

    getRecord(rid) {
        return this.conn.record.get(rid)
            .then((rec) => {
                return new Record(rec);
            });
    }

    buildHeirarchyRecursive(heirarchy, depth, create=true) {
        if (depth >= heirarchy.length) {
            return Promise.resolve();
        } else {
            return this.buildModels(heirarchy[depth], create)
                .then(() => {
                    return this.buildHeirarchyRecursive(heirarchy, depth + 1, create);
                });
        }
        
    }
    buildHeirarchy(heirarchy, create=true) {
        return this.buildHeirarchyRecursive(heirarchy, 0, create);
    }

    loadModels() {
        return this.buildHeirarchyRecursive(defaultHeirarchy, 0, false);
    }

    async close() {
        await this.conn.close();
    }
}

const createDB = async (opt) => {
    opt.heirarchy = opt.heirarchy || [];
    for (let param of ['server', 'name', 'user', 'pass']) {
        if (opt[param] === undefined) {
            throw new AttributeError(`missing required attribute ${param}`);
        }
    }
    const db = new DB(null, opt.name);

    db.conn = await opt.server.create({name: opt.name, username: opt.user, password: opt.pass});
    await db.conn.query('alter database custom standardElementConstraints=false');
    await createPermissionsClass(db);
    await db.buildHeirarchy(opt.heirarchy);
    return db;
};


const connectDB = async (opt) => {
    for (let param of ['server', 'name', 'user', 'pass']) {
        if (opt[param] === undefined) {
            return Promise.reject(new AttributeError(`missing required attribute ${param}`));
        }
    }
    const db = new DB(null, opt.name);

    db.conn = opt.server.use({name: opt.name, username: opt.user, password: opt.pass});
    await db.loadModels();

    // add custom functions
    const get_related_ontology = `traverse both() from (select from ${Ontology.clsname} where name = :name) while $depth < 2 and @class = :cls`;
    return db;
};

module.exports = {connectServer, createDB, connectDB, defaultHeirarchy};
