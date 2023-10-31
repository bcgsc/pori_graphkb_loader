
const { ApiConnection } = require('../../src/graphkb');
const { fetchAndLoadBySymbol } = require('../../src/hgnc');


describe('fetchAndLoadBySymbol in HGNC loader', () => {
    const conn = new ApiConnection('https://graphkbdev-api.bcgsc.ca/api');
    const symbol = 'CEP43';

    const options = { password: process.env.GKB_PASS, username: process.env.GKB_USER };


    beforeAll(async () => {
        await conn.setAuth(options);
        jest.spyOn(conn, 'request');
        await fetchAndLoadBySymbol({ conn, symbol });
    });

    // TEST SUITE
    test('Add symbol feature', async () => {
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            body: {
                filters: {
                    AND: [
                        { source: { filters: { name: 'hgnc' }, target: 'Source' } },
                        { name: 'cep43' },
                    ],
                },
                neighbors: 1,
                target: 'Feature',
            },
            method: 'POST',
            uri: '/query',
        }));
    });
});
