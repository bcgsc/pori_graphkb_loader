'use strict';

const {expect} = require('chai');
const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./../../app/repo/evidence');
const moment = require('moment');
const {Review, ReviewAppliesTo} = require('./../../app/repo/review');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./../../app/repo/base');
const {Vocab} = require('./../../app/repo/vocab');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const cache = require('./../../app/repo/cached/data');
const {Context} = require('./../../app/repo/context');
const Promise = require('bluebird');
const {Statement, AppliesTo, AsComparedTo, Requires, STATEMENT_TYPE} = require('./../../app/repo/statement');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDepricatedBy} = require('./../../app/repo/ontology');
const {PERMISSIONS} = require('./../../app/repo/constants');
const oError = require('./orientdb_errors');
const currYear = require('year');
const _ = require('lodash');
const {CategoryEvent, PositionalEvent, Event, EVENT_TYPE, EVENT_SUBTYPE, ZYGOSITY} = require('./../../app/repo/event');
const jsonFile = 'test/integration/data/allEvents.mini.json';
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


function doesAlreadyExist(listOfObjs, otherObj) {
    console.log('doesAlreadyExist', listOfObjs, otherObj);
    for (let obj of listOfObjs) {
        if (_.isEqual(obj, otherObj)) {
            return true;
        }
    }
    return false;
}

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


const selectOrCreate = (clsname, obj, user) => {
    return new Promise((resolve, reject) => {
        db.models[clsname].selectExactlyOne(obj)
            .then((rec) => {
                resolve(rec);
            }).catch((err) => {
                return db.models[clsname].createRecord(obj, user);
            }).then((rec) => {
                resolve(rec);
            }).catch((err) => {
                reject(err);
            });
    });
};


const buildRecord = (oldKbRecord) => {
    console.log('buildRecord', oldKbRecord);
    return new Promise((resolve, reject) => {
        let promises = [];
        //statement
        let statObj = Object.assign({}, oldKbRecord.statement);
        delete statObj['context'];
        promises.push(db.models.Statement.createRecord(statObj, user));
        //disease
        let diseaseObj = Object.assign(oldKbRecord.disease, {doid: null});
        diseaseObj.name = diseaseObj.name.toLowerCase();
        promises.push(selectOrCreate('disease', diseaseObj, user));
        //therapy
        if ((oldKbRecord.statement.type == 'therapeutic') && (oldKbRecord.statement.context != '')) {
            let therapyObj = {name: oldKbRecord.statement.context.toLowerCase(), id: null};
            promises.push(selectOrCreate('therapy', therapyObj, user));
        } else {
            promises.push(new Promise((resolve, reject) => { resolve(null); }));
        }

        //reference
        if (oldKbRecord.reference.type === 'reported') {
            let pubTitle = oldKbRecord.reference.title.length > 0 ? oldKbRecord.reference.title : 'UNTITLED';
            let pubTypeObj = oldKbRecord.reference.id_type === 'pubmed' ? {pmid: parseInt(oldKbRecord.reference.id)} : {doi: (oldKbRecord.reference.id).toString()};
            let pubObj = Object.assign({title: pubTitle, year: null}, pubTypeObj);
            promises.push(selectOrCreate('publication', pubObj, user));
        } else {
            resolve();
        }

        let featurePromises = [];
        let pFeatureObj = oldKbRecord.event.primary_feature;
        let sFeatureObj = oldKbRecord.event.secondary_feature;

        featurePromises.push(selectOrCreate('feature', pFeatureObj, user));

        if (Object.keys(sFeatureObj).length != 0) {
            featurePromises.push(selectOrCreate('feature', sFeatureObj, user));
        } else {
            featurePromises.push(new Promise((resolve, reject) => { resolve(null); }));
        }
        
        let pFeatureRec, sFeatureRec, eventZygosity, eventGermline;
        eventZygosity = (oldKbRecord.event.zygosity != 'ns') && (oldKbRecord.event.zygosity != 'na') ? oldKbRecord.event.zygosity : null;
        eventGermline = (oldKbRecord.event.zygosity != '') ? true : false;
        Promise.all(featurePromises)
            .then((featureRecs) => {
                [pFeatureRec, sFeatureRec] = featureRecs;
                let baseEventObj = {
                    type: oldKbRecord.event.type,
                    zygosity: eventZygosity,
                    germline: eventGermline,
                    primary_feature: pFeatureRec
                    };
                if (sFeatureRec != null) {
                    baseEventObj.secondary_feature = sFeatureRec;
                }
                let startObj, endObj, positionObj, posClass;
                let eventCategory = oldKbRecord.event.flag;
                
                if (eventCategory === 'PositionalEvent') {
                    switch(oldKbRecord.event.csys) {
                        case 'p': {
                            posClass = ProteinPosition.clsname;
                            [startObj, endObj] = assignPositions(oldKbRecord.event, posClass);
                            break;                             
                        }
                        case 'g': {
                            posClass = GenomicPosition.clsname;
                            [startObj, endObj] = assignPositions(oldKbRecord.event, posClass);
                            break;
                        }
                        case 'c': {
                            posClass = CodingSequencePosition.clsname;
                            [startObj, endObj] = assignPositions(oldKbRecord.event, posClass);
                            break;
                        }
                        case 'y': {
                            posClass = CytobandPosition.clsname;
                            [startObj, endObj] = assignPositions(oldKbRecord.event, posClass);
                            break;
                        }
                        case 'e': {
                            const start = oldKbRecord.event.start;
                            const end = oldKbRecord.event.end == undefined ? start : oldKbRecord.event.end 
                            if (start[0] == -1 && start[1] == -1 && end[0] == -1 && end[1] == -1) {
                                eventCategory = 'CategoryEvent';
                                break;
                            }
                            posClass = ExonicPosition.clsname;
                            [startObj, endObj] = assignPositions(oldKbRecord.event, posClass);
                            break;
                        }
                    }
                    if (eventCategory != 'CategoryEvent') {
                        positionObj = endObj != undefined ? {start: startObj, end: endObj} : {start: startObj};
                        let basePositionalObj = {
                            untemplated_seq: oldKbRecord.event.untemplated_seq,
                            reference_seq: oldKbRecord.event.reference_seq,
                            subtype: oldKbRecord.event.subtype,
                            terminating_aa: oldKbRecord.event.terminating_aa
                        };
                        let positionalEventObj = Object.assign({}, baseEventObj, basePositionalObj, positionObj);
                        promises.push(db.models.PositionalEvent.createRecord(positionalEventObj, posClass, user));
                    }
                }
                if (eventCategory === 'CategoryEvent') {
                    if (oldKbRecord.event.type === 'FANN') {
                        promises.push(new Promise((resolve, reject) => { resolve(null); }));
                    } else {
                        let categoryEventObj = Object.assign({}, baseEventObj, {term: oldKbRecord.event.term});
                        promises.push(db.models.CategoryEvent.createRecord(categoryEventObj, user));
                    }
                }
                return db.models.Therapy.select();
            }).then((allTherapies) => {
                console.log(allTherapies);
                return Promise.all(promises);
            }).then((pList) => {
                // list of promises
                let [statRec, diseaseRec, pubRec, eventRec] = pList;
                //return Promise.all(edgePromises);
                resolve();
            }).catch((err) => {
                console.log('err', err);
                reject(err);
            });
    });
};


const recurseBuildRecord = (jsonArray, currentPosition=0) => {
    console.log('recurseBuildRecord', currentPosition);
    return new Promise((resolve, reject) => {
        buildRecord(jsonArray[currentPosition])
            .then((rec) => {
                console.log(currentPosition, 'rec', rec);
                if (currentPosition + 1 < jsonArray.length) {
                    return recurseBuildRecord(jsonArray, currentPosition + 1);
                } else {
                    console.log('finished looping', jsonArray.length, currentPosition);
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
        // create the empty database
        server = result;
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
                jsonObj = _.values(jsonObj);
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
        return db.server.drop({name: conf.emptyDbName});
    }).catch((error) => {
        return db.server.drop({name: conf.emptyDbName});
        console.log('error:', error);
    }).then(() => {
        return db.server.close();
    }).catch((error) => {
        console.log('error closing the server', error);
    });
