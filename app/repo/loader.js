'use strict';

const {expect} = require('chai');
const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./evidence');
const moment = require('moment');
const {Review, ReviewAppliesTo} = require('./review');
const conf = require('./../../test/config/db');
const {connectServer, createDB} = require('./connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./base');
const {Vocab} = require('./vocab');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const cache = require('./cached/data');
const {Context} = require('./context');
const Promise = require('bluebird');
const {Statement, AppliesTo, AsComparedTo, Requires, STATEMENT_TYPE} = require('./statement');
const {expectDuplicateKeyError} = require('../../test/integration/orientdb_errors');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDepricatedBy} = require('./ontology');
const {PERMISSIONS} = require('./constants');
const oError = require('../../test/integration/orientdb_errors');
const currYear = require('year');
const _ = require('lodash');
const {CategoryEvent, PositionalEvent, Event, EVENT_TYPE, EVENT_SUBTYPE, ZYGOSITY} = require('./event');
const jsonFile = 'test/integration/data/new_entries.mini.json';
const {
    Position,
    GenomicPosition,
    ExonicPosition,
    ProteinPosition,
    CodingSequencePosition,
    CytobandPosition,
    Range
} = require('./../../app/repo/position');

const {
    AttributeError, 
    DependencyError, 
    ControlledVocabularyError, 
    MultipleResultsFoundError, 
    NoResultFoundError, 
    PermissionError, 
    AuthenticationError
} = require('./../../app/repo/error');



function assignPositions(event) {
    let startObjF, endObjF;
    if (_.isEqual(event.start[0], event.start[1])) {
        startObjF = Object.assign({}, event.start[0]);
    } else {
        // startObj should be a range
        startObjF = {
            start: Object.assign({}, event.end[0]), 
            end: Object.assign({}, event.end[1]), 
            '@class': Range.clsname
        }
    }
    if (event.end != undefined) {
        if (_.isEqual(event.end[0], event.end[1])) {
            endObjF = Object.assign({}, event.end[0]);    
        } else {
            // endObj should be a range
            endObjF = {
                start: Object.assign({}, event.end[0]), 
                end: Object.assign({}, event.end[1]), 
                '@class': Range.clsname
            }
        }
    }
    return [startObjF, endObjF];
}

const statements = [],
    diseases = [],
    therapies = [],
    events = [],
    features = [],
    references = [];

const promisifyFeatures = (obj, user) => {
    return new Promise((resolve, reject) => {
        let featurePromises = [];
        let pFeatureObj = _.omit(obj['primary_feature'], '@class');
        let sFeatureObj = _.omit(obj['secondary_feature'], '@class');
        featurePromises.push(selectOrCreate(Feature.clsname, pFeatureObj, user));
        if (Object.keys(sFeatureObj).length != 0) {
            featurePromises.push(selectOrCreate(Feature.clsname, sFeatureObj, user));
        } else {
            featurePromises.push(new Promise((resolve, reject) => { resolve(null); }));
        }

        Promise.all(featurePromises)
            .then((recList) => {
                resolve(recList);
            }).catch((err) => {
                reject(err);
            });
    });    
}


const createEvents = (type, obj, user) => {
    return new Promise((resolve, reject) => {
        if (type === 'category_event') {
            let pFeatureRec, sFeatureRec;
            Promise.all(promisifyFeatures(obj, user))
            .then((featureList) => {
                [pFeatureRec, sFeatureRec] = featureList;
                let catEventObj = _.omit(obj, ['@class', 'primary_feature', 'secondary_feature']);
                catEventObj['primary_feature'] = pFeatureRec;
                if (sFeatureRec != null) {
                   catEventObj['secondary_feature'] = sFeatureRec;
                }
                resolve(db.models.CategoryEvent.createRecord(catEventObj, user));
            }).catch((err) => {
                reject(err);
            });
        } else if (type === 'positional_event'){

        }
    });    
}

const selectOrCreate = (clsname, obj, user, blackList) => {
    //console.log('>>>>>>>>>>>> OBJ >>>>>>>>>>>>>', obj);
    return new Promise((resolve, reject) => {
        db.models[clsname].selectExactlyOne(_.omit(obj, blackList))
            .then((rec) => {
                //console.log('>>>>>>>>>>>> SELECT REC >>>>>>>>>>>>>', rec);
                resolve(rec);
            }).catch((err) => {
                //console.log('>>>>>>>>>>>> SELECT ERR >>>>>>>>>>>>>', err);
                return db.models[clsname].createRecord(obj, user);
            }).then((rec) => {
                //console.log('>>>>>>>>>>>> CREATE REC >>>>>>>>>>>>>', rec);
                resolve(rec);
            }).catch((err) => {
                reject(err);
            });
    });
};

const buildRecord = (oldKbRecord) => {
    return new Promise((resolve, reject) => {
        let promises = [];       
        
        /*//statement
        let statObj = Object.assign({}, {relevance: oldKbRecord.relevance, type: oldKbRecord.type});
        promises.push(db.models.Statement.createRecord(statObj, user));

        //evidence
        oldKbRecord.supported_by.forEach((supItem) => {
            let evidenceObj = _.omit(supItem, '@class');
            evidenceObj['journal'] = evidenceObj['journal'].toLowerCase();
            evidenceObj['title'] = evidenceObj['title'].toLowerCase();
            evidenceObj.pmid = parseInt(evidenceObj.pmid);
            promises.push(selectOrCreate(supItem['@class'], evidenceObj, user, 'journal'));
        });*/

        let bigList = _.concat(oldKbRecord['applies_to'], oldKbRecord['requires'], oldKbRecord['as_compared_to']);

        _.forEach(bigList, (item) => {
            switch(item['@class']) {
                case 'disease':
                    //let diseaseObj = Object.assign({}, {name: item.name, doid: null});
                    //promises.push(selectOrCreate(Disease.clsname , diseaseObj, user));
                    break;
                
                case 'therapy':
                    //promises.push(selectOrCreate(Therapy.clsname , _.omit(item,  '@class'), user));
                    break;

                case 'feature':
                    //promises.push(selectOrCreate(Feature.clsname , _.omit(item,  '@class'), user));
                    break;

                case 'positional_event':
                case 'category_event':
                    promises.push(createEvents(item['@class'], item, user));                
                    break;

                default:
                    throw new Error('unrecognized vertex:', item['@class']);
                    break;
            }
        });

        return Promise.all(promises)
            .then((pList) => {
                    console.log(pList)
                    console.log('----------------')
                }).catch((err) => {
                    reject(err)
                }).then(() => {
                    resolve();
                });
    });
};


const recurseBuildRecord = (jsonArray, currentPosition=0) => {
    return new Promise((resolve, reject) => {
        buildRecord(jsonArray[currentPosition])
            .then((rec) => {
                if (currentPosition + 1 < jsonArray.length) {
                    return recurseBuildRecord(jsonArray, currentPosition + 1);
                } else {
                    resolve();
                }
            }).then(() => { 
                resolve(); 
            }).catch((err) => {
                reject(err);
            });
    });
};

let server, db, user;
// set up the database server
connectServer(conf)
    .then((result) => {
        server = result;
        return server.drop({name: conf.emptyDbName});
    }).catch((error) => {
        console.log('caught error', error);
        return Promise.resolve();
    }).then(() => {
        // create the empty database
        return createDB({
            name: conf.emptyDbName, 
            username: conf.dbUsername,
            password: conf.dbPassword,
            server: server,
            heirarchy: [
                [KBRole, History],
                [KBUser],
                [KBVertex, KBEdge],
                [Context],
                [Evidence, Ontology, Statement, Position, Feature],
                [   
                    Disease, Therapy, Requires, Range, GenomicPosition, 
                    ProteinPosition, CodingSequencePosition, CytobandPosition, 
                    ExonicPosition, Event, Publication, Journal, 
                    ExternalSource, Study, ClinicalTrial
                ],
                [PositionalEvent, CategoryEvent]
            ]
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
            fs.readFileAsync(jsonFile, "utf8").then(function(content) {
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
