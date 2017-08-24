'use strict';
const {Target} = require('./../../app/repo/target');
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {KBVertex, KBEdge, History, KBUser, KBRole} = require('./../../app/repo/base');
const {Context} = require('./../../app/repo/context');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {PERMISSIONS} = require('./../../app/repo/constants');

describe('Review schema tests:', () => {
    let server, db;
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
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });

    it('Target.createClass', () => {
        return Target.createClass(db)
            .then((targCls) => {
                expect(targCls).to.equal(db.models.target);
                expect(targCls.propertyNames).to.include('uuid', 'created_at', 'deleted_at', 'version');
                expect(targCls.isAbstract).to.be.false;
                expect(targCls.superClasses).to.include('V', KBVertex.clsname);
                expect(targCls.constructor.clsname).to.equal('target');
            });            
    });

    it('Creating a basic target record (only name)', () => {
        return Target.createClass(db)
            .then((targCls) => {
                return targCls.createRecord({name: 'name'}, 'me')
                    .then((Rec) => {
                        expect(Rec.content).to.include.keys('created_by', 'name');
                    }).catch((error) => {
                        console.log(error);
                    });
            });
    });

    it('Creating a target record with name and type', () => {
        return Target.createClass(db)
            .then((targCls) => {
                return targCls.createRecord({name: 'name', type: 'type'}, 'me')
                    .then((targRec) => {
                        expect(targRec.content).to.include.keys('created_by', 'name', 'type');
                    }).catch((error) => {
                        console.log(error);
                    });
            });
    });

    it('Creating target records with duplicate names', () => {
        return Target.createClass(db)
            .then((targCls) => {
                return targCls.createRecord({name: 'name'}, 'me')
                    .then(() => {
                        return targCls.createRecord({name: 'name'}, 'me');
                    }, () => {
                        expect.fail('failed on initial record creation');
                    }).then(() => {
                        expect.fail('expected an error');
                    }).catch((error) => {
                        expectDuplicateKeyError(error);
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
