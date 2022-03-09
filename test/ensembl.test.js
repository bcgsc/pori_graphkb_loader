const fs = require('fs');
const _ = require('lodash');

// Module where function we want to test (ApiConnection is passed as a parameter to uploadFile)
const ensembl = require('../src/ensembl');
const { ApiConnection } = require('../src/graphkb');
// Same hostname as mock data required
const HOSTNAME = 'bcgsc.ca';
const conn = new ApiConnection(`http://${HOSTNAME}:8080/api`);


// Module we want to mock (corresponding file needed in '../src/__mock__' folder)
jest.mock('../src/util');

describe('Ensembl loader testing (mock request function in ./src/util.js)', () => {
    // // 1 - LOADING MOCKING DATASET
    // // Json file containing all expected http request and responses to request() in ./src/util.js.
    // // (The mock data need to be created first by spying on the method in a real environment
    // // using ./src/__mock__/util_request_createMockDataset_ensembl.js)
    // const mockFilename = `${process.cwd()}/test/data/ensembl_ENSG00000139618_mockDataset.json`;
    // const mockData = JSON.parse(fs.readFileSync(mockFilename, { encoding: 'utf-8', flag: 'r' }));

    // 2 - TESTING
    // Reference to the same file used to create the mockDataset file in the first place
    const testFilename = `${process.cwd()}/test/data/ensembl_biomart_export_ENSG00000139618.tsv`;
    // Parameters (opt) of uploadFile
    const opt = { conn, filename: testFilename };

    test('Testing ensembl uploadFile', async () => {
        const spyUpload = jest.spyOn(ensembl, 'uploadFile');
        await ensembl.uploadFile(opt);
        expect(spyUpload).toHaveBeenCalled();
    });
});
