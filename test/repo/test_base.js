'use strict';
const {expect} = require('chai');
const conf = require('./../config/empty');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {PERMISSIONS} = require('./../../app/repo/constants');
const {Base, History, KBVertex, KBEdge, KBUser, KBRole} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');
const Promise = require('bluebird');


class MockVertexClass extends KBVertex { // simple non-abstract class for tests
    static createClass(db) {
        return Base.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname})
            .then(() => {
                return this.loadClass(db);
            });
    }
}


describe('base module', () => {
    let db, server, user;
    beforeEach(async () => { /* build and connect to the empty database */
        // set up the database server
        server = await connectServer(conf.server);
        const exists = await server.exists({name: conf.db.name});
        if (exists) {
            await server.exists({name: conf.db.name});
        }
        db = await createDB({
            server: server, 
            name: conf.db.name, 
            user: conf.db.user, 
            pass: conf.db.pass,
            heirarchy: [[KBRole], [KBUser]]
        });
        await db.models.KBRole.createRecord({name: 'admin', rules: {'kbvertex': PERMISSIONS.ALL}});
        user = await db.models.KBUser.createRecord({username: 'me', active: true, role: 'admin'});
    });
    it('KBVertex.createClass', () => {
        return KBVertex.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version', 'created_by', 'deleted_by']);
                expect(cls.constructor.clsname).to.equal('kbvertex');
                expect(cls.constructor.createType).to.equal('vertex');
                expect(cls.superClasses).to.eql(['V']);
            });
    });
    it('History.createClass', () => {
        return History.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['comment']);
                expect(cls.constructor.clsname).to.equal('history');
                expect(cls.constructor.createType).to.equal('edge');
            });
    });
    it('KBEdge.createClass', () => {
        return KBEdge.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'version', 'created_by', 'deleted_by']);
                expect(cls.constructor.clsname).to.equal('kbedge');
                expect(cls.constructor.createType).to.equal('edge');
                expect(cls.superClasses).to.eql(['E']);
            });
    });

    describe('MockVertexClass (instance)', () => {
        let mockRecord;
        beforeEach(async () => {
            await db.buildHeirarchy([
                [KBVertex, History],
                [MockVertexClass]
            ])
            mockRecord = await db.models.MockVertexClass.createRecord({}, user.content.username);
        });
        it('properties: retrieve inherited properties');
        it('superClasses: retrieve inherited classes', () => {
            expect(db.models.MockVertexClass.superClasses).to.eql(['kbvertex', 'V']);
        });
        it('isAbstract: status as db class', () => {
            expect(db.models.MockVertexClass.isAbstract).to.be.false;
        });
        it('propertyNames: returns names only', () => {
            const names = db.models.MockVertexClass.propertyNames;
            expect(names).to.include('uuid', 'created_at', 'deleted_at', 'version');
        });
        describe('isOrHasAncestor', () => {
            it('true for V', () => {
                expect(db.models.MockVertexClass.isOrHasAncestor('V')).to.be.true;
            });
            it('true for mock_vertex_class', () => {
                expect(db.models.MockVertexClass.isOrHasAncestor('mock_vertex_class')).to.be.true;
            });
            it('false for E', () => {
                expect(db.models.MockVertexClass.isOrHasAncestor('E')).to.be.false;
            });
        });
        it('updateRecord', () => {
            const uuid = mockRecord.content.uuid;
            const version = mockRecord.content.version;
            return db.models.MockVertexClass.updateRecord(mockRecord, user.content.username)
                .then((record) => {
                    expect(record.content.uuid).to.equal(uuid);
                    expect(record.content.version).to.equal(version + 1);
                    expect(record.content['@class']).to.equal(MockVertexClass.clsname);
                });
        });
        describe('createRecord', () => {
            it('errors on duplicate uuid + version', () => {
                return db.models.MockVertexClass.createRecord({uuid: mockRecord.content.uuid, version: mockRecord.content.version}, user.content.username)
                    .then(() => {
                        expect.fail('violated constraint should have thrown error');
                    }, (error) => {
                        oError.expectDuplicateKeyError(error);
                    });
            });
            it('errors on duplicate uuid + deleted_at', () => {
                return db.models.MockVertexClass.createRecord({uuid: mockRecord.content.uuid, version: mockRecord.content.version + 1}, user.content.username)
                    .then(() => {
                        expect.fail('violated constraint should have thrown error');
                    }, (error) => {
                        oError.expectDuplicateKeyError(error);
                    });
            });
        });
    });
    afterEach(async () => {
        /* disconnect from the database */
        await server.drop({name: conf.db.name});
        await server.close();
    });
});


describe('static', () => {
    let cls;
    beforeEach(function(done) {
        cls = new MockVertexClass();
        done();
    });
    it('clsname', () => {
        expect(cls.constructor.clsname).to.equal('mock_vertex_class');
    });
});
