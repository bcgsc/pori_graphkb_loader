'use strict';

const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./../app/repo/evidence');
const {Review, ReviewAppliesTo} = require('./../app/repo/review');
const conf = require('./../test/config/db');
const {connectServer, createDB, defaultHeirarchy} = require('./../app/repo/connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./../app/repo/base');
const {Vocab} = require('./../app/repo/vocab');
const {Target} = require('./../app/repo/target');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../app/repo/feature');
const cache = require('./../app/repo/cached/data');
const {Context} = require('./../app/repo/context');
const Promise = require('bluebird');
const {Statement, AppliesTo, AsComparedTo, Requires, SupportedBy, STATEMENT_TYPE} = require('./../app/repo/statement');
const {
    Ontology, 
    Disease, 
    Therapy, 
    OntologySubClassOf, 
    OntologyRelatedTo, 
    OntologyAliasOf, 
    OntologyDepricatedBy
} = require('./../app/repo/ontology');
const {PERMISSIONS} = require('./../app/repo/constants');
const currYear = require('year');
const _ = require('lodash');
const {
    CategoryEvent,
    PositionalEvent,
    Event,
    EVENT_TYPE, EVENT_SUBTYPE, ZYGOSITY
} = require('./../app/repo/event');
const {
    Position,
    GenomicPosition,
    ExonicPosition,
    ProteinPosition,
    CodingSequencePosition,
    CytobandPosition,
    Range
} = require('./../app/repo/position');

const {
    AttributeError, 
    DependencyError, 
    ControlledVocabularyError, 
    MultipleResultsFoundError, 
    NoResultFoundError, 
    PermissionError, 
    AuthenticationError
} = require('./../app/repo/error');
const TEST_DB_NAME = 'load_testing';

const createNode = (item, user) => {
    return new Promise((resolve, reject) => {
        
        if (item !==  null) {
            const clsname = item['@class'];
            if (clsname === 'disease') {
                let diseaseObj = Object.assign({}, {name: item.name, doid: null});
                db.models.Disease.selectOrCreate(diseaseObj, user)
                    .then((rec) => {
                        resolve(rec);
                    }).catch((err) => {
                        reject(err);
                    });
            } else if (clsname === 'publication') {
                let evidenceObj = _.omit(item, '@class');
                evidenceObj['journal'] = evidenceObj['journal'].toLowerCase();
                db.models.Journal.selectOrCreate({'name': evidenceObj['journal']}, user)
                    .then((journal) => {
                        evidenceObj['journal'] = journal.rid;
                        return db.models.Publication.selectOrCreate(evidenceObj, user);
                    }).then((pub) => {
                        resolve(pub);
                    }).catch((err) => {
                        reject(err);
                    });
            } else if (clsname.endsWith('_event')) {
                // create the events
                const featurePromises = [
                    Promise.resolve(null),
                    Promise.resolve(null)
                ];
                if (item.primary_feature) {
                    featurePromises[0] = item.primary_feature.rid || db.models.Feature.selectOrCreate(item.primary_feature, user);
                }
                if (item.secondary_feature) {
                    featurePromises[1] = item.secondary_feature.rid || db.models.Feature.selectOrCreate(item.secondary_feature, user);
                }
                let primary, secondary;
                Promise.all(featurePromises)
                    .then((pList) => {
                        [primary, secondary] = pList;
                        if (primary) {
                            item.primary_feature = primary.content;
                        }
                        if (secondary) {
                            item.secondary_feature = secondary.content;
                        }
                        return db.models[clsname].selectOrCreate(item, user);
                    }).then((rec) => {
                        resolve(rec);
                    }).catch((err) => {
                        reject(err);
                    });
            } else {
                db.models[clsname].selectOrCreate(item, user)
                    .then((rec) => {
                        resolve(rec);
                    }).catch((err) => {
                        reject(err);
                    });
            }
        } else {
            resolve();
        }
    });
};


const createEdge = (edge, user) => {
    return new Promise((resolve, reject) => {
        let outRec;
        const outPromise = edge.out.rid ? Promise.resolve(edge.out) : createNode(edge.out, user);
        outPromise
            .then((rec) => {
                outRec = rec;
                if (edge.in.rid) {
                    return Promise.resolve(edge.in);
                } else {
                    return createNode(edge.in, user);
                }
            }).then((inRec) => {
                return db.models[edge['@class']].createRecord({out: outRec, in: inRec}, user);
            }).then((newEdge) => {
                resolve(newEdge);
            }).catch((err) => {
                reject(err);
            });
    });
};



const buildRecord = async (oldKbRecord, pqueue) => {
    let statObj = Object.assign({}, {relevance: oldKbRecord.relevance, type: oldKbRecord.type});
    try {
        const statRec = await db.models.Statement.createRecord(statObj, user);
        const edges = [];
        for (let eType of ['applies_to', 'as_compared_to', 'requires', 'supported_by']) {
            for (let edge of oldKbRecord[eType]) {
                if (edge !== null) {
                    edges.push(createEdge({out: statRec, in: edge, '@class': eType}, user));
                }
            }
        }
        return await Promise.all(edges);
    } catch (err) {
        return Promise.reject(err);
    }
};


const recurseBuildRecord = async (jsonArray, currentPosition=0) => {
    try {
        const record = await buildRecord(jsonArray[currentPosition]);
        process.stdout.write('.');
    } catch (err) {
        if (currentPosition + 1 < jsonArray.length) {
            console.log('\nskipping bad record', err.name, err.message, err.stack, err.message ? '' : err);
        }
    }
    if (currentPosition + 1 < jsonArray.length) {
        return recurseBuildRecord(jsonArray, currentPosition + 1);
    }
};


if (process.argv.length != 3) {
    console.log('usage: node load_records_from_json_file <json data file>\n');
    console.log('error: missing required argument <json data file>');
    process.exit();
}

const JSON_FILE = process.argv[2];

let server, db, user;
// set up the database server
connectServer(conf)
    .then((result) => {
        server = result;
        return server.drop({name: TEST_DB_NAME});
    }).catch((error) => {
        console.log('caught error', error);
        return Promise.resolve();
    }).then(() => {
        // create the empty database
        return createDB({
            name: TEST_DB_NAME, 
            username: conf.dbUsername,
            password: conf.dbPassword,
            server: server,
            heirarchy: defaultHeirarchy
        });
    }).then((result) => {
        db = result;
    }).then(() => {
        return db.models.KBRole.createRecord({name: 'admin', rules: {'kbvertex': PERMISSIONS.ALL, 'kbedge': PERMISSIONS.ALL}});
    }).then((role) => {
        return db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
    }).then((result) => {
        user = result.content.username;
    }).then(() => {
        // start loading
        return new Promise((resolve, reject) => {
            let fs = Promise.promisifyAll(require("fs"));
            console.log('loading records from:', JSON_FILE);
            fs.readFileAsync(JSON_FILE, "utf8").then(function(content) {
                let jsonObj = JSON.parse(content);
                jsonObj = _.values(jsonObj.entries);
                console.log('loading', jsonObj.length, 'records');
                return recurseBuildRecord(jsonObj);
            }).then(() => {
                resolve(true);
            }).catch((err) => {
                console.log('recurseBuildRecord error', err);
                reject(err);
            });
        });
    }).then(() => {
        console.log('done loading');
        /* disconnect from the database */
        return server.close();
    }).catch((error) => {
        console.log('error closing the server', error);
    });
