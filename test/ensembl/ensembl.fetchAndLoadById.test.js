const fs = require('fs');
const path = require('path');
const fetchMock = require('node-fetch');
const { fetchAndLoadById } = require('../../src/ensembl');
const { ApiConnection } = require('../../src/graphkb');

// Mock node-fetch calls to external APIs
jest.mock('node-fetch', () => require('fetch-mock-jest').sandbox()); // eslint-disable-line global-require
const extApiData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/external_api_responses.json')));
Object.entries(extApiData).forEach(([url, respBody]) => {
    fetchMock.get(url, respBody);
});

// Mock ApiConnexion class with overrided request function
class MockApiConnection extends ApiConnection {
    constructor() {
        super();
        this.mockFile = path.join(__dirname, '../data/ensembl_fetchAndLoadById_requests.json');
        this.mockDataset = JSON.parse(fs.readFileSync(this.mockFile));
        this.ridSource = this.mockDataset[1].result.result['@rid'];
        this.ridTranscript = this.mockDataset[3].result.result['@rid'];
        this.ridUnversionizedTranscript = this.mockDataset[4].result.result['@rid'];
        this.ridGene = this.mockDataset[6].result.result['@rid'];
    }

    request() {
        const { result } = this.mockDataset[0];
        this.mockDataset.shift();
        return result;
    }
}

describe('fetchAndLoadById in Ensembl loader', () => {
    const conn = new MockApiConnection(),
        biotype = 'transcript',
        sourceId = 'ENST00000544455',
        sourceIdVersion = '6';

    beforeAll(async () => {
        jest.spyOn(conn, 'request');
        await fetchAndLoadById(conn, { biotype, sourceId, sourceIdVersion });
    });

    // TEST SUITE
    test('Add Ensembl Source', async () => {
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
                source: conn.ridSource,
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
                source: conn.ridSource,
                sourceId: sourceId.toLowerCase(),
                sourceIdVersion: null,
            }),
            method: 'POST',
            uri: '/features',
        }));
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({
                in: conn.ridTranscript,
                out: conn.ridUnversionizedTranscript,
                source: conn.ridSource,
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
                source: conn.ridSource,
                sourceId: 'ENSG00000139618',
                sourceIdVersion: null,
            }),
            method: 'POST',
            uri: '/features',
        }));
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({
                in: conn.ridGene,
                out: conn.ridUnversionizedTranscript,
                source: conn.ridSource,
            }),
            method: 'POST',
            uri: '/elementof',
        }));
    });
});
