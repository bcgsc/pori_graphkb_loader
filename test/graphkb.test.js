const { simplifyRecordsLinks } = require('../src/graphkb');

describe('simplifyRecordsLinks', () => {
    test.each([
        123,
        123.0,
        'abc',
        null,
        undefined,
        false,
        {},
        { a: 1, b: 1 },
        { '@rid': 123, a: 1 },
    ])('does not change', (inputValue) => {
        const output = simplifyRecordsLinks(inputValue);
        expect(output).toEqual(inputValue);
    });

    test.each([
        [
            { a: [{ '@rid': 123, aa: 1 }, { ab: 2 }] },
            { a: ['123', { ab: 2 }] },
        ],
        [
            { a: { '@rid': 123, aa: 1 }, b: 2 },
            { a: '123', b: 2 },
        ],
        [
            { a: { '@rid': 123, a: { '@rid': 123, aa: 1 } } },
            { a: '123' },
        ],
    ])('being unnested', (inputValue, expectedValue) => {
        const output = simplifyRecordsLinks(inputValue);
        expect(output).toEqual(expectedValue);
    });
});
