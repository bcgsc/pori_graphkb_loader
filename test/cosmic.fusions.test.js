const path = require('path');

jest.mock('../src/util', () => {
    const original = jest.requireActual('../src/util');
    return {
        ...original,
        loadDelimToJson: jest.fn(),
    };
});

jest.mock('../src/entrez/pubmed', () => ({
    fetchAndLoadByIds: jest.fn(),
}));

jest.mock('../src/entrez/gene', () => ({
    fetchAndLoadBySymbol: jest.fn(),
}));

jest.mock('../src/cosmic/resistance', () => ({
    loadClassifications: jest.fn(),
    processDisease: jest.fn(),
}));

const util = require('../src/util');
const pubmed = require('../src/entrez/pubmed');
const gene = require('../src/entrez/gene');
const resistance = require('../src/cosmic/resistance');
const fusions = require('../src/cosmic/fusions');

const utilActual = jest.requireActual('../src/util');

describe('cosmic fusions', () => {
    const mockConn = () => ({
        addRecord: jest.fn().mockResolvedValue({ '@rid': '#153:0' }),
        addSource: jest.fn().mockResolvedValue({ '@rid': '#40:1' }),
        addVariant: jest.fn().mockResolvedValue({ '@rid': '#23:4' }),
        getUniqueRecordBy: jest.fn().mockResolvedValue({ '@rid': '#133:8' }),
        getVocabularyTerm: jest.fn().mockImplementation(async term => ({ '@rid': `#vocab:${term}` })),
    });

    const loadFixtureTsv = filename => utilActual.loadDelimToJson(
        path.join(__dirname, 'data', filename),
    );

    const classificationRowsToMap = rows => rows.reduce((mapping, row) => ({
        ...mapping,
        [row.COSMIC_PHENOTYPE_ID]: {
            disease: row.HISTOLOGY_SUBTYPE_1,
            diseaseFamily: row.PRIMARY_HISTOLOGY,
            ncit: row.NCI_CODE,
        },
    }), {});

    let fixtureRows = [];

    beforeEach(async () => {
        fixtureRows = await loadFixtureTsv('cosmic_fusion.tsv');
        const classificationRows = await loadFixtureTsv('cosmic_classification.tsv');
        const classificationMap = classificationRowsToMap(classificationRows);

        gene.fetchAndLoadBySymbol.mockImplementation(async (_conn, symbol) => [{ '@rid': `#gene:${symbol}` }]);
        pubmed.fetchAndLoadByIds.mockImplementation(async (_conn, ids) => ids.map(id => ({ '@rid': `#pubmed:${id}` })));
        resistance.loadClassifications.mockResolvedValue(classificationMap);
        resistance.processDisease.mockResolvedValue({ '@rid': '#133:99' });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('does not create statement below recurrence threshold', async () => {
        const conn = mockConn();
        util.loadDelimToJson.mockResolvedValueOnce(fixtureRows);

        await fusions.uploadFile({ classification: 'classification.tsv', conn, filename: 'fusion.tsv' });

        expect(conn.addSource).toHaveBeenCalledWith(fusions.SOURCE_DEFN);
        expect(pubmed.fetchAndLoadByIds).toHaveBeenCalledWith(conn, ['23405175']);

        const statementCalls = conn.addRecord.mock.calls.filter(([arg]) => arg.target === 'Statement');
        expect(statementCalls).toHaveLength(0);
    });

    test('creates recurrence statement when non-specific fusion reaches threshold', async () => {
        const conn = mockConn();
        const [baseRow] = fixtureRows;
        const rows = [
            {
                ...baseRow,
                COSMIC_SAMPLE_ID: 'S1',
                FIVE_PRIME_LAST_OBSERVE_EXON: '1',
                THREE_PRIME_FIRST_OBSERVE_EXON: '2',
            },
            {
                ...baseRow,
                COSMIC_SAMPLE_ID: 'S2',
                FIVE_PRIME_LAST_OBSERVE_EXON: '3',
                THREE_PRIME_FIRST_OBSERVE_EXON: '4',
            },
            {
                ...baseRow,
                COSMIC_SAMPLE_ID: 'S3',
                FIVE_PRIME_LAST_OBSERVE_EXON: '5',
                THREE_PRIME_FIRST_OBSERVE_EXON: '6',
            },
        ];
        util.loadDelimToJson.mockResolvedValueOnce(rows);

        await fusions.uploadFile({ classification: 'classification.tsv', conn, filename: 'fusion.tsv' });

        const statementCalls = conn.addRecord.mock.calls.filter(([arg]) => arg.target === 'Statement');
        expect(statementCalls).toHaveLength(1);
        expect(statementCalls[0][0]).toEqual(expect.objectContaining({
            content: expect.objectContaining({
                relevance: '#vocab:recurrent',
                subject: '#133:99',
            }),
            target: 'Statement',
        }));

        expect(conn.addVariant).toHaveBeenCalledWith({
            content: {
                reference1: '#gene:',
                reference2: '#gene:',
                type: '#vocab:fusion',
            },
            existsOk: true,
            target: 'CategoryVariant',
        });
        expect(pubmed.fetchAndLoadByIds).toHaveBeenCalledWith(conn, ['23405175', '23405175', '23405175']);
        expect(pubmed.fetchAndLoadByIds).toHaveBeenCalledWith(conn, ['23405175']);
        expect(resistance.processDisease).toHaveBeenCalledTimes(1);
    });
});
