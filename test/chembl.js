const fs = require('fs');
const path = require('path')

const {fetchAndLoadById} = require('../src/chembl');

const api = {
    addRecord: jest.fn().mockImplementation(async ({content}) => content),
    getUniqueRecordBy: jest.fn().mockImplementation(async ({where}) => where)
};


jest.mock('../src/util', () => {
    const original = require.requireActual('../src/util');
    return {...original, requestWithRetry: jest.fn()};
});

const util = require('../src/util');

const dataFileLoad = filename => JSON.parse(fs.readFileSync(path.join(__dirname, filename)));

afterEach(() => {
    jest.clearAllMocks();
});

describe('chembl', () => {
    test('fetchAndLoadById', async () => {
        util.requestWithRetry.mockResolvedValueOnce(dataFileLoad('data/chembl.CHEMBL553.json'));
        const result = await fetchAndLoadById(api, 'CHEMBL553');
        expect(result).toHaveProperty('sourceId', 'CHEMBL553');
        expect(result).toHaveProperty('name', 'ERLOTINIB');

        expect(api.addRecord).toHaveBeenCalledTimes(4);
    });
});
