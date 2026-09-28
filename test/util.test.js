const path = require('path');

jest.mock('node-fetch', () => jest.fn());
jest.mock('sleep-promise', () => jest.fn());

const fetch = require('node-fetch');
const sleep = require('sleep-promise');
const {
    loadDelimToJson,
    loadXmlToJson,
    requestWithRetry,
} = require('../src/util');

describe('util', () => {
    test.todo('preferredSources');

    test.todo('convertOwlGraphToJson');

    test('loadDelimToJson', async () => {
        const filename = path.join(__dirname, 'data/UNII_Records_25Oct2018_sample.txt');
        const result = await loadDelimToJson(filename, '\t');
        expect(result.length).toBe(99);
    });

    test('loadXmlToJson', async () => {
        const filename = path.join(__dirname, 'data/drugbank_sample.xml');
        const result = await loadXmlToJson(filename);
        expect(result).toHaveProperty('drugbank');
        expect(result.drugbank).toHaveProperty('drug');
        expect(result.drugbank.drug.length).toBe(1);
    });

    test('requestWithRetry honors useCache=false across retry recursion', async () => {
        fetch.mockReset();
        sleep.mockReset();

        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ cached: true }),
        });
        await requestWithRetry({
            json: true,
            method: 'GET',
            uri: 'https://example.com/test',
        }, {
            retries: 0,
        });

        fetch.mockResolvedValueOnce({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            text: async () => 'rate limit exceeded',
        });
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ retried: true }),
        });
        sleep.mockResolvedValue();

        const result = await requestWithRetry({
            json: true,
            method: 'GET',
            uri: 'https://example.com/test',
        }, {
            retries: 1,
            useCache: false,
            waitMilliseconds: 1234,
        });

        expect(result).toEqual({ retried: true });
        expect(sleep).toHaveBeenCalledWith(1234);
        expect(fetch).toHaveBeenCalledTimes(3);
    });
});
