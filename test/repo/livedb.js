/**
 * Test that require connection to a live database with pre-loaded data.
 * Should be read-only operations
 */

const {
    expect
} = require('chai');


const {
    setUpEmptyDB
} = require('./../util');

const conf = require('./../../config/livedb.js');

const {select} = require('./../../app/repo/base');
const {SCHEMA_DEFN} = require('./../../app/repo/schema');


conf.verbose = true;


describe('repo', () => {
    let db,
        server;
    before(async () => {
        conf.verbose = true;
        ({
            db,
            server
        } = await setUpEmptyDB(conf, false));
    });

    it('links all edges between disease nodes', async () => {
        // test for the linking issue described in https://www.bcgsc.ca/jira/browse/KBDEV-193
        // either an issue with record cleaning or the decycler
        const result = await select(db, {
            limit: 1000,
            fetchPlan: '*:3',
            model: SCHEMA_DEFN.Disease
        });
        const recordsByRID = {};
        for (const record of result) {
            recordsByRID[record['@rid'].toString()] = record;
        }
        // check the any edges also have their reciprocal edge
        let edgeCount = 0;
        for (const record of result) {
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
