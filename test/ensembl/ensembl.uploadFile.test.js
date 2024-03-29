const fs = require('fs');
const path = require('path');
const fetchMock = require('node-fetch');
const { uploadFile } = require('../../src/ensembl');
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
        // Data in mockfile are ordered to match actual request order
        this.mockFile = path.join(__dirname, '../data/ensembl_uploadFile_requests.json');
        this.mockDataset = JSON.parse(fs.readFileSync(this.mockFile));
    }

    request() {
        // The expected http request is always the first of the array as we remove them when consume
        const { result } = this.mockDataset.shift();
        return result;
    }
}

describe('uploadFile in Ensembl loader', () => {
    const conn = new MockApiConnection(),
        filename = path.join(__dirname, '../data/ensembl_biomart_export_ENSG00000139618.tsv');

    beforeAll(async () => {
        jest.spyOn(conn, 'request');
        await uploadFile({ conn, filename });
    });

    // Expected features with their outgoing edges
    const expected = [
        {
            '@rid': '#138:0',
            edges: [],
            feature: {
                biotype: 'gene', source: 'ensembl', sourceId: 'ensg00000139618', sourceIdVersion: '17',
            },
        },
        {
            '@rid': '#139:0',
            edges: [
                { class: 'crossreferenceof', in: '#138:1' },
                { class: 'generalizationof', in: '#138:0' },
            ],
            feature: {
                biotype: 'gene', source: 'ensembl', sourceId: 'ensg00000139618', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#140:0',
            edges: [
                { class: 'elementof', in: '#138:0' },
            ],
            feature: {
                biotype: 'transcript', source: 'ensembl', sourceId: 'enst00000544455', sourceIdVersion: '6',
            },
        },
        {
            '@rid': '#137:1',
            edges: [
                { class: 'elementof', in: '#139:0' },
                { class: 'generalizationof', in: '#140:0' },
            ],
            feature: {
                biotype: 'transcript', source: 'ensembl', sourceId: 'enst00000544455', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#139:3',
            edges: [
                { class: 'elementof', in: '#138:0' },
            ],
            feature: {
                biotype: 'transcript', source: 'ensembl', sourceId: 'enst00000530893', sourceIdVersion: '6',
            },
        },
        {
            '@rid': '#140:3',
            edges: [
                { class: 'elementof', in: '#139:0' },
                { class: 'generalizationof', in: '#139:3' },
            ],
            feature: {
                biotype: 'transcript', source: 'ensembl', sourceId: 'enst00000530893', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#137:4',
            edges: [
                { class: 'elementof', in: '#138:0' },
            ],
            feature: {
                biotype: 'transcript', source: 'ensembl', sourceId: 'enst00000380152', sourceIdVersion: '8',
            },
        },
        {
            '@rid': '#138:4',
            edges: [
                { class: 'elementof', in: '#139:0' },
                { class: 'generalizationof', in: '#137:4' },
            ],
            feature: {
                biotype: 'transcript', source: 'ensembl', sourceId: 'enst00000380152', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#139:4',
            edges: [
                { class: 'elementof', in: '#138:0' },
            ],
            feature: {
                biotype: 'transcript', source: 'ensembl', sourceId: 'enst00000680887', sourceIdVersion: '1',
            },
        },
        {
            '@rid': '#140:4',
            edges: [
                { class: 'elementof', in: '#139:0' },
                { class: 'generalizationof', in: '#139:4' },
            ],
            feature: {
                biotype: 'transcript', source: 'ensembl', sourceId: 'enst00000680887', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#145:1',
            edges: [
                { class: 'elementof', in: '#140:0' },
            ],
            feature: {
                biotype: 'protein', source: 'ensembl', sourceId: 'ensp00000439902', sourceIdVersion: '1',
            },
        },
        {
            '@rid': '#146:1',
            edges: [
                { class: 'elementof', in: '#137:1' },
                { class: 'generalizationof', in: '#145:1' },
            ],
            feature: {
                biotype: 'protein', source: 'ensembl', sourceId: 'ensp00000439902', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#147:2',
            edges: [
                { class: 'elementof', in: '#139:3' },
            ],
            feature: {
                biotype: 'protein', source: 'ensembl', sourceId: 'ensp00000499438', sourceIdVersion: '2',
            },
        },
        {
            '@rid': '#148:2',
            edges: [
                { class: 'elementof', in: '#140:3' },
                { class: 'generalizationof', in: '#147:2' },
            ],
            feature: {
                biotype: 'protein', source: 'ensembl', sourceId: 'ensp00000499438', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#149:3',
            edges: [
                { class: 'elementof', in: '#137:4' },
            ],
            feature: {
                biotype: 'protein', source: 'ensembl', sourceId: 'ensp00000369497', sourceIdVersion: '3',
            },
        },
        {
            '@rid': '#150:3',
            edges: [
                { class: 'elementof', in: '#138:4' },
                { class: 'generalizationof', in: '#149:3' },
            ],
            feature: {
                biotype: 'protein', source: 'ensembl', sourceId: 'ensp00000369497', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#151:4',
            edges: [
                { class: 'elementof', in: '#139:4' },
            ],
            feature: {
                biotype: 'protein', source: 'ensembl', sourceId: 'ensp00000505508', sourceIdVersion: '1',
            },
        },
        {
            '@rid': '#152:4',
            edges: [
                { class: 'elementof', in: '#140:4' },
                { class: 'generalizationof', in: '#151:4' },
            ],
            feature: {
                biotype: 'protein', source: 'ensembl', sourceId: 'ensp00000505508', sourceIdVersion: null,
            },
        },
        {
            '@rid': '#138:3',
            edges: [],
            feature: {
                biotype: 'gene', name: 'BRCA2', source: 'entrez gene', sourceId: '675',
            },
        },
        {
            '@rid': '#138:1',
            edges: [
                { class: 'crossreferenceof', in: '#138:3' },
            ],
            feature: { biotype: 'gene', name: 'BRCA2', source: 'hgnc' },
        },
        {
            '@rid': '#140:1',
            edges: [
                { class: 'deprecatedby', in: '#138:1' },
            ],
            feature: { biotype: 'gene', name: 'FACD', source: 'hgnc' },
        },
        {
            '@rid': '#137:2',
            edges: [
                { class: 'deprecatedby', in: '#138:1' },
            ],
            feature: { biotype: 'gene', name: 'FANCD', source: 'hgnc' },
        },
        {
            '@rid': '#139:1',
            edges: [
                { class: 'deprecatedby', in: '#138:1' },
            ],
            feature: { biotype: 'gene', name: 'FANCD1', source: 'hgnc' },
        },
        {
            '@rid': '#138:2',
            edges: [
                { class: 'aliasof', in: '#138:1' },
            ],
            feature: { biotype: 'gene', name: 'FAD', source: 'hgnc' },
        },
        {
            '@rid': '#139:2',
            edges: [
                { class: 'aliasof', in: '#138:1' },
            ],
            feature: { biotype: 'gene', name: 'FAD1', source: 'hgnc' },
        },
        {
            '@rid': '#140:2',
            edges: [
                { class: 'aliasof', in: '#138:1' },
            ],
            feature: { biotype: 'gene', name: 'BRCC2', source: 'hgnc' },
        },
        {
            '@rid': '#137:3',
            edges: [
                { class: 'aliasof', in: '#138:1' },
            ],
            feature: { biotype: 'gene', name: 'XRCC11', source: 'hgnc' },
        },
    ].map(el => Object.assign(el, {

        // Custom method - Returns the source's RID from mockDataset
        getSourceRid: () => ((conn.request).mock.results.filter(
            (a) => a.value.result['@class'] === 'Source'
                && a.value.result.name === el.feature.source,
        )[0].value.result['@rid']),

        // Custom method - Returns a string representation of the feature
        toString: () => ('name' in el.feature
            ? `${el.feature.biotype} Feature ${el.feature.name} from ${el.feature.source}`
            : `${el.feature.biotype} Feature ${el.feature.sourceId} from ${el.feature.source}`),
    }));



    // TEST SUITE
    // Sources
    const sources = [...new Set(expected.map((el) => (el.feature.source)))];

    test.each(sources)('Add Source %s', (source) => {
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({ name: source }),
            uri: '/sources',
        }));
    });

    // Features
    test.each(expected)('Add %s', (el) => {
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.objectContaining({
                ...el.feature,
                source: el.getSourceRid(),
            }),
            uri: '/features',
        }));
    });

    // Edges
    test.each(expected)('Add edges of %s', (el) => {
        el.edges.forEach((edge) => {
            expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
                body: {
                    in: edge.in,
                    out: el['@rid'],
                    source: el.getSourceRid(),
                },
                uri: `/${edge.class}`,
            }));
        });
    });
});
