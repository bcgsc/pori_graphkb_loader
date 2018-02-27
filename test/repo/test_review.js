'use strict';
const {Statement, STATEMENT_TYPE} = require('./../../app/repo/statement');
const {Review, ReviewAppliesTo} = require('./../../app/repo/review');
const {expect} = require('chai');
const vocab = require('./../../app/repo/cached/data').vocab;
const {AttributeError} = require('./../../app/repo/error');
const {Context} = require('./../../app/repo/context');
const {setUpEmptyDB, tearDownEmptyDB} = require('./util');

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
    let server, db, user;
    beforeEach(async () => { 
        ({server, db, user} = await setUpEmptyDB());
        await Context.createClass(db);
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
        beforeEach(async () => {
            await Statement.createClass(db);
            statementRec = await db.models.Statement.createRecord({type: STATEMENT_TYPE.THERAPEUTIC, relevance: 'sensitivity'}, 'me');
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
            beforeEach(async () => {
                await Review.createClass(db);
                revRecord = await db.models.Review.createRecord({comment: 'test comment',  approved: true}, 'me');
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
                    return revATClass.createRecord({out: revRecord, in: user}, 'me')
                        .then(() => {
                            expect.fail();
                        }).catch(AttributeError, () => {});
                });
            });

            it('ReviewAppliesTo: errors on invalid target type', () => {
                return ReviewAppliesTo.createClass(db)
                .then((revATClass) => {
                    return revATClass.createRecord({out: user, in: statementRec}, 'me')
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
    
    afterEach(async () => {
        tearDownEmptyDB(server);
    });
});
