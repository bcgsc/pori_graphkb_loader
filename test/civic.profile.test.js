const { MolecularProfile } = require('../src/civic/profile');


describe('MolecularProfile._compile()', () => {
    test.each([
        [[['A', 'B']], 'AND', [['C', 'D']], [['A', 'B', 'C', 'D']]],
        [[['A', 'B']], 'AND', [['C', 'D'], ['E', 'F']], [['A', 'B', 'C', 'D'], ['A', 'B', 'E', 'F']]],
        [[['A', 'B'], ['C', 'D']], 'AND', [['E', 'F']], [['A', 'B', 'E', 'F'], ['C', 'D', 'E', 'F']]],
        [[['A', 'B']], 'OR', [['C', 'D']], [['A', 'B'], ['C', 'D']]],
        [[['A', 'B']], 'OR', [['C', 'D'], ['E', 'F']], [['A', 'B'], ['C', 'D'], ['E', 'F']]],
        [[['A', 'B'], ['C', 'D']], 'OR', [['E', 'F']], [['A', 'B'], ['C', 'D'], ['E', 'F']]],
    ])(
        'testing some conditions\' combinations', (arr, op, part, expected) => {
            expect(MolecularProfile()._compile({ arr, op, part })).toEqual(expected);
        },
    );
});

describe('MolecularProfile._end()', () => {
    const block = [
        { id: 1 }, { text: 'AND' },
        { text: '(' }, { id: 2 }, { text: 'OR' }, { id: 3 }, { text: ')' }, { text: 'AND' },
        { text: '(' }, { id: 4 }, { text: 'OR' },
        { text: '(' }, { id: 5 }, { text: 'AND' }, { id: 6 }, { text: ')' }, { text: ')' },
    ];

    test.each([
        [2, 0, 4],
        [4, 4, 8],
        [6, 4, 6],
    ])(
        'testing index and offset combinations: i=%s, offset=%s', (i, offset, expected) => {
            expect(MolecularProfile()._end({ block, i, offset })).toEqual(expected);
        },
    );
});

describe('MolecularProfile._not()', () => {
    test('check for presence of NOT operator in expression', () => {
        expect(MolecularProfile()._not([
            { entrezId: 9 }, { id: 1 }, { text: 'AND' }, { text: 'NOT' }, { text: '(' },
            { entrezId: 9 }, { id: 2 }, { text: 'OR' }, { entrezId: 9 }, { id: 3 }, { text: ')' },
        ])).toBe(true);
        expect(MolecularProfile()._not([
            { entrezId: 9 }, { id: 1 }, { text: 'AND' }, { text: '(' }, { entrezId: 9 },
            { id: 2 }, { text: 'OR' }, { entrezId: 9 }, { id: 3 }, { text: ')' },
        ])).toBe(false);
    });
});

describe('MolecularProfile.process()', () => {
    test.each([
        [
            { parsedName: [{ entrezId: 9 }, { id: 1 }, { text: 'AND' }, { entrezId: 9 }, { id: 2 }] },
            [[1, 2]],
        ],
        [
            { parsedName: [{ entrezId: 9 }, { id: 1 }, { text: 'OR' }, { entrezId: 9 }, { id: 2 }] },
            [[1], [2]],
        ],
        [
            {
                parsedName: [
                    { entrezId: 9 }, { id: 1 }, { text: 'AND' },
                    { text: '(' }, { entrezId: 9 }, { id: 2 }, { text: 'OR' }, { entrezId: 9 }, { id: 3 }, { text: ')' },
                ],
            },
            [[1, 2], [1, 3]],
        ],
        [
            {
                parsedName: [
                    { entrezId: 9 }, { id: 1 }, { text: 'OR' },
                    { text: '(' }, { entrezId: 9 }, { id: 2 }, { text: 'AND' }, { entrezId: 9 }, { id: 3 }, { text: ')' },
                ],
            },
            [[1], [2, 3]],
        ],
        [
            {
                parsedName: [
                    { text: '(' }, { entrezId: 9 }, { id: 1 }, { text: 'AND' }, { entrezId: 9 }, { id: 2 }, { text: ')' },
                    { text: 'OR' }, { text: '(' }, { entrezId: 9 }, { id: 3 }, { text: 'AND' }, { entrezId: 9 }, { id: 4 }, { text: ')' },
                ],
            },
            [[1, 2], [3, 4]],
        ],
        [
            {
                parsedName: [
                    { text: '(' }, { entrezId: 9 }, { id: 1 }, { text: 'OR' }, { entrezId: 9 }, { id: 2 }, { text: ')' },
                    { text: 'AND' }, { text: '(' }, { entrezId: 9 }, { id: 3 }, { text: 'OR' }, { entrezId: 9 }, { id: 4 }, { text: ')' },
                ],
            },
            [[1, 3], [1, 4], [2, 3], [2, 4]],
        ],
        [
            {
                parsedName: [
                    { entrezId: 9 }, { id: 1 }, { text: 'AND' },
                    { text: '(' }, { entrezId: 9 }, { id: 2 }, { text: 'OR' }, { entrezId: 9 }, { id: 3 }, { text: ')' },
                    { text: 'AND' }, { text: '(' }, { entrezId: 9 }, { id: 4 }, { text: 'OR' }, { entrezId: 9 }, { id: 5 }, { text: ')' },
                ],
            },
            [[1, 2, 4], [1, 2, 5], [1, 3, 4], [1, 3, 5]],
        ],
        [
            {
                parsedName: [
                    { entrezId: 9 }, { id: 1 }, { text: 'OR' },
                    { text: '(' }, { entrezId: 9 }, { id: 2 }, { text: 'AND' }, { entrezId: 9 }, { id: 3 }, { text: ')' },
                    { text: 'OR' }, { text: '(' }, { entrezId: 9 }, { id: 4 }, { text: 'AND' }, { entrezId: 9 }, { id: 5 }, { text: ')' },
                ],
            },
            [[1], [2, 3], [4, 5]],
        ],
        [
            {
                parsedName: [
                    { entrezId: 9 }, { id: 1 }, { text: 'AND' },
                    { text: '(' }, { entrezId: 9 }, { id: 2 }, { text: 'AND' },
                    { text: '(' }, { entrezId: 9 }, { id: 3 }, { text: 'OR' }, { id: 4 }, { text: ')' }, { text: ')' },
                ],
            },
            [[1, 2, 3], [1, 2, 4]],
        ],
    ])(
        'testing some Molecular Profiles expressions', (molecularProfile, expected) => {
            expect(MolecularProfile(molecularProfile).process()).toEqual(expected);
        },
    );

    test.each([
        [{}],
        [{ parsedName: '' }],
        [{ parsedName: [] }],
        [{ parsedName: [''] }],
    ])(
        'tests cases that should throw an Error', (molecularProfile) => {
            expect(() => MolecularProfile(molecularProfile).process()).toThrow(
                `unable to process molecular profile with missing or misformatted parsedName (${molecularProfile.id || ''})`,
            );
        },
    );

    test('not providing a molecularProfile argument should also throw an Error', () => {
        expect(() => MolecularProfile().process()).toThrow(
            'unable to process molecular profile with missing or misformatted parsedName ()',
        );
    });

    test('test case that should throw a NotImplementedError', () => {
        const molecularProfile = {
            id: 1,
            parsedName: [
                { entrezId: 9 }, { id: 1 }, { text: 'AND' }, { text: 'NOT' }, { text: '(' },
                { entrezId: 9 }, { id: 2 }, { text: 'OR' }, { entrezId: 9 }, { id: 3 }, { text: ')' },
            ],
        };
        expect(() => MolecularProfile(molecularProfile).process()).toThrow(
            `unable to process molecular profile with NOT operator (${molecularProfile.id || ''})`,
        );
    });
});
