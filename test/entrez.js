const fs = require('fs');
const path = require('path');

const gene = require('../src/entrez/gene');
const pubmed = require('../src/entrez/pubmed');
const refseq = require('../src/entrez/refseq');


const api = {
    addRecord: jest.fn().mockImplementation(async ({content}) => content)
};


jest.mock('../src/util', () => {
    const original = require.requireActual('../src/util');
    return {...original, requestWithRetry: jest.fn()};
});

const util = require('../src/util');

const dataFileToJson = filename => JSON.parse(fs.readFileSync(path.join(__dirname, filename)));

afterEach(() => {
    jest.clearAllMocks();
});

describe('entrez gene', () => {
    test('fetchAndLoadById', async () => {
        util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_gene.3845.json'));
        const kras = '3845';
        const [result] = await gene.fetchAndLoadByIds(api, [kras]);
        expect(result).toHaveProperty('biotype', 'gene');
        expect(result).toHaveProperty('name', 'KRAS');
        expect(result).toHaveProperty('sourceId', '3845');
        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('source');
    });
});

describe('pubmed', () => {
    test('fetchAndLoadById', async () => {
        util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_pubmed.30016509.json'));
        const [result] = await pubmed.fetchAndLoadByIds(api, ['30016509']);
        expect(result).toHaveProperty('year', 2019);
        expect(result).toHaveProperty('name', 'MAVIS: merging, annotation, validation, and illustration of structural variants.');
        expect(result).toHaveProperty('journalName', 'Bioinformatics (Oxford, England)');
        expect(result).toHaveProperty('sourceId', '30016509');
        expect(result).toHaveProperty('source');
        expect(result).toHaveProperty('displayName', 'pmid:30016509');
    });
});

describe('refseq', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('fetchAndLoadById', () => {
        test('transcript', async () => {
            util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_refseq.NM_005228.5.json'));
            const [result] = await refseq.fetchAndLoadByIds(api, ['NM_005228.5']);
            expect(result).toHaveProperty('biotype', 'transcript');
            expect(result).not.toHaveProperty('name');
            expect(result).toHaveProperty('sourceId', 'NM_005228');
            expect(result).toHaveProperty('sourceIdVersion', '5');
            expect(result).toHaveProperty('source');
            expect(result).toHaveProperty('displayName', 'NM_005228.5');
            expect(result).toHaveProperty('longName', 'Homo sapiens epidermal growth factor receptor (EGFR), transcript variant 1, mRNA');
        });
        test('chromosome', async () => {
            util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_refseq.NC_000003.11.json'));
            const [result] = await refseq.fetchAndLoadByIds(api, ['NC_000003.11']);
            expect(result).toHaveProperty('biotype', 'chromosome');
            expect(result).toHaveProperty('name', '3');
            expect(result).toHaveProperty('longName', 'Homo sapiens chromosome 3, GRCh37.p13 Primary Assembly');
            expect(result).toHaveProperty('sourceId', 'NC_000003');
            expect(result).toHaveProperty('sourceIdVersion', '11');
            expect(result).toHaveProperty('source');
            expect(result).toHaveProperty('displayName', 'NC_000003.11');
        });
        test('chromosome no version', async () => {
            util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_refseq.NC_000003.json'));
            const [result] = await refseq.fetchAndLoadByIds(api, ['NC_000003']);
            expect(result).toHaveProperty('biotype', 'chromosome');
            expect(result).toHaveProperty('name', '3');
            expect(result).not.toHaveProperty('longName');
            expect(result).toHaveProperty('sourceId', 'NC_000003');
            expect(result).not.toHaveProperty('sourceIdVersion');
            expect(result).toHaveProperty('source');
            expect(result).toHaveProperty('displayName', 'NC_000003');
        });
        test('protein', async () => {
            util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_refseq.NP_008819.1.json'));
            const [result] = await refseq.fetchAndLoadByIds(api, ['NP_008819.1']);
            expect(result).toHaveProperty('biotype', 'protein');
            expect(result).toHaveProperty('sourceId', 'NP_008819');
            expect(result).toHaveProperty('sourceIdVersion', '1');
            expect(result).toHaveProperty('source');
            expect(result).toHaveProperty('longName', 'calmodulin-1 isoform 2 [Homo sapiens]');
            expect(result).toHaveProperty('displayName', 'NP_008819.1');
        });
    });
});
