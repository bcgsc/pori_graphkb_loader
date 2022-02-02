const { simplifyRecordsLinks } = require('../src/graphkb');

describe('simplifyRecordsLinks', () => {
    test('simplifies nested objects into their RID only', () => {
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

        listOfContentToReturnAsIs.forEach(content => {
            const output = simplifyRecordsLinks(content);
            expect(output).toBe(content);
        });
        listOfContentToReturnUnnested.forEach((content, index) => {
            const output = simplifyRecordsLinks(content);
            const expectedOutput = simplifyRecordsLinks(ListOfReturnedUnnestedContent[index]);
            expect(output).toEqual(expectedOutput);
        });
    });
});
