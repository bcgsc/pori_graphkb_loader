const expect = require('chai');
const conf = require('./../db/config');
const {models, createSchema, loadSchema} = require('./../../app/db/models');
const connect = require('./../../app/db/connect');
const OrientDB  = require('orientjs');


describe('empty database tests', () => {
    var connection, db = null;
    before((done) => { /* build and connect to the empty database */
        // set up the database server
        connect(conf)
            .then((result) => {
                connection = result;
                return connection.create({name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
            }).then((result) => {
                db = result;
                return db.class.list();
            }).then((clsList) => {
                done();
            }).catch((error) => {
                console.log('error in connecting', error);
                done(error);
            });
    });
    it('creating the schema', () => {
        createSchema(db)
            .then((result) => {
                result.should.have.property('evidence');
            })
    });
    after((done) => {
        /* disconnect from the database */
        console.log('disconnecting from the db');
        db.close()
            .then(() => {
                console.log('dropping the test database');
                return connection.drop({name: conf.emptyDbName});
            }).catch((error) => {
                console.log('error:', error);
            }).then(() => {
                console.log('closing the server connection');
                return connection.server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error closing the server', error);
                done(error);
            });
    })
});


