'use strict';
const {expect} = require('chai');
const chai = require('chai');
const {setUpSampleDB, tearDownSampleDB} = require('./../util');
const app = require('../app');
const conf = require('./config/sample');
const auth = require('./../app/middleware/auth');
const chaiHttp = require('chai-http');
const HTTP_STATUS = require('http-status-codes');
const fs = require('fs');


chai.use(chaiHttp);

describe('sample', () => {
    let token;
    before(async () => {
        //const {server} = await setUpSampleDB(true);
        //await server.close();
        console.log('connecting to the api');
        // now set up the api server
        // create the authentication certificate for managing tokens
        if (! auth.keys.private) {
            auth.keys.private = fs.readFileSync(conf.private_key);
        }
        const admin = {name: 'admin', '@rid': '#41:0'};
        console.log('generating a token');
        token = await auth.generateToken({user: admin}, 10000000000);
        console.log(token);
    });
    describe('GET /users', () => {
        it('name', async () => {
            const res = await chai.request(app.app)
                .get('/api/users?name=admin')
                .set('Authorization', token);
            console.log(res);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(1);
            expect(res.body[0].name).to.equal('admin');
        });
    });
    it('GET /users/{id}');
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
        await app.close();
    });
});
