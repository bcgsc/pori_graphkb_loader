const fs = require('fs');
const jwt = require('jsonwebtoken');

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

// Load mock dataset as global variable
// Json file containing all expected http request and responses to utility request function
// (The mock data need to be created first by spying on the function in a real environment)
const mockFile = `${process.cwd()}/test/data/ensembl_byId_ENST00000544455_mockDataset.json`;
global.mockDataset = JSON.parse(fs.readFileSync(mockFile, { encoding: 'utf-8', flag: 'r' }));
// Set a local copy of the original mock dataset. Needed for @rid lookup
const originalMockDataset = JSON.parse(JSON.stringify(global.mockDataset));

// Set base URL used for mock dataset as global variable
global.baseUrl = 'http://bcgsc.ca:8080/api';

// Update expired API token if needed
const epochSeconds = () => Math.floor(new Date().getTime() / 1000);

if (jwt.decode(global.mockDataset[0].response.kbToken).exp <= epochSeconds()) {
    // First record in mock dataset needs to be a request on the token route
    global.mockDataset[0].response.kbToken = jwt.sign({ foo: 'bar' }, 'secret');
}

describe('fetchAndLoadById in Ensembl loader', () => {
    // TEST COUNTING NB OF EACH QUERY TYPE TO GRAPHKB API
    test('querying the graphKb Api', async () => {
        // Main fetchAndLoadById() call for all tests (needs to be inside an async function)
        const biotype = 'transcript';
        const sourceId = 'ENST00000544455';
        const sourceIdVersion = '6';
        const conn = new ApiConnection(global.baseUrl);
        await fetchAndLoadById(conn, { biotype, sourceId, sourceIdVersion });

        // VERTICES
        // Source
        const source = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/sources`
        ));
        expect(source.length).toBe(1);

        // Feature gene
        const gene = request.mock.calls.filter((record) => (
            (record[0].uri === `${global.baseUrl}/features`)
            && (record[0].body.biotype === 'gene')
        ));
        expect(gene.length).toBe(1);

        // Feature transcript
        const transcript = request.mock.calls.filter((record) => (
            (record[0].uri === `${global.baseUrl}/features`)
            && (record[0].body.biotype === 'transcript')
        ));
        expect(transcript.length).toBe(2);

        // EDGES
        // generalizationof
        const generalizationof = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/generalizationof`
        ));
        expect(generalizationof.length).toBe(1);

        // elementof
        const elementof = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/elementof`
        ));
        expect(elementof.length).toBe(1);
    });

    // TESTS LOOKING AT QUERIES PARAMETERS
    // VERTICES
    // SOURCE
    test('adding ensembl Source Vertice in DB', () => {
        // Filter request() calls by source infos
        const calls = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/sources`
            && (record[0].body.name === 'ensembl')
        ));
        expect(calls.length).toBe(1);
    });

    // FEATURES - GENE
    test('adding gene Feature Vertice in DB', () => {
        // Get source @rid returned by mock dataset
        const sourceRid = originalMockDataset.filter((record) => (
            (record.request.url === `${global.baseUrl}/sources`)
            && (record.request.body.name === 'ensembl')
        ))[0].response.result['@rid'];
        // Filter request() calls by gene feature infos
        const calls = request.mock.calls.filter((record) => (
            (record[0].uri === `${global.baseUrl}/features`)
            && (record[0].body.biotype === 'gene')
            && (record[0].body.source === sourceRid)
            && (record[0].body.sourceId === 'ENSG00000139618')
            && (record[0].body.sourceIdVersion === null)
        ));
        expect(calls.length).toBe(1);
    });

    // FEATURES - TRANSCRIPT
    test.each([
        ['ensembl', 'ENST00000544455', '6'],
        ['ensembl', 'enst00000544455', null],
    ])('adding transcript Feature Vertice in DB', (source, sourceId, sourceIdVersion) => {
        // Get source @rid returned by mock dataset
        const sourceRid = originalMockDataset.filter((record) => (
            (record.request.url === `${global.baseUrl}/sources`)
            && (record.request.body.name === source)
        ))[0].response.result['@rid'];
        // Filter request() calls by transcript feature infos
        const calls = request.mock.calls.filter((record) => (
            (record[0].uri === `${global.baseUrl}/features`)
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
            { biotype: 'transcript', sourceId: 'enst00000544455', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: '6' },
        ],
        // elementof
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'enst00000544455', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
    ])('adding %s Edge from %s source in DB', (edgeType, source, outbound, inbound) => {
        // Get source @rid
        const sourceRid = originalMockDataset.filter((record) => (
            (record.request.url === `${global.baseUrl}/sources`)
            && (record.request.body.name === source)
        ))[0].response.result['@rid'];
        // Get outbound feature @rid
        const outRid = originalMockDataset.filter((record) => (
            (record.request.url === `${global.baseUrl}/features`)
            && (record.request.body.biotype === outbound.biotype)
            && (record.request.body.sourceId === outbound.sourceId)
            && (record.request.body.sourceIdVersion === outbound.sourceIdVersion)
        ))[0].response.result['@rid'];
        // Get inbound feature @rid
        const inRid = originalMockDataset.filter((record) => (
            (record.request.url === `${global.baseUrl}/features`)
            && (record.request.body.biotype === inbound.biotype)
            && (record.request.body.sourceId === inbound.sourceId)
            && (record.request.body.sourceIdVersion === inbound.sourceIdVersion)
        ))[0].response.result['@rid'];
        // Filter request() calls by edge object infos
        const calls = request.mock.calls.filter((record) => (
            (record[0].uri === `${global.baseUrl}/${edgeType}`)
            && (record[0].body.source === sourceRid)
            && (record[0].body.out === outRid)
            && (record[0].body.in === inRid)
        ));
        expect(calls.length).toBe(1);
    });
});
