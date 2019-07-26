const fs = require('fs');
const path = require('path');

const {parseXmlToJson} = require('../src/util');

const diseaseOntology = require('../src/disease_ontology');

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
const dataFileToJson = filename => JSON.parse(dataFileLoad(filename));

afterEach(() => {
    jest.clearAllMocks();
});


describe('diseaseOntology', () => {
    test('uploadFile', async () => {
        const filename = path.join(__dirname, 'data/doid.sample.json');
        await diseaseOntology.uploadFile({conn: api, filename});
        expect(api.addRecord).toHaveBeenCalled();
    });
});


