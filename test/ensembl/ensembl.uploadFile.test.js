const fs = require('fs');
const jwt = require('jsonwebtoken');

const { uploadFile } = require('../../src/ensembl');
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
const mockFile = `${process.cwd()}/test/data/ensembl_ENSG00000139618_mockDataset.json`;
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

describe('uploadFile in Ensembl loader', () => {
    // TEST COUNTING NB OF EACH QUERY TYPE TO GRAPHKB API
    test('querying the graphKb Api', async () => {
        // Main uploadFile() call for all tests (needs to be inside an async function)
        const conn = new ApiConnection(global.baseUrl);
        const filename = `${process.cwd()}/test/data/ensembl_biomart_export_ENSG00000139618.tsv`;
        const opt = { conn, filename };
        await uploadFile(opt);

        // VERTICES
        // Source
        const source = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/sources`
        ));
        expect(source.length).toBe(4);

        // Feature gene
        const gene = request.mock.calls.filter((record) => (
            (record[0].uri === `${global.baseUrl}/features`)
            && (record[0].body.biotype === 'gene')
        ));
        expect(gene.length).toBe(11);

        // Feature transcript
        const transcript = request.mock.calls.filter((record) => (
            (record[0].uri === `${global.baseUrl}/features`)
            && (record[0].body.biotype === 'transcript')
        ));
        expect(transcript.length).toBe(9);

        // EDGES
        // crossreferenceof
        const crossReferencesOf = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/crossreferenceof`
        ));
        expect(crossReferencesOf.length).toBe(3);

        // deprecatedby
        const deprecatedBy = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/deprecatedby`
        ));
        expect(deprecatedBy.length).toBe(3);

        // generalizationof
        const generalizationof = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/generalizationof`
        ));
        expect(generalizationof.length).toBe(5);

        // elementof
        const elementof = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/elementof`
        ));
        expect(elementof.length).toBe(8);

        // aliasof
        const aliasof = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/aliasof`
        ));
        expect(aliasof.length).toBe(4);
    });

    // TESTS LOOKING AT QUERIES PARAMETERS
    // VERTICES
    // SOURCE
    test.each([
        ['ensembl'],
        ['entrez gene'],
        ['hgnc'],
        ['refseq'],
    ])('adding %s Source Vertice in DB', (source) => {
        // Filter request() calls by source infos
        const calls = request.mock.calls.filter((record) => (
            record[0].uri === `${global.baseUrl}/sources`
            && (record[0].body.name === source)
        ));
        expect(calls.length).toBe(1);
    });

    // FEATURES - GENE
    test.each([
        ['ensembl', undefined, 'ENSG00000139618', '17', undefined],
        ['ensembl', undefined, 'ENSG00000139618', null, undefined],
        ['hgnc', 'BRCA2', 'HGNC:1101', '2021-05-26T00:00:00Z', false],
        ['hgnc', 'FACD', 'HGNC:1101', undefined, true],
        ['hgnc', 'FANCD', 'HGNC:1101', undefined, true],
        ['hgnc', 'FANCD1', 'HGNC:1101', undefined, true],
        ['hgnc', 'FAD', 'HGNC:1101', undefined, undefined],
        ['hgnc', 'FAD1', 'HGNC:1101', undefined, undefined],
        ['hgnc', 'BRCC2', 'HGNC:1101', undefined, undefined],
        ['hgnc', 'XRCC11', 'HGNC:1101', undefined, undefined],
    ])('adding gene Feature Vertice in DB', (source, name, sourceId, sourceIdVersion, deprecated) => {
        // Get source @rid returned by mock dataset
        const sourceRid = originalMockDataset.filter((record) => (
            (record.request.url === `${global.baseUrl}/sources`)
            && (record.request.body.name === source)
        ))[0].response.result['@rid'];
        // Filter request() calls by gene feature infos
        const calls = request.mock.calls.filter((record) => (
            (record[0].uri === `${global.baseUrl}/features`)
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
        ['refseq', 'NM_000059', null],
        ['ensembl', 'ENST00000544455', '6'],
        ['ensembl', 'ENST00000544455', null],
        ['ensembl', 'ENST00000530893', '6'],
        ['ensembl', 'ENST00000530893', null],
        ['ensembl', 'ENST00000380152', '8'],
        ['ensembl', 'ENST00000380152', null],
        ['ensembl', 'ENST00000680887', '1'],
        ['ensembl', 'ENST00000680887', null],
    ])('adding %s transcript Feature Vertice in DB', (source, sourceId, sourceIdVersion) => {
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
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        ['generalizationof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: '6' },
        ],
        ['generalizationof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000530893', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000530893', sourceIdVersion: '6' },
        ],
        ['generalizationof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: '8' },
        ],
        ['generalizationof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000680887', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000680887', sourceIdVersion: '1' },
        ],
        // crossreferenceof
        ['crossreferenceof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'NM_000059', sourceIdVersion: null },
        ],
        ['crossreferenceof', 'ensembl',
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['crossreferenceof', 'hgnc',
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
            { biotype: 'gene', name: 'BRCA2', sourceId: '675' },
        ],
        // elementof
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000530893', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000680887', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: '6' },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000530893', sourceIdVersion: '6' },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: '8' },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        ['elementof', 'ensembl',
            { biotype: 'transcript', sourceId: 'ENST00000680887', sourceIdVersion: '1' },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        // deprecatedby
        ['deprecatedby', 'hgnc',
            { biotype: 'gene', name: 'FACD', sourceId: 'HGNC:1101' },
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['deprecatedby', 'hgnc',
            { biotype: 'gene', name: 'FANCD', sourceId: 'HGNC:1101' },
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['deprecatedby', 'hgnc',
            { biotype: 'gene', name: 'FANCD1', sourceId: 'HGNC:1101' },
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        // aliasof
        ['aliasof', 'hgnc',
            { biotype: 'gene', name: 'FAD', sourceId: 'HGNC:1101' }, // lowercase!
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['aliasof', 'hgnc',
            { biotype: 'gene', name: 'FAD1', sourceId: 'HGNC:1101' }, // lowercase!
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['aliasof', 'hgnc',
            { biotype: 'gene', name: 'BRCC2', sourceId: 'HGNC:1101' }, // lowercase!
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['aliasof', 'hgnc',
            { biotype: 'gene', name: 'XRCC11', sourceId: 'HGNC:1101' }, // lowercase!
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
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
            && (record.request.body.name === outbound.name)
        ))[0].response.result['@rid'];
        // Get inbound feature @rid
        const inRid = originalMockDataset.filter((record) => (
            (record.request.url === `${global.baseUrl}/features`)
            && (record.request.body.biotype === inbound.biotype)
            && (record.request.body.sourceId === inbound.sourceId)
            && (record.request.body.sourceIdVersion === inbound.sourceIdVersion)
            && (record.request.body.name === inbound.name)
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
