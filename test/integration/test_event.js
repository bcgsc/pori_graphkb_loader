'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer} = require('./../../app/repo/connect');
const Promise = require('bluebird');



describe('Event schema tests:', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        connectServer(conf)
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
    
    it('create the event abstract class');
    it('errors adding a record to the abstract event class');
    it('create the PositionalEvent class');
    it('create the CategoryEvent class');

    describe('PositionalEvent', () => {
        it('allows events with same start/end positions');
        it('errors on either position not given');
        it('errors on invalid event subtype');
        it('errors on null subtype');
        it('allows no subtype');
        it('allows no untemplated_seq');
        it('errors on null untemplated_seq');
        it('errors on null reference_seq');
        it('allows no reference_seq');
        it('errors on no feature specified');
        it('errors on more than two features');
        it('errors on feature not found in database');
    });
    
    describe('CategoryEvent', () => {
        it('errors on invalid term');
        it('errors when a term is not specified');
        it('errors on null term');
        it('errors on invalid zygosity');
        it('allows null zygosity');
        it('allows no zygosity');
        it('errors on invalid event type');
        it('errors on no event type');
        it('errors on null event type');
        it('errors on more than one feature');
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
