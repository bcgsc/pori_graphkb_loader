const { simplifyRecordsLinks } = require('../src/graphkb');

describe('simplifyRecordsLinks', () => {
    const listOfContentToReturnAsIs = [
        1.0,
        null,
    ];
    const listOfContentToReturnUnnested = [
        {},
        { a: 1, b: 2 },
        { '@rid': 123, a: 1 },
        {
            a: [
                { '@rid': 123, aa: 1 },
                { ab: 2 },
            ],
        },
        {
            a: { '@rid': 123, aa: 1 },
            b: 2,
        },
        {
            a: {
                '@rid': 123,
                a: { '@rid': 123, aa: 1 },
            },
        },
    ];
    const ListOfReturnedUnnestedContent = [
        {},
        { a: 1, b: 2 },
        { '@rid': 123, a: 1 },
        {
            a: [
                '123',
                { ab: 2 },
            ],
        },
        { a: '123', b: 2 },
        { a: '123' },
    ];

    test.each(listOfContentToReturnAsIs)('do nothing when content not a list/k-v pair', content => {
        const output = simplifyRecordsLinks(content);
        expect(output).toBe(content);
    });

    const cases = [];
    listOfContentToReturnUnnested.forEach((content, index) => {
        cases.push([content, ListOfReturnedUnnestedContent[index]]);
    });

    test.each(cases)('simplifies nested obj. to RID', (content, expectedOutput) => {
        const output = simplifyRecordsLinks(content);
        expect(output).toEqual(expectedOutput);
    });
});










//
