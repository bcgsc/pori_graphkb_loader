/**
 * Test that require connection to a live database with pre-loaded data.
 * Should be read-only operations
 */

const {
    expect
} = require('chai');
const chai = require('chai');
const chaiHttp = require('chai-http');
const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');


const {
    setUpEmptyDB
} = require('./../util');
const conf = require('./../../config/livedb.js');
const auth = require('./../../app/middleware/auth');


chai.use(chaiHttp);

const REALLY_LONG_TIME = 10000000000;
conf.disableAuth = true;
conf.verbose = true;


describe('API', () => {
    let db,
        admin,
        app,
        mockToken,
        server;
    before(async () => {
        conf.verbose = true;
        ({
            db,
            admin,
            server
        } = await setUpEmptyDB(conf, false));

        const {AppServer} = require('./../../app'); // eslint-disable-line global-require
        delete conf.app.port;
        app = new AppServer(conf, false);

        await app.listen();
        mockToken = await auth.generateToken(db, admin.name, REALLY_LONG_TIME);
    });

    it('links all edges between disease nodes', async () => {
        // test for the linking issue described in https://www.bcgsc.ca/jira/browse/KBDEV-193
        // either an issue with record cleaning or the decycler
        const res = await chai.request(app.app)
            .get(`${app.prefix}/diseases?neighbors=3&limit=100`)
            .set('Authorization', mockToken);
        expect(res).to.have.status(HTTP_STATUS.OK);
        res.body = jc.retrocycle(res.body);
        const recordsByRID = {};
        for (const record of res.body.result) {
            recordsByRID[record['@rid']] = record;
        }
        // check the any edges also have their reciprocal edge
        let edgeCount = 0;
        for (const record of res.body.result) {
            // console.log(_.omit(record, ['dependency', 'createdBy', 'history', 'description']));
            const currRID = record['@rid'].toString();
            for (const attr of Object.keys(record)) {
                let direction,
                    edgeclass;
                if (attr.startsWith('out_')) {
                    direction = 'out';
                    edgeclass = attr.slice(4);
                } else if (attr.startsWith('in_')) {
                    direction = 'in';
                    edgeclass = attr.slice(3);
                } else {
                    continue;
                }
                const revDirection = direction === 'out'
                    ? 'in'
                    : 'out';

                // inspect the corresponing target edges
                for (const edge of record[attr] || []) {
                    if (!edge.in || !edge.out) {
                        continue;
                    }
                    const tgt = edge.out['@rid'].toString();
                    if (tgt === currRID || recordsByRID[tgt] === undefined) {
                        continue;
                    }
                    edgeCount++;
                    const reverseEdgeClass = `${revDirection}_${edgeclass}`;
                    const linkedTo = Array.from(recordsByRID[tgt][reverseEdgeClass] || [], x => x.in['@rid'].toString());
                    expect(linkedTo).to.include(currRID);
                }
            }
        }
        expect(edgeCount).to.be.greaterThan(0);
    });
    after(async () => {
        await db.close();
    });
});
