'use strict';
const {expect} = require('chai');

const {create, update, remove, select} = require('./../app/repo/base');
const {PERMISSIONS} = require('./../app/repo/constants');

const {setUpSampleDB, tearDownSampleDB} = require('./util');

describe('sample', () => {
    let server, db, schema, adminUser;
    before(async () => {
        ({server, db, schema} = await setUpSampleDB(false));
        adminUser = await db.select().from('User').where({name: 'admin'}).all();
        expect(adminUser).to.have.property('length', 1);
        adminUser = adminUser[0];
    });
    describe('GET /diseases', () => {
        it('name');
        it('createdBy');
        it('source');
        it('sourceId');
        it('nameVersion');
        it('subsets');
    });
    it('GET /diseases/{id}');
    describe('GET /anatomicalentities', () => {
        it('name');
        it('createdBy');
        it('source');
        it('sourceId');
        it('nameVersion');
        it('subsets');
    });
    it('GET /anatomicalentities/{id}');
    describe('GET /ontologies', () => {
        it('name');
        it('createdBy');
        it('source');
        it('sourceId');
        it('nameVersion');
        it('subsets');
    });
    it('GET /ontologies/{id}');
    describe('GET /therapies', () => {
        it('name');
        it('createdBy');
        it('source');
        it('sourceId');
        it('nameVersion');
        it('subsets');
    });
    it('GET /therapies/{id}');

    after(async () => {
        await tearDownSampleDB(server);
    });
});
