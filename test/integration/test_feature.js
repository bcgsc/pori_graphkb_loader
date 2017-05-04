'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');


describe('Feature schema tests:', () => {
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

    it('create the feature class');
    
    describe('create record', () => {
        it('errors on invalid biotype');
        it('allows no biotype');
        it('errors on no name');
        it('errors on null name');
        it('errors on no source');
        it('errors on null source');
        it('errors on no source_version');
        it('allows null source_version');
        it('errors on duplicate name + source + source_version where deleted_at=null');
        it('allows update of biotype without violating unique index');
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
