const fs = require('fs');
const path = require('path');
const fetchMock = require('node-fetch');
const { fetchAndLoadById } = require('../../src/ensembl');
const { ApiConnection } = require('../../src/graphkb');

jest.mock('node-fetch', () => require('fetch-mock-jest').sandbox()); // eslint-disable-line global-require

jest.mock('../../src/graphkb', () => {
    const { ApiConnection: mockApiConnection, ...graphkb } = jest.requireActual('../../src/graphkb');
    mockApiConnection.prototype.request = jest.fn();
    return { ApiConnection: mockApiConnection, ...graphkb };
});

const extApiData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/external_api_responses.json')));
Object.entries(extApiData).forEach(([url, respBody]) => {
    fetchMock.get(url, respBody);
});


describe('fetchAndLoadById in Ensembl loader', () => {
    // Mock response of ApiConnection's request method for requests to GraphKB API
    const mockFile = path.join(__dirname, '../data/ensembl_fetchAndLoadById_requests.json');
    const mockDataset = JSON.parse(fs.readFileSync(mockFile));
    const conn = new ApiConnection('');
    conn.request.mockImplementation(() => {
        const { result } = mockDataset[0];
        mockDataset.shift();
        return result;
    });

    // Returned RIDs from GraphKB mock responses
    const ridSource = mockDataset[1].result.result['@rid'];
    const ridTranscript = mockDataset[3].result.result['@rid'];
    const ridUnversionizedTranscript = mockDataset[4].result.result['@rid'];
    const ridGene = mockDataset[6].result.result['@rid'];

    // Calling fetchAndLoadById
    const biotype = 'transcript';
    const sourceId = 'ENST00000544455';
    const sourceIdVersion = '6';
    fetchAndLoadById(conn, { biotype, sourceId, sourceIdVersion });

    // TEST SUITE
    test('Add Ensembl Source', () => {
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({ name: 'ensembl' }),
            method: 'POST',
            uri: '/sources',
        }));
    });

    test('Add transcript Feature', () => {
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({
                biotype,
                source: ridSource,
                sourceId,
                sourceIdVersion,
            }),
            method: 'POST',
            uri: '/features',
        }));
    });

    test('Add unversionized transcript Feature and GeneralisationOf', () => {
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({
                biotype,
                source: ridSource,
                sourceId: sourceId.toLowerCase(),
                sourceIdVersion: null,
            }),
            method: 'POST',
            uri: '/features',
        }));
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({
                in: ridTranscript,
                out: ridUnversionizedTranscript,
                source: ridSource,
            }),
            method: 'POST',
            uri: '/generalizationof',
        }));
    });

    test('Add gene Feature (from Ensembl API) and ElementOf', () => {
        expect(fetchMock).toHaveFetched(`http://rest.ensembl.org/lookup/id/${sourceId.toLowerCase()}`);
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({
                biotype: 'gene',
                source: ridSource,
                sourceId: 'ENSG00000139618',
                sourceIdVersion: null,
            }),
            method: 'POST',
            uri: '/features',
        }));
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({
                in: ridGene,
                out: ridUnversionizedTranscript,
                source: ridSource,
            }),
            method: 'POST',
            uri: '/elementof',
        }));
    });
});
