const chai = require('chai');
const chatHttp = require('chai-http');
const expect = chai.expect;
const HTTP_STATUS = require('http-status-codes');
const server = require('./../../app');

chai.use(chatHttp);

let app = server.app;

describe('GET', () => {
    before(async () => {
        await server.listen();
    });
    describe('/feature', () => {
        it('?name=KRAS', async () => {
            const res = await chai.request(app).get('/api/feature?name=KRAS');
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(1);
            expect(res.body[0].name).to.equal('kras');
        });
        it('?source=hugo', async () => {
            const res = await chai.request(app).get('/api/feature?source=hugo');
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            console.log('hugo genes', res.body.length);
            expect(res.body.length).to.equal(360);
        });
        it('?biotype=gene', async () => {
            const res = await chai.request(app).get('/api/feature').query({biotype: 'gene'});
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(360);
        });
    });
    describe('/feature/:id', () => {
        it('exists'/*, async () => { // TODO: changes when we change the db
            const res = await chai.request(app).get('/api/feature/468b05b9-9047-4c9e-93d3-1457024f26ab');
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('object');
            expect(res.body).to.have.property('name', 'abcc1');
        }*/);
        it('bad id', async () => {
            let res;
            try {
                res = await chai.request(app).get('/api/feature/bad-uuid');
            } catch (err) {
                res = err;
            }
            expect(res).to.have.status(HTTP_STATUS.BAD_REQUEST);
        });
        it('missing id', async () => {
            let res;
            try {
                res = await chai.request(app).get('/api/feature/968b05b9-9047-4c9e-93d3-1457024f26ab');
            } catch (err) {
                res = err;
            }
            expect(res).to.have.status(HTTP_STATUS.NOT_FOUND);
        });
    });
    describe('/disease', () => {});
    describe('/disease/:id', () => {});
    after(async function() {
        await server.close();
    });
});
