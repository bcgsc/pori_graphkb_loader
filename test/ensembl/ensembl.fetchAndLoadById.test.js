const fs = require('fs');

const { fetchAndLoadById } = require('../../src/ensembl');
const { ApiConnection } = require('../../src/graphkb');
const { request } = require('../../src/util');

// Mock the request function from utility module in order to avoid real http requests
jest.mock('../../src/util.js', () => {
    const { request: mockFunction } = require('../../src/__mocks__/util.request');
    const originalModule = jest.requireActual('../../src/util.js');
    return {
        ...originalModule,
        request: mockFunction,
    };
});

// Mock dataset filepath will be passed to mock function via a global variable
global.mockFile = '';

describe('fetchAndLoadById in Ensembl loader', () => {
    // LOAD MOCK DATASET
    // Json file containing all expected http request and responses to utility request function
    // (The mock data need to be created first by spying on the function in a real environment)
    global.mockFile = `${process.cwd()}/test/data/ensembl_byId_ENST00000544455_mockDataset.json`;
    const mockDataset = JSON.parse(fs.readFileSync(global.mockFile, { encoding: 'utf-8', flag: 'r' }));
    const HOSTNAME = 'bcgsc.ca'; // Must be the same hostname as in mock dataset

    // TEST COUNTING NB OF EACH QUERY TYPE TO GRAPHKB API
    test('querying the graphKb Api', async () => {
        // Main fetchAndLoadById() call for all tests (needs to be inside an async function)
        const biotype = 'transcript';
        const sourceId = 'ENST00000544455';
        const sourceIdVersion = '6';
        const conn = new ApiConnection(`http://${HOSTNAME}:8080/api`);
        await fetchAndLoadById(conn, { biotype, sourceId, sourceIdVersion });

        // VERTICES
        // Source
        const source = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/sources`
        ));
        expect(source.length).toBe(1);

        // Feature gene
        const gene = request.mock.calls.filter((record) => (
            (record[0].uri === `http://${HOSTNAME}:8080/api/features`)
            && (record[0].body.biotype === 'gene')
        ));
        expect(gene.length).toBe(1);

        // Feature transcript
        const transcript = request.mock.calls.filter((record) => (
            (record[0].uri === `http://${HOSTNAME}:8080/api/features`)
            && (record[0].body.biotype === 'transcript')
        ));
        expect(transcript.length).toBe(2);

        // EDGES
        // generalizationof
        const generalizationof = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/generalizationof`
        ));
        expect(generalizationof.length).toBe(1);

        // elementof
        const elementof = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/elementof`
        ));
        expect(elementof.length).toBe(1);
    });

    // TESTS LOOKING AT QUERIES PARAMETERS
    // VERTICES
    // SOURCE
    test.each([
        ['ensembl'],
    ])('adding %s source Feature Vertice in DB', (source) => {
        // Filter request() calls by source infos
        const calls = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/sources`
            && (record[0].body.name === source)
        ));
        expect(calls.length).toBe(1);
    });

    // FEATURES - GENE
    test.each([
        ['ensembl', undefined, 'ENSG00000139618', null, undefined],
    ])('adding %s gene Feature Vertice in DB', (source, name, sourceId, sourceIdVersion, deprecated) => {
        // Get source @rid returned by mock dataset
        const sourceRid = mockDataset.filter((record) => (
            (record.request.url === `http://${HOSTNAME}:8080/api/sources`)
            && (record.request.body.name === source)
        ))[0].response.result['@rid'];
        // Filter request() calls by gene feature infos
        const calls = request.mock.calls.filter((record) => (
            (record[0].uri === `http://${HOSTNAME}:8080/api/features`)
            && (record[0].body.biotype === 'gene')
            && (record[0].body.source === sourceRid)
            && (record[0].body.name === name)
            && (record[0].body.sourceId === sourceId)
            && (record[0].body.sourceIdVersion === sourceIdVersion)
            && (record[0].body.deprecated === deprecated)
        ));
        expect(calls.length).toBe(1);
    });

    // FEATURES - TRANSCRIPT
    test.each([
        ['ensembl', 'ENST00000544455', '6'],
        ['ensembl', 'enst00000544455', null], // To investigate why lowercase!
    ])('adding %s transcript Feature Vertice in DB', (source, sourceId, sourceIdVersion) => {
        // Get source @rid returned by mock dataset
        const sourceRid = mockDataset.filter((record) => (
            (record.request.url === `http://${HOSTNAME}:8080/api/sources`)
            && (record.request.body.name === source)
        ))[0].response.result['@rid'];
        // Filter request() calls by transcript feature infos
        const calls = request.mock.calls.filter((record) => (
            (record[0].uri === `http://${HOSTNAME}:8080/api/features`)
            && (record[0].body.biotype === 'transcript')
            && (record[0].body.source === sourceRid)
            && (record[0].body.sourceId === sourceId)
            && (record[0].body.sourceIdVersion === sourceIdVersion)
        ));
        expect(calls.length).toBe(1);
    });

    // VERTICES
    test.each([
        // generalizationof
        ['generalizationof', 'ensembl',
            { biotype: 'transcript', sourceId: 'enst00000544455', sourceIdVersion: null }, // To investigate why lowercase!
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: '6' },
        ],
        // elementof
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'enst00000544455', sourceIdVersion: null }, // To investigate why lowercase!
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
    ])('adding %s Edge from %s source in DB', (edgeType, source, outbound, inbound) => {
        // Get source @rid
        const sourceRid = mockDataset.filter((record) => (
            (record.request.url === `http://${HOSTNAME}:8080/api/sources`)
            && (record.request.body.name === source)
        ))[0].response.result['@rid'];
        // Get outbound feature @rid
        const outRid = mockDataset.filter((record) => (
            (record.request.url === `http://${HOSTNAME}:8080/api/features`)
            && (record.request.body.biotype === outbound.biotype)
            && (record.request.body.sourceId === outbound.sourceId)
            && (record.request.body.sourceIdVersion === outbound.sourceIdVersion)
        ))[0].response.result['@rid'];
        // Get inbound feature @rid
        const inRid = mockDataset.filter((record) => (
            (record.request.url === `http://${HOSTNAME}:8080/api/features`)
            && (record.request.body.biotype === inbound.biotype)
            && (record.request.body.sourceId === inbound.sourceId)
            && (record.request.body.sourceIdVersion === inbound.sourceIdVersion)
        ))[0].response.result['@rid'];
        // Filter request() calls by edge object infos
        const calls = request.mock.calls.filter((record) => (
            (record[0].uri === `http://${HOSTNAME}:8080/api/${edgeType}`)
            && (record[0].body.source === sourceRid)
            && (record[0].body.out === outRid)
            && (record[0].body.in === inRid)
        ));
        expect(calls.length).toBe(1);
    });
});
