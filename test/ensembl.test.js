const fs = require('fs');

const { uploadFile } = require('../src/ensembl');
const { ApiConnection } = require('../src/graphkb');
const { request } = require('../src/util');

// Module we want to mock (corresponding file needed in '../src/__mock__' folder)
// to avoid real http request on any REST API
jest.mock('../src/util');

// LOADING MOCKING DATASET
// Json file containing all expected http request and responses to request() in ./src/util.js.
// (The mock data need to be created first by spying on the method in a real environment
// using ./src/__mock__/util_request_createMockDataset_ensembl.js)
const mockFilename = `${process.cwd()}/test/data/ensembl_ENSG00000139618_mockDataset.json`;
const mockDataset = JSON.parse(fs.readFileSync(mockFilename, { encoding: 'utf-8', flag: 'r' }));
const HOSTNAME = 'bcgsc.ca'; // Must be the same hostname as in mock dataset

describe('uploadFile in Ensembl loader', () => {
    // TEST COUNTING NB OF EACH QUERY TYPE TO GRAPHKB API
    test('querying the graphKb Api', async () => {
        // Main uploadFile() call for all tests
        // Needs to be inside an async function
        const conn = new ApiConnection(`http://${HOSTNAME}:8080/api`);
        const filename = `${process.cwd()}/test/data/ensembl_biomart_export_ENSG00000139618.tsv`;
        const opt = { conn, filename };
        await uploadFile(opt);

        // VERTICES
        // Source
        const source = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/sources`
        ));
        expect(source.length).toBe(5); // To be investigate!!

        // Feature gene
        const gene = request.mock.calls.filter((record) => (
            (record[0].uri === `http://${HOSTNAME}:8080/api/features`)
            && (record[0].body.biotype === 'gene')
        ));
        expect(gene.length).toBe(7);

        // Feature transcript
        const transcript = request.mock.calls.filter((record) => (
            (record[0].uri === `http://${HOSTNAME}:8080/api/features`)
            && (record[0].body.biotype === 'transcript')
        ));
        expect(transcript.length).toBe(9);

        // EDGES
        // crossreferenceof
        const crossReferencesOf = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/crossreferenceof`
        ));
        expect(crossReferencesOf.length).toBe(3);

        // deprecatedby
        const deprecatedBy = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/deprecatedby`
        ));
        expect(deprecatedBy.length).toBe(3);

        // generalizationof
        const generalizationof = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/generalizationof`
        ));
        expect(generalizationof.length).toBe(8); // 5, +3 errors!!

        // elementof
        const elementof = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/elementof`
        ));
        expect(elementof.length).toBe(8);
    });

    // TESTS LOOKING AT QUERIES PARAMETERS
    // VERTICES
    // SOURCE
    test.each([
        ['ensembl', 1],
        ['entrez gene', 1],
        ['hgnc', 1],
        ['refseq', 2], // To be investigated why 2!
    ])('adding %s source Feature Vertice in DB', (source, nb) => {
        // Filter request() calls by source infos
        const calls = request.mock.calls.filter((record) => (
            record[0].uri === `http://${HOSTNAME}:8080/api/sources`
            && (record[0].body.name === source)
        ));
        expect(calls.length).toBe(nb);
    });

    // FEATURES - GENE
    test.each([
        ['ensembl', undefined, 'ENSG00000139618', '17', undefined],
        ['ensembl', undefined, 'ENSG00000139618', null, undefined], // Generalization of v.17
        ['hgnc', 'BRCA2', 'HGNC:1101', '2021-05-26T00:00:00Z', false], // <-- Capital letters; to be investigated
        ['hgnc', 'FACD', 'hgnc:1101', undefined, true], // Deprecated FACD
        ['hgnc', 'FANCD', 'hgnc:1101', undefined, true], // Deprecated FANCD
        ['hgnc', 'FANCD1', 'hgnc:1101', undefined, true], // Deprecated FANCD1
    ])('adding %s gene Feature Vertice in DB', (source, name, sourceId, sourceIdVersion, deprecated) => {
        // Get source @rid returned by mock dataset
        const sourceRid = mockDataset.filter((record) => (
            (record.request.url === `http://${HOSTNAME}:8080/api/sources`)
            && (record.request.body.name === source)
        ))[0].response.result['@rid'];
        // Filter request() calls by gene infos
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
        ['refseq', 'NM_000059', null],
        ['ensembl', 'ENST00000544455', '6'],
        ['ensembl', 'ENST00000544455', null], // Gen. of corresponding versionised transcript
        ['ensembl', 'ENST00000530893', '6'],
        ['ensembl', 'ENST00000530893', null], // Gen. of corresponding versionised transcript
        ['ensembl', 'ENST00000380152', '8'],
        ['ensembl', 'ENST00000380152', null], // Gen. of corresponding versionised transcript
        ['ensembl', 'ENST00000680887', '1'],
        ['ensembl', 'ENST00000680887', null], // Gen. of corresponding versionised transcript
    ])('adding %s transcript Feature Vertice in DB', (source, sourceId, sourceIdVersion) => {
        // Get source @rid returned by mock dataset
        const sourceRid = mockDataset.filter((record) => (
            (record.request.url === `http://${HOSTNAME}:8080/api/sources`)
            && (record.request.body.name === source)
        ))[0].response.result['@rid'];
        // Filter request() calls by transcript infos
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
        ['generalizationof', 'ensembl', 4, // nb=1+3 errors!!
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        ['generalizationof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: '6' },
        ],
        ['generalizationof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000530893', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000530893', sourceIdVersion: '6' },
        ],
        ['generalizationof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: '8' },
        ],
        ['generalizationof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000680887', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'ENST00000680887', sourceIdVersion: '1' },
        ],
        // crossreferenceof
        ['crossreferenceof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: null },
            { biotype: 'transcript', sourceId: 'NM_000059', sourceIdVersion: null },
        ],
        ['crossreferenceof', 'ensembl', 1,
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['crossreferenceof', 'hgnc', 1,
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
            { biotype: 'gene', name: 'BRCA2', sourceId: '675' },
        ],
        // elementof
        ['elementof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
        ['elementof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000530893', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
        ['elementof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
        ['elementof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000680887', sourceIdVersion: null },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: null },
        ],
        ['elementof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000544455', sourceIdVersion: '6' },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        ['elementof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000530893', sourceIdVersion: '6' },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        ['elementof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000380152', sourceIdVersion: '8' },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        ['elementof', 'ensembl', 1,
            { biotype: 'transcript', sourceId: 'ENST00000680887', sourceIdVersion: '1' },
            { biotype: 'gene', sourceId: 'ENSG00000139618', sourceIdVersion: '17' },
        ],
        // deprecatedby
        ['deprecatedby', 'hgnc', 1,
            { biotype: 'gene', name: 'FACD', sourceId: 'hgnc:1101' },
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['deprecatedby', 'hgnc', 1,
            { biotype: 'gene', name: 'FANCD', sourceId: 'hgnc:1101' },
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
        ['deprecatedby', 'hgnc', 1,
            { biotype: 'gene', name: 'FANCD1', sourceId: 'hgnc:1101' },
            {
                biotype: 'gene',
                name: 'BRCA2',
                sourceId: 'HGNC:1101',
                sourceIdVersion: '2021-05-26T00:00:00Z',
            },
        ],
    ])('adding %s Edge from %s source in DB', (edgeType, source, nb, outbound, inbound) => {
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
            && (
                (('sourceIdVersion' in record.request.body) && (record.request.body.sourceIdVersion === outbound.sourceIdVersion))
                || !('sourceIdVersion' in record.request.body)
            )
            && (
                (('name' in record.request.body) && (record.request.body.name === outbound.name))
                || !('name' in record.request.body)
            )
        ))[0].response.result['@rid'];
        // Get inbound feature @rid
        const inRid = mockDataset.filter((record) => (
            (record.request.url === `http://${HOSTNAME}:8080/api/features`)
            && (record.request.body.biotype === inbound.biotype)
            && (record.request.body.sourceId === inbound.sourceId)
            && (
                (('sourceIdVersion' in record.request.body) && (record.request.body.sourceIdVersion === inbound.sourceIdVersion))
                || !('sourceIdVersion' in record.request.body)
            )
            && (
                (('name' in record.request.body) && (record.request.body.name === inbound.name))
                || !('name' in record.request.body)
            )
        ))[0].response.result['@rid'];
        // Filter request() calls by edge object infos
        const calls = request.mock.calls.filter((record) => (
            (record[0].uri === `http://${HOSTNAME}:8080/api/${edgeType}`)
            && (record[0].body.source === sourceRid)
            && (record[0].body.out === outRid)
            && (record[0].body.in === inRid)
        ));
        expect(calls.length).toBe(nb);
    });
});
