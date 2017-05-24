'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, Base, Record, History} = require('./../../app/repo/base');
const {Context} = require('./../../app/repo/context');
const {Statement, AppliesTo, AsComparedTo, Requires} = require('./../../app/repo/statement');
const Promise = require('bluebird');
const {AttributeError, ControlledVocabularyError} = require('./../../app/repo/error');


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
    describe('createClass', () => {
        it('Statement', () => {
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
        it('AppliesTo', () => {
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
        it('Requires', () => {
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
        it('AsComparedTo', () => {
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
    });
    describe('instance', () => {
        beforeEach((done) => {
            Promise.all([
                Statement.createClass(db),
                AsComparedTo.createClass(db),
                Requires.createClass(db),
                AppliesTo.createClass(db)
            ]).then(() => {
                done();
            }).catch((error) => {
                done(error);
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
