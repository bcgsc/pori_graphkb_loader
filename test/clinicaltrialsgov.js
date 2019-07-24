const fs = require('fs');
const path = require('path');

const {fetchAndLoadById, convertAPIRecord} = require('../src/clinicaltrialsgov');
const {parseXmlToJson} = require('../src/util');


const api = {
    addRecord: jest.fn().mockImplementation(async ({content}) => content),
    getUniqueRecordBy: jest.fn().mockImplementation(async ({where}) => where)
};


jest.mock('../src/util', () => {
    const original = require.requireActual('../src/util');
    return {...original, requestWithRetry: jest.fn()};
});

const util = require('../src/util');

const dataFileLoad = filename => fs.readFileSync(path.join(__dirname, filename));

afterEach(() => {
    jest.clearAllMocks();
});

describe('clinicaltrials.gov', () => {
    test('convertAPIRecord', async () => {
        const raw = await parseXmlToJson(dataFileLoad('data/clinicaltrialsgov.NCT03478891.xml'));
        const result = convertAPIRecord(raw);
        expect(result).toHaveProperty('sourceId', 'NCT03478891');
        expect(result).toHaveProperty('sourceIdVersion', '2019-07-15');

        expect(result).toHaveProperty('phases', ['Phase 1']);
        expect(result).toHaveProperty('startDate', '2018-05-16');
        expect(result).toHaveProperty('completionDate', '2019-03-20');
        expect(result).toHaveProperty('locations', [{city: 'bethesda', country: 'united states'}]);
        expect(result).toHaveProperty('drugs', ['VRC-EBOMAB092-00-AB (MAb114)']);
        expect(result).toHaveProperty('diseases', ['Healthy Adult Immune Responses to Vaccine']);
    });
    test('fetchAndLoadById', async () => {
        api.getUniqueRecordBy.mockRejectedValueOnce(new Error('doesnt exist yet'));
        util.requestWithRetry.mockResolvedValueOnce(dataFileLoad('data/clinicaltrialsgov.NCT03478891.xml'));

        const result = await fetchAndLoadById(api, 'NCT03478891');
        expect(result).toHaveProperty('sourceId', 'NCT03478891');
        expect(result).toHaveProperty('sourceIdVersion', '2019-07-15');

        expect(result).toHaveProperty('source');
        expect(result).toHaveProperty('phase', '1');
        expect(result).toHaveProperty('startDate', '2018-05-16');
        expect(result).toHaveProperty('completionDate', '2019-03-20');
        expect(result).toHaveProperty('city', 'bethesda');
        expect(result).toHaveProperty('country', 'united states');
    });
});
