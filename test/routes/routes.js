const chai = require('chai');
const chatHttp = require('chai-http');
const expect = chai.expect;
const HTTP_STATUS = require('http-status-codes');

chai.use(chatHttp);

let app;

describe('GET', () => {
    before( (done) => {
        require('./../../../app')
            .then((result) => {
                app = result;
                done();
            });
    });
    describe('/feature', () => {
        it('by name', async () => {
            const res = await chai.request(app).get('/api/feature?name=KRAS');
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(1);
            expect(res.body[0].name).to.equal('KRAS');
            return res;
        });
        it('by source', async () => {
            const res = await chai.request(app).get('/api/feature?source=hugo');
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(1423);
            return res;
        });
        it('by biotype', async () => {
            const res = await chai.request(app).get('/api/feature').query({biotype: 'gene'});
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.equal(1423);
            return res;
        });
    });
    describe('/feature/:id', () => {
        it('exists', async () => {
            const res = await chai.request(app).get('/api/feature/468b05b9-9047-4c9e-93d3-1457024f26ab');
            expect(res).to.have.status(HTTP_STATUS.OK);
            expect(res.body).to.be.a('object');
            expect(res.body).to.have.property('name', 'ABCC1');
            return res;
        });
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
});
