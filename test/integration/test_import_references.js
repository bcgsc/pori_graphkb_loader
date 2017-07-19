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
const jsonFile = '/home/azadeh/sandbox/orientdb/kbdev/knowledgebase/test/oldKB/allEvents.mini.json';
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
    let flag = false;
    listOfObjs.every((obj) => {
        if(_.isEqual(obj, otherObj)) {
            return flag = true;
        }
    });
    return flag
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

describe('Setting up', () => {
    let server, db, user;
    beforeEach(function(done) { /* build and connect to the empty database */
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
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });

    it('Massive reference import tests', () => { 

        let fs = Promise.promisifyAll(require("fs"));
        fs.readFileAsync(jsonFile, "utf8").then(function(content) {
            let jsonObj = JSON.parse(content);
            let statements = [],
                diseases = [],
                events = [],
                features = [],
                references = [];
            for (let uuid in jsonObj) {
                let promises = [];
                //statement
                let statObj = jsonObj[uuid].statement;
                if (!doesAlreadyExist(statements, statObj)) {
                    statements.push(statObj);
                    promises.push(db.models.Statement.createRecord(statObj, user));
                }
                //disease
                let diseaseObj = Object.assign(jsonObj[uuid].disease, {doid: 0});
                if (!doesAlreadyExist(diseases, diseaseObj)) {
                    diseases.push(diseaseObj);
                    promises.push(db.models.Disease.createRecord(diseaseObj, user));
                }
                //reference
                if (jsonObj[uuid].reference.type === 'reported') {
                    let pubTitle = jsonObj[uuid].reference.title.length > 0 ? jsonObj[uuid].reference.title : 'UNTITLED';
                    let pubTypeObj = jsonObj[uuid].reference.id_type === 'pubmed' ? {pmid: parseInt(jsonObj[uuid].reference.id)} : {doi: (jsonObj[uuid].reference.id).toString()};
                    let pubObj = Object.assign({title: pubTitle, year: currYear('yyyy').toString()}, pubTypeObj)
                    if (!doesAlreadyExist(references, pubObj)) {
                        references.push(pubObj);
                        promises.push(db.models.Publication.createRecord(pubObj, user));
                    }
                }

                let featurePromises = [];
                let pFeatureObj, sFeatureObj;
                pFeatureObj = Object.assign({}, jsonObj[uuid].event.primary_feature, {source_version: 0})

                if (!doesAlreadyExist(features, pFeatureObj)) {
                    features.push(pFeatureObj);
                    featurePromises.push(db.models.Feature.createRecord(pFeatureObj, user));
                    if (Object.keys(jsonObj[uuid].event.secondary_feature).length != 0) {
                        sFeatureObj = Object.assign({}, jsonObj[uuid].event.secondary_feature, {source_version: 0})
                        if (!doesAlreadyExist(features, sFeatureObj)) {
                            features.push(sFeatureObj);
                            featurePromises.push(db.models.Feature.createRecord(sFeatureObj, user));
                        }
                    }
                }

                let pFeatureRec, sFeatureRec, eventZygosity;
                eventZygosity = (jsonObj[uuid].event.zygosity != 'ns') && (jsonObj[uuid].event.zygosity != 'na') ? jsonObj[uuid].event.zygosity : null;
                Promise.all(featurePromises).then((featureRecs) => {
                    [pFeatureRec, sFeatureRec] = featureRecs;
                    let baseEventObj = {
                        type: jsonObj[uuid].event.type,
                        zygosity: eventZygosity,
                        germline: null,
                        primary_feature: pFeatureRec,
                        secondary_feature: sFeatureRec
                        };
                    let startObj, endObj, positionObj, posClass;
                    let eventCategory = jsonObj[uuid].event.flag;
                    if (eventCategory === 'CategoryEvent') {
                        if (jsonObj[uuid].event.type === 'FANN') {
                            //
                        } else {
                            let categoryEventObj = Object.assign({}, baseEventObj, {term: jsonObj[uuid].event.term});
                            promises.push(db.models.CategoryEvent.createRecord(categoryEventObj, user));
                        }
                    } else if (eventCategory === 'PositionalEvent') {
                        

                        switch(jsonObj[uuid].event.csys) {
                            case 'p': {
                                //posClass = {'@class': ProteinPosition.clsname};
                                posClass = ProteinPosition.clsname;
                                [startObj, endObj] = assignPositions(jsonObj[uuid].event, posClass);
                                break;                             
                            }
                            case 'g': {
                                console.log(jsonObj[uuid].event)
                                //posClass = {'@class': GenomicPosition.clsname};
                                posClass = GenomicPosition.clsname;
                                [startObj, endObj] = assignPositions(jsonObj[uuid].event, posClass);
                                break;
                            }
                            case 'c': {
                                //posClass = {'@class': CodingSequencePosition.clsname};
                                posClass = CodingSequencePosition.clsname;
                                [startObj, endObj] = assignPositions(jsonObj[uuid].event, posClass);
                                break;
                            }
                            case 'y': {
                                //posClass = {'@class': CytobandPosition.clsname};
                                posClass = CytobandPosition.clsname;
                                [startObj, endObj] = assignPositions(jsonObj[uuid].event, posClass);
                                break;
                            }
                            case 'e': {
                                //posClass = {'@class': ExonicPosition.clsname};
                                posClass = ExonicPosition.clsname;
                                [startObj, endObj] = assignPositions(jsonObj[uuid].event, posClass);
                                break;
                            }
                        }
                        positionObj = endObj != undefined ? {start: startObj, end: endObj} : {start: startObj};
                        let basePositionalObj = {
                            untemplated_seq: jsonObj[uuid].event.untemplated_seq,
                            reference_seq: jsonObj[uuid].event.reference_seq,
                            subtype: jsonObj[uuid].event.subtype,
                            terminating_aa: jsonObj[uuid].event.terminating_aa
                        };
                        let positionalEventObj = Object.assign({}, baseEventObj, basePositionalObj, positionObj);
                        promises.push(db.models.PositionalEvent.createRecord(positionalEventObj, posClass, user));
                    }
                    return promises;
                }).then((promises) => {
                    Promise.all(promises)
                    .then((result) => {
                        console.log('**********************')
                        console.log(result)
                    }).catch((err) => {
                        console.log(err)
                    });
                });
            }
        }).catch(function(e) {
            console.error(e.stack);
        });

        return Review.createClass(db)
            .then(() => {
        });
        
    });

    afterEach((done) => {
        /* disconnect from the database */
        db.server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                return db.server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error closing the server', error);
                done(error);
            });
    });
});