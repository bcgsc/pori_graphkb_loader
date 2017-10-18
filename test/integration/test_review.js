'use strict';
const {Statement, STATEMENT_TYPE} = require('./../../app/repo/statement');
const {Review, ReviewAppliesTo} = require('./../../app/repo/review');
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./../../app/repo/base');
const vocab = require('./../../app/repo/cached/data').vocab;
const {AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const {PERMISSIONS} = require('./../../app/repo/constants');

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

describe('Review schema tests:', () => {
    let server, db, userRec;
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
                        [Context]
                    ]
                });
            }).then((result) => {
                db = result;
            }).then(() => {
                return db.models.KBRole.createRecord({name: 'admin', rules: {'kbvertex': PERMISSIONS.ALL, 'kbedge': PERMISSIONS.ALL}});
            }).then(() => {
                return db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
            }).then((result) => {
                userRec = result;
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });

    it('Review.createClass', () => {
        return Statement.createClass(db)
            .then(() => {
                return Review.createClass(db)
                    .then((revCls) => {
                        expect(revCls).to.equal(db.models.review);
                        expect(revCls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                        expect(revCls.isAbstract).to.be.false;
                        expect(revCls.superClasses).to.include('V', KBVertex.clsname);
                        expect(revCls.constructor.clsname).to.equal('review');
                    });
            });
            
    });

    it('ReviewAppliesTo.createClass', () => {
        return Statement.createClass(db)
            .then(() => {
                return Review.createClass(db)
                    .then(() => {
                        return ReviewAppliesTo.createClass(db)
                            .then((atCls) => {
                                expect(atCls).to.equal(db.models.review_applies_to);
                                expect(atCls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                                expect(atCls.isAbstract).to.be.false;
                                expect(atCls.superClasses).to.include('E', KBEdge.clsname);
                                expect(atCls.constructor.clsname).to.equal('review_applies_to');
                            });
                    });
            });
            
    });

    describe('Review Vertex', () => {
        let statementRec;
        beforeEach((done) => {
            Statement.createClass(db)
                .then((stmntClass) => {
                    return stmntClass.createRecord({type: STATEMENT_TYPE.THERAPEUTIC, relevance: 'sensitivity'}, 'me');
                }).then((stRec) => {
                    statementRec = stRec;
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('Review.createRecord', () => {
            return Review.createClass(db)
                .then((revCls) => {
                    return revCls.createRecord({comment: 'test comment',  approved: true}, 'me')
                        .then((revRec) => {
                            expect(revRec.content).to.include.keys('created_by', 'comment', 'approved');
                        }).catch((error) => {
                            console.log(error);
                        });
                });
        });

        describe('ReviewAppliesTo Edge', () => {
            let revRecord;
            beforeEach((done) => {
                Review.createClass(db)
                    .then((revCls) => {
                        return revCls.createRecord({comment: 'test comment',  approved: true}, 'me');
                    }).then((revRec) => {
                        revRecord = revRec;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('ReviewAppliesTo.createRecord', () => {
                return ReviewAppliesTo.createClass(db)
                .then((revATClass) => {
                    return revATClass.createRecord({out: revRecord, in: statementRec}, 'me')
                        .then((revATRec) => {
                            expect(revATRec.content).to.include.keys('created_by', 'in', 'out');
                        }).catch((error) => {
                            console.log(error);
                        });
                });
            });

            it('ReviewAppliesTo: errors on invalid source type', () => {
                return ReviewAppliesTo.createClass(db)
                .then((revATClass) => {
                    return revATClass.createRecord({out: revRecord, in: userRec}, 'me')
                        .then(() => {
                            expect.fail();
                        }).catch(AttributeError, () => {});
                });
            });

            it('ReviewAppliesTo: errors on invalid target type', () => {
                return ReviewAppliesTo.createClass(db)
                .then((revATClass) => {
                    return revATClass.createRecord({out: userRec, in: statementRec}, 'me')
                        .then(() => {
                            expect.fail();
                        }).catch(AttributeError, () => {});
                });
            });

            it('ReviewAppliesTo: errors when that source = target', () => {
                return ReviewAppliesTo.createClass(db)
                .then((revATClass) => {
                    return revATClass.createRecord({out: statementRec, in: statementRec}, 'me')
                        .then(() => {
                            expect.fail();
                        }).catch(AttributeError, () => {});
                });
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
