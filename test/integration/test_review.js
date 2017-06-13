'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, Base, Record, History, KBUser, KBRole} = require('./../../app/repo/base');
const {Statement, AppliesTo, AsComparedTo, Requires, STATEMENT_TYPE} = require('./../../app/repo/statement');
const {Review} = require('./../../app/repo/review');
const {Context} = require('./../../app/repo/context');
const {AttributeError} = require('./../../app/repo/error');
const vocab = require('./../../app/repo/cached/data').vocab;
const Promise = require('bluebird');

const adminRules = {
    base: 15,
    ontology: 15,
    context: 15,
    kbvertex: 15,
    kbedge: 15
    }

const analystRules = {
    base: 15,
    ontology: 3,
    context: 3,
    kbvertex: 15,
    kbedge: 15
    } 

const bioinfoRules = {
    base: 2,
    ontology: 2,
    context: 2,
    kbvertex: 2,
    kbedge: 2
    }

vocab.statement = {};

vocab.statement.relevance = [
        {
        term: 'sensitivity',
        definition: '',
        conditional: STATEMENT_TYPE.THERAPEUTIC,
        class: Statement.clsname,
        property: 'relevance'
        }
];

describe('Review module', () => {
    let db, server;
    let kbvertexClass, kbedgeClass, kbuserClass, kbroleClass;
    let adminRec, analystRec, bioinfoRec, adminRole, analystRole, bioinfoRole;
    beforeEach(function(done) { 
        connectServer(conf)
            .then((s) => {
                server = s;
                return createDB({
                    server: s, 
                    name: conf.emptyDbName, 
                    username: conf.dbUsername, 
                    password: conf.dbPassword}
                );
            }).then((result) => {
                db = result;
                Promise.all([
                    KBRole.createClass(db),
                    KBUser.createClass(db)
                ]).then((clsList) => {
                    [kbroleClass, kbuserClass] = clsList;
                    Promise.all([
                        kbroleClass.createRecord({name: 'admin', mode: 0, rules: adminRules}),
                        kbroleClass.createRecord({name: 'analyst', mode: 0, rules: analystRules}),
                        kbroleClass.createRecord({name: 'bioinfo', mode: 0, rules: bioinfoRules}),
                    ]).then((roleList) => {
                        [adminRole, analystRole, bioinfoRole] = roleList;
                        Promise.all([
                            kbuserClass.createRecord({username: 'admin', role: 'admin'}),
                            kbuserClass.createRecord({username: 'Martin', role: 'analyst'}),
                            kbuserClass.createRecord({username: 'Wei', role: 'bioinfo'}),
                        ]).then((userRecList) => {
                            [adminRec, analystRec, bioinfoRec] = userRecList;
                            Promise.all([
                                KBVertex.createClass(db),
                                KBEdge.createClass(db),
                                History.createClass(db)
                                ]).then(() => {
                                    done();
                                });
                        });
                    });
                });
            }).catch((error) => {
                console.log('error in connecting to the server or creating the database', error);
                done(error);
            });
    });

    it('Review.createClass', () => {
        return Context.createClass(db)
            .then(() => {
                return Statement.createClass(db)
                .then((stCls) => {
                    return Review.createClass(db)
                        .then((revCls) => {
                            expect(revCls).to.equal(db.models.review);
                            expect(revCls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version', 'type', 'relevance');
                            expect(revCls.isAbstract).to.be.false;
                            expect(revCls.superClasses).to.include('E', KBEdge.clsname);
                            expect(revCls.constructor.clsname).to.equal('review');
                   });
                });
            });
    });
    describe('Review', () => {
        let statementRec;
        beforeEach((done) => {
            return Context.createClass(db)
                .then(() => {
                    return Statement.createClass(db)
                        .then((stClass) => {
                            return stClass.createRecord({user: 'Martin', type: STATEMENT_TYPE.THERAPEUTIC, relevance: 'sensitivity'})
                                .then((stRec) => {
                                    statementRec = stRec;
                                    done();
                                });
                    }).catch((error) => {
                        done(error);
                    });
                });
        });
        it('Review.createRecord', () => {
            return Review.createClass(db)
                .then((revCls) => {
                    return revCls.createRecord({user: 'Martin', out: adminRec, in: statementRec, status: "ACCEPTED"})
                        .then((revRec) => {
                            expect(revRec.content).to.include.keys('user', 'status');
                        }).catch((error) => {
                            console.log(error);
                        });
                });
        });

        it('Review: errors on invalid source type', () => {
            return Review.createClass(db)
                .then((revCls) => {
                    return revCls.createRecord({user: 'Martin', out: bioinfoRole, in: statementRec, status: "ACCEPTED"})
                        .then(() => {
                            expect.fail();
                        }).catch((error) => {
                            expect(error).to.be.an.instanceof(AttributeError);
                        });
                });
        });
        it('Review: errors on invalid target type', () => {
            return Review.createClass(db)
                .then((revCls) => {
                    return revCls.createRecord({user: 'Martin', out: adminRec, in: adminRole, status: "ACCEPTED"})
                        .then(() => {
                            expect.fail();
                        }).catch((error) => {
                            expect(error).to.be.an.instanceof(AttributeError);
                        });
                });
        });
        it('Review: errors when that source = target', () => {
            return Review.createClass(db)
                .then((revCls) => {
                    return revCls.createRecord({user: 'Martin', out: statementRec, in: statementRec, status: "ACCEPTED"})
                        .then(() => {
                            expect.fail();
                        }).catch(AttributeError, () => {});
                });
        });


    });
    
    afterEach((done) => {
        /* disconnect from the database */
        server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                return server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                done(error);
            });
    });
});
