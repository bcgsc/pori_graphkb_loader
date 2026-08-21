const fs = require('fs');
const path = require('path');

jest.mock('../src/util', () => {
    const original = jest.requireActual('../src/util');
    return {
        ...original,
        loadDelimToJson: jest.fn(),
    };
});

const util = require('../src/util');
const pubmed = require('../src/entrez/pubmed');
const resistance = require('../src/cosmic/resistance');

const utilActual = jest.requireActual('../src/util');

describe('cosmic resistance', () => {
    const mockConn = () => ({
        addSource: jest.fn().mockResolvedValue({ '@rid': '#40:1' }),
        deleteRecord: jest.fn().mockResolvedValue(null),
        getRecords: jest.fn().mockResolvedValue([]),
        getUniqueRecordBy: jest.fn().mockResolvedValue({ '@rid': '#133:8' }),
        getVocabularyTerm: jest.fn().mockResolvedValue({ '@rid': '#106:3' }),
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    const loadFixtureTsv = filename => utilActual.loadDelimToJson(
        path.join(__dirname, 'data', filename),
    );

    describe('processDisease', () => {
        test('prefers ncit mapped disease', async () => {
            const conn = mockConn();
            const record = {
                disease: 'acute_myeloid_leukaemia',
                diseaseFamily: 'haematopoietic_neoplasm',
                ncit: 'C3171',
            };

            const result = await resistance.processDisease(conn, record);

            expect(result).toEqual({ '@rid': '#133:8' });
            expect(conn.getUniqueRecordBy).toHaveBeenCalledTimes(1);
            expect(conn.getUniqueRecordBy).toHaveBeenCalledWith(expect.objectContaining({
                target: 'Disease',
            }));
        });

        test('falls back to cleaned disease name when ncit lookup fails', async () => {
            const conn = mockConn();
            conn.getUniqueRecordBy
                .mockRejectedValueOnce(new Error('missing ncit'))
                .mockResolvedValueOnce({ '@rid': '#133:9' });

            const record = {
                disease: 'acute_myeloid_leukaemia',
                diseaseFamily: 'haematopoietic_tumour',
                ncit: 'C3171',
            };

            const result = await resistance.processDisease(conn, record);

            expect(result).toEqual({ '@rid': '#133:9' });
            expect(conn.getUniqueRecordBy).toHaveBeenNthCalledWith(2, {
                filters: { name: 'acute myeloid leukemia' },
                sort: expect.any(Function),
                target: 'Disease',
            });
        });

        test('falls back to disease family when disease is NS', async () => {
            const conn = mockConn();
            conn.getUniqueRecordBy
                .mockRejectedValueOnce(new Error('missing ncit'))
                .mockResolvedValueOnce({ '@rid': '#133:10' });

            const record = {
                disease: 'NS',
                diseaseFamily: 'solid_tumour',
                ncit: 'C0000',
            };

            const result = await resistance.processDisease(conn, record);

            expect(result).toEqual({ '@rid': '#133:10' });
            expect(conn.getUniqueRecordBy).toHaveBeenNthCalledWith(2, {
                filters: { name: 'solid tumor' },
                sort: expect.any(Function),
                target: 'Disease',
            });
        });
    });

    describe('uploadFile', () => {
        test('preloads pubmed, deletes stale statements, and writes error json', async () => {
            const conn = mockConn();
            conn.getRecords.mockResolvedValue([{ '@rid': '#153:0' }, { '@rid': '#153:1' }]);
            const resistanceRows = await loadFixtureTsv('cosmic_resistanceMutations.tsv');
            const classificationRows = await loadFixtureTsv('cosmic_classification.tsv');

            util.loadDelimToJson
                .mockResolvedValueOnce(resistanceRows)
                .mockResolvedValueOnce(classificationRows);
            const preLoadSpy = jest.spyOn(pubmed, 'preLoadCache').mockResolvedValue();
            const fetchPubmedSpy = jest.spyOn(pubmed, 'fetchAndLoadByIds').mockResolvedValue([]);
            const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => null);

            await resistance.uploadFile({
                classification: 'classification.tsv',
                conn,
                errorLogPrefix: 'errorLog-123',
                filename: 'resistance.tsv',
                maxRecords: -1,
            });

            expect(util.loadDelimToJson).toHaveBeenCalledTimes(2);
            expect(preLoadSpy).toHaveBeenCalledWith(conn);
            expect(fetchPubmedSpy).toHaveBeenCalledWith(conn, ['16983123', '16983123', '16983123'], { upsert: true });
            expect(conn.deleteRecord).toHaveBeenCalledTimes(2);
            expect(conn.deleteRecord).toHaveBeenCalledWith('Statement', '#153:0');
            expect(conn.deleteRecord).toHaveBeenCalledWith('Statement', '#153:1');
            expect(writeSpy).toHaveBeenCalledWith(
                'errorLog-123-cosmic.json',
                expect.stringContaining('"records": []'),
            );
        });
    });
});
