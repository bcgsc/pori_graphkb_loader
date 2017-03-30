const expect = require('chai');
const conf = require('./../db/config');
const {models, createSchema, loadSchema} = require('./../../app/db/models');
const connect = require('./../../app/db/connect');
const OrientDB  = require('orientjs');


describe('empty database tests', () => {
    var server, db = null;
    before((done) => { /* build and connect to the empty database */
        // set up the database server
        connect(conf)
            .then((result) => {
                server = result;
                return server.create({name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
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
                expect(result).to.have.all.keys(['evidence', 'context']);
                expect(result.evidence).to.have.property('properties');
                expect(result.evidence.properties).to.have.members([]);
            })
    });
    after((done) => {
        /* disconnect from the database */
        console.log('dropping the test database');
        server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                console.log('closing the server server');
                return server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error closing the server', error);
                done(error);
            });
    })
});


