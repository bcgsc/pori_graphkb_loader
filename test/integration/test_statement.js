'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, Base, Record, History} = require('./../../app/repo/base');
const {Context} = require('./../../app/repo/context');
const {Statement, AppliesTo, AsComparedTo, Requires, STATEMENT_TYPE} = require('./../../app/repo/statement');
const Promise = require('bluebird');
const {AttributeError, ControlledVocabularyError} = require('./../../app/repo/error');
const {Feature, FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../../app/repo/feature');
const {Position, GenomicPosition} = require('./../../app/repo/position');
const vocab = require('./../../app/repo/cached/data').vocab;

vocab.statement = {};

vocab.statement.relevance = [
    {
        term: 'haploinsufficient',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    },
    {
        term: 'gain of function',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    },
    {
        term: 'loss of function',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    },
    {
        term: 'switch of function',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    },
    {
        term: 'sensitivity',
        definition: '',
        conditional: STATEMENT_TYPE.THERAPEUTIC,
        class: Statement.clsname,
        property: 'relevance'
    }
];

describe('statement module', () => {
    let server, db, primary_feature, secondary_feature;
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
                    models: {KBEdge, KBVertex, History}
                });
            }).then((connection) => {
                db = connection;
                return Context.createClass(db);
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });
    it('Statement.createClass', () => {
        return Statement.createClass(db)
            .then((cls) => {
                // test registration
                expect(cls).to.equal(db.models.Statement);
                expect(cls).to.equal(db.models.statement);
                expect(cls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version', 'type', 'relevance');
                expect(cls.isAbstract).to.be.false;
                expect(cls.superClasses).to.include('V', KBVertex.clsname);
                expect(cls.constructor.clsname).to.equal('statement');
            });
    });
    describe('Statement', () => {
        beforeEach((done) => {
            Promise.all([
                Statement.createClass(db)
            ]).then(() => {
                done();
            }).catch((error) => {
                done(error);
            });
        });
        it('AppliesTo.createClass', () => {
            return AppliesTo.createClass(db)
                .then((cls) => {
                    // test registration
                    expect(cls).to.equal(db.models.AppliesTo);
                    expect(cls).to.equal(db.models.applies_to);
                    expect(cls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(cls.isAbstract).to.be.false;
                    expect(cls.superClasses).to.include('E', KBEdge.clsname);
                    expect(cls.constructor.clsname).to.equal('applies_to');
                });
        });
        it('Requires.createClass', () => {
            return Requires.createClass(db)
                .then((cls) => {
                    // test registration
                    expect(cls).to.equal(db.models.Requires);
                    expect(cls).to.equal(db.models.requires);
                    expect(cls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(cls.isAbstract).to.be.false;
                    expect(cls.superClasses).to.include('E', KBEdge.clsname);
                    expect(cls.constructor.clsname).to.equal('requires');
                });
        });
        it('AsComparedTo.createClass', () => {
            return AsComparedTo.createClass(db)
                .then((cls) => {
                    // test registration
                    expect(cls).to.equal(db.models.AsComparedTo);
                    expect(cls).to.equal(db.models.as_compared_to);
                    expect(cls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                    expect(cls.isAbstract).to.be.false;
                    expect(cls.superClasses).to.include('E', KBEdge.clsname);
                    expect(cls.constructor.clsname).to.equal('as_compared_to');
                });
        });
        describe('createRecord', () => {
            it('errors on incompatible type/relevance vocabulary', () => {
                return db.models.Statement.createRecord({type: STATEMENT_TYPE.BIOLOGICAL, relevance: 'sensitivity'})
                    .then(() => {
                        expect.fail('should have thrown an error');
                    }).catch(ControlledVocabularyError, () => {});
            });
            it('errors on invalid vocabulary for relevance', () => {
                return db.models.Statement.createRecord({type: STATEMENT_TYPE.BIOLOGICAL, relevance: 'invalid relevance'})
                    .then(() => {
                        expect.fail('should have thrown an error');
                    }).catch(ControlledVocabularyError, () => {});
            });
            it('errors on invalid type', () => {
                return db.models.Statement.createRecord({type: 'random type', relevance: 'sensitivity'})
                    .then(() => {
                        expect.fail('should have thrown an error');
                    }).catch(ControlledVocabularyError, () => {});
            });
            it('errors on type unspecified', () => {
                return db.models.Statement.createRecord({relevance: 'sensitivity'})
                    .then(() => {
                        expect.fail('should have thrown an error');
                    }).catch(ControlledVocabularyError, () => {});
            });
            it('errors on null type', () => {
                return db.models.Statement.createRecord({type: null, relevance: 'sensitivity'})
                    .then(() => {
                        expect.fail('should have thrown an error');
                    }).catch(ControlledVocabularyError, () => {});
            });
            it('allows basic statement', () => {
                return db.models.Statement.createRecord({type: STATEMENT_TYPE.THERAPEUTIC, relevance: 'sensitivity'})
                    .then((record) => {
                        expect(record).to.be.instanceof(Record);
                        expect(record.content).to.have.property('type', STATEMENT_TYPE.THERAPEUTIC);
                        expect(record.content).to.have.property('relevance', 'sensitivity');
                    });
            });
        });
    });

    describe('edges', () => {
        let feat, stmnt, stmnt2, pos;
        beforeEach((done) => {
            Statement.createClass(db)
                .then(() => {
                    return Promise.all([
                        Feature.createClass(db),
                        AppliesTo.createClass(db),
                        AsComparedTo.createClass(db),
                        Requires.createClass(db),
                        Position.createClass(db)
                    ]);
                }).then(() => {
                    return GenomicPosition.createClass(db);
                }).then(() => {
                    return Promise.all([
                        db.models.Feature.createRecord({
                            source: FEATURE_SOURCE.ENSEMBL, biotype: FEATURE_BIOTYPE.GENE, name: 'ENSG001', source_version: 69
                        }),
                        db.models.Statement.createRecord({type: STATEMENT_TYPE.THERAPEUTIC, relevance: 'sensitivity'}),
                        db.models.Statement.createRecord({type: STATEMENT_TYPE.THERAPEUTIC, relevance: 'sensitivity'}),
                        db.models.GenomicPosition.createRecord({pos: 1})
                    ]);
                }).then((pList) => {
                    [feat, stmnt, stmnt2, pos] = pList;
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        describe('AppliesTo.createRecord', () => {
            it('errors on invalid source type', () => {
                return db.models.AppliesTo.createRecord({out: feat, in: feat})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('errors on invalid target type', () => {
                return db.models.AppliesTo.createRecord({out: stmnt, in: pos})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('allows Statement => Feature', () => {
                return db.models.AppliesTo.createRecord({out: stmnt, in: feat})
                    .then((record) => {
                        expect(record).to.be.instanceof(Record);
                    });
            });
            it('errors on statement target type', () => {
                return db.models.AppliesTo.createRecord({out: stmnt, in: stmnt2})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('allows Statement => Disease');
            it('allows Statement => Therapy');
            it('allows Statement => Event');
        });

        describe('AsComparedTo.createRecord', () => {
            it('errors on invalid source type', () => {
                return db.models.AsComparedTo.createRecord({out: feat, in: feat})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('errors on invalid target type', () => {
                return db.models.AsComparedTo.createRecord({out: stmnt, in: pos})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('allows Statement => Feature', () => {
                return db.models.AsComparedTo.createRecord({out: stmnt, in: feat})
                    .then((record) => {
                        expect(record).to.be.instanceof(Record);
                    });
            });
            it('errors on statement target type', () => {
                return db.models.AsComparedTo.createRecord({out: stmnt, in: stmnt2})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('allows Statement => Disease');
            it('allows Statement => Therapy');
            it('allows Statement => Event');
        });

        describe('Requires.createRecord', () => {
            it('errors on invalid source type', () => {
                return db.models.Requires.createRecord({out: pos, in: feat})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('errors on invalid target type', () => {
                return db.models.Requires.createRecord({out: stmnt, in: pos})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('allows Statement => Feature', () => {
                return db.models.Requires.createRecord({out: stmnt, in: feat})
                    .then((record) => {
                        expect(record).to.be.instanceof(Record);
                    });
            });
            it('errors when that source = target', () => {
                return db.models.Requires.createRecord({out: stmnt, in: stmnt})
                    .then(() => {
                        expect.fail();
                    }).catch(AttributeError, () => {});
            });
            it('allows Statement => Statement', () => {
                return db.models.Requires.createRecord({out: stmnt, in: stmnt2})
                    .then((record) => {
                        expect(record).to.be.instanceof(Record);
                    });
            });
            it('allows Disease => Statement');
            it('allows Therapy => Statement');
            it('allows Event => Statement');
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
