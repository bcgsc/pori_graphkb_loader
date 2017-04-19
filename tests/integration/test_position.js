"use strict";
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');
const _ = require('lodash');
const {DependencyError, AttributeError} = require('./../../app/repo/error');
const {History, KBVertex, KBEdge} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');


const {
    Position,
    GenomicPosition, 
    ExonicPosition, 
    ProteinPosition, 
    CodingSequencePosition, 
    CytobandPosition, 
    Range
} = require('./../../app/repo/position');


describe('Position schema tests:', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        serverConnect(conf)
            .then((result) => {
                // create the empty database
                server = result;
                return server.create({name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
            }).then((result) => {
                db = result;
                return Promise.all([
                    KBVertex.createClass(db),
                    History.createClass(db),
                    KBEdge.createClass(db)
                ]);
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });
    it('test create position class');

    describe('position subclasses', () => {
        beforeEach(function(done) {
            Position.createClass(db)
                .then(() => {
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('test position class abstract error');
        
        describe('genomic', () => {
            let gp;
            beforeEach(function(done) {
                GenomicPosition.createClass(db)
                    .then((result) => {
                        gp = result;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('genomic position no pos error', () => {
                return gp.createRecord()
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectMissingMandatoryAttributeError(error);
                    });
            });
            it('genomic position null pos error', () => {
                return gp.createRecord({pos: null})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectNullConstraintError(error);
                    });
            });
        });
        it('exonic position');
        it('exonic position null pos error');
        it('cds position');
        it('cds position null pos error');
        it('cds position error on null offset');
        it('protein position');
        it('protein position null pos error');
        it('cytoband position with all fields');
        it('cytoband position with arm only');
        it('cytoband position with no minor band');
        it('cytoband null arm error');
        it('range null start error');
        it('range null end error');
        it('range of two positions');
        it('range of a position and another range');
        it('range of two ranges');
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
    })
});
