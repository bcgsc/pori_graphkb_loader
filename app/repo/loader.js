'use strict';

const {expect} = require('chai');
const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./evidence');
const moment = require('moment');
const {Review, ReviewAppliesTo} = require('./review');
const conf = require('./../../test/config/db');
const {connectServer, createDB} = require('./connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./base');
const {Vocab} = require('./vocab');
const {Target} = require('./target');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const cache = require('./cached/data');
const {Context} = require('./context');
const Promise = require('bluebird');
const {Statement, AppliesTo, AsComparedTo, Requires, SupportedBy, STATEMENT_TYPE} = require('./statement');
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
        let pFeatureRec, sFeatureRec; 
        Promise.all(promisifyFeatures(obj, user))
        .then((featureList) => {
            [pFeatureRec, sFeatureRec] = featureList;
            let eventObj = _.omit(obj, ['@class', 'primary_feature', 'secondary_feature']);
            eventObj['primary_feature'] = pFeatureRec;
            if (sFeatureRec != null) {
               eventObj['secondary_feature'] = sFeatureRec;
            }
            // categoricalEvent
            if (type === 'category_event') {
                resolve(db.models.CategoryEvent.createRecord(eventObj, user));
            // PositionalEvent
            } else if (type === 'positional_event') {
                let posClass = eventObj.start['@class'];
                delete eventObj.start['@class'];
                if (_.includes(_.keys(eventObj), 'end')) {
                    delete eventObj.end['@class'];
                }                          
                resolve(db.models.PositionalEvent.createRecord(eventObj, posClass, user)); 
            }
        }).catch((err) => {
            reject(err);
        });
    });    
}

const createItem = (item, user) => {
    return new Promise((resolve, reject) => {
        //let targetPromises = [];
        if (item !=  null) {
            switch(item['@class']) {
                case 'disease':
                    let diseaseObj = Object.assign({}, {name: item.name, doid: null});
                    resolve(selectOrCreate(Disease.clsname , diseaseObj, user));
                    break;
                case 'positional_event':
                case 'category_event':  
                    resolve(createEvents(item['@class'], item, user));
                    break;
                case 'publication':
                    let evidenceObj = _.omit(item, '@class');
                    evidenceObj['journal'] = evidenceObj['journal'].toLowerCase();
                    evidenceObj['title'] = evidenceObj['title'].toLowerCase();
                    evidenceObj.pmid = parseInt(evidenceObj.pmid);
                    resolve(selectOrCreate(item['@class'], evidenceObj, user, 'journal'));
                    break;
                default:
                    resolve(selectOrCreate(item['@class'] , _.omit(item,  '@class'), user));
                    break;
            }
        } else {
            resolve();
        }
    });
};


const traverseEdgeType = (targetList, user, currPos=0) => {
    return new Promise((resolve, reject) => {
        let targetPromises = [];
        createItem(targetList[currPos], user)
        .then(() => {
            if (currPos + 1 < targetList.length) {
                return traverseEdgeType(targetList, user, currPos + 1)
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

const createEdge = (edgeType, targetList, source, user) => {
    return new Promise((resolve, reject) => {
        let edgePromises = [];
        traverseEdgeType(targetList, user)
            .then((targetRecList) => {
                    _.forEach(targetList, (target) => {
                        edgePromises.push(db.models[edgeType].createRecord({out: source, in: target}, user));
                    });
                    // console.log(targetList)
                    
                    // _.forEach(targetRecList, (target) => {
                    //     edgePromises.push(db.models[edgeType].createRecord({out: source, in: target}, user));
                    // });
                    // Promise.all(edgePromises).then((pList) => {
                    //     resolve(pList);
                    // }).catch((err) => {
                    //     reject(err)
                    // });
            }).catch((err) => {
                reject(err)
            });
    });
};


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


const buildRecord = (oldKbRecord,pqueue) => {
    //pqueue.add(() => {
        return new Promise((resolve, reject) => {       
            let statObj = Object.assign({}, {relevance: oldKbRecord.relevance, type: oldKbRecord.type});
            db.models.Statement.createRecord(statObj, user)
            .then((statRec) => {
                let targetPromises = [];
                createEdge('requires', oldKbRecord['requires'], statRec, user)
                .then(() => {
                    targetPromises.push(createEdge('supported_by', oldKbRecord['supported_by'], statRec, user));
                    targetPromises.push(createEdge('as_compared_to', oldKbRecord['as_compared_to'], statRec, user));    
                    targetPromises.push(createEdge('applies_to', oldKbRecord['applies_to'], statRec, user));
                    Promise.all(targetPromises).then((edges) => {
                        resolve(edges);
                    }).catch((err) => {
                        reject(err);
                    });
                }).catch((err) => {
                    reject(err);
                });           
            }).catch((err) => {
                reject(err);
            });
        });
    //});
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

        // const pqueue = new PQueue({concurrency: 1});
        // for (var i = 0; i < jsonArray.length; i++) {
        //     buildRecord(jsonArray[i],pqueue)
        // }

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
                    Disease, Therapy, Target, Range, GenomicPosition, 
                    ProteinPosition, CodingSequencePosition, CytobandPosition, 
                    ExonicPosition, Event, Publication, Journal, 
                    ExternalSource, Study, ClinicalTrial, AppliesTo,
                    Requires, SupportedBy,
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
