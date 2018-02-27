'use strict';
const {Target} = require('./../../app/repo/target');
const {expect} = require('chai');
const {Context} = require('./../../app/repo/context');
const {expectDuplicateKeyError} = require('./orientdb_errors');
const {setUpEmptyDB, tearDownEmptyDB} = require('./util');


describe('Target schema tests:', () => {
    let server, db;
    beforeEach(async () => { 
        ({server, db, user} = await setUpEmptyDB());
        await Context.createClass(db);
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

    afterEach(async () => {
        tearDownEmptyDB(server);    
    });
});
