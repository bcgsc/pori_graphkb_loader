'use strict';
const rewire = require('rewire');
const {
    expect
} = require('chai');
const {
    create,
    update,
    remove,
    select
} = require('./../../app/repo/base');
const {
    setUpEmptyDB,
} = require('./../util');
const chai = require('chai');
const chaiHttp = require('chai-http');

const HTTP_STATUS = require('http-status-codes');
const conf = require('./../config/empty');
const auth = rewire('./../../app/middleware/auth');


chai.use(chaiHttp);


describe('schema', () => {
    let db, admin, app;
    before(async () => {
        ({
            db,
            admin
        } = await setUpEmptyDB(conf));
        const mockToken = async (req, res, next) => {
            req.user = {name: 'admin', '@rid': '#41:0'};
            next();
        };
        auth.__set__('checkToken', mockToken);
        const {AppServer} = require('./../../app');
        app = new AppServer(conf, true);

        await app.listen(conf);
    });
    describe('GET /users', () => {
        it('name', async () => {
            const res = await chai.request(app.app)
                .get('/api/users?name=admin');
            console.log(res);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(1);
            expect(res.body[0].name).to.equal('admin');
        });
    });
    describe('POST /users', () => {
        it('name', async () => {
            const res = await chai.request(app.app)
                .post('/api/users')
                .type('json')
                .send({
                    name: 'blargh monkeys'
                });
            console.log(res);
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(1);
            expect(res.body[0].name).to.equal('admin');
        });
    });

    afterEach(async () => {
        // clear all V/E records
        await db.query('delete edge e');
        await db.query('delete vertex v');
    });
    after(async () => {
        await db.close();
    });
});