const { MolecularProfile } = require('../../src/civic/profile');


describe('MolecularProfile._combine()', () => {
    test.each([
        [{ arr1: [[]], arr2: [[]] }, [[]]],
        [{ arr1: [['A']], arr2: [[]] }, [['A']]],
        [{ arr1: [[]], arr2: [['B']] }, [['B']]],
        [{ arr1: [['A']], arr2: [['B']] }, [['A', 'B']]],
        [{ arr1: [['A']], arr2: [['B'], ['C']] }, [['A', 'B'], ['A', 'C']]],
        [{ arr1: [['A'], ['B']], arr2: [['C'], ['D']] }, [['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D']]],
    ])(
        'combine some conditions', ({ arr1, arr2 }, expected) => {
            expect(MolecularProfile()._combine({ arr1, arr2 })).toEqual(expected);
        },
    );
});

describe('MolecularProfile._compile()', () => {
    test.each([
        [[['A', 'B']], 'AND', [['C', 'D']], [['A', 'B', 'C', 'D']]],
        [[['A', 'B']], 'AND', [['C', 'D'], ['E', 'F']], [['A', 'B', 'C', 'D'], ['A', 'B', 'E', 'F']]],
        [[['A', 'B'], ['C', 'D']], 'AND', [['E', 'F']], [['A', 'B', 'E', 'F'], ['C', 'D', 'E', 'F']]],
        [[['A', 'B']], 'OR', [['C', 'D']], [['A', 'B'], ['C', 'D']]],
        [[['A', 'B']], 'OR', [['C', 'D'], ['E', 'F']], [['A', 'B'], ['C', 'D'], ['E', 'F']]],
        [[['A', 'B'], ['C', 'D']], 'OR', [['E', 'F']], [['A', 'B'], ['C', 'D'], ['E', 'F']]],
    ])(
        'compile somme expressions', (arr, op, part, expected) => {
            expect(MolecularProfile()._compile({ arr, op, part })).toEqual(expected);
        },
    );
});

describe('MolecularProfile._disambiguate()', () => {
    test('disambiguate conditions in AND statements', () => {
        const Mp = MolecularProfile();
        Mp.conditions = [
            [{ id: 8, name: 'X123M/N' }, { id: 9, name: 'X456O/P' }, { id: 10, name: 'X456Q' }],
        ];
        expect(Mp._disambiguate().conditions).toEqual(
            [
                [{ id: 8, name: 'X123M' }, { id: 9, name: 'X456O' }, { id: 10, name: 'X456Q' }],
                [{ id: 8, name: 'X123M' }, { id: 9, name: 'X456P' }, { id: 10, name: 'X456Q' }],
                [{ id: 8, name: 'X123N' }, { id: 9, name: 'X456O' }, { id: 10, name: 'X456Q' }],
                [{ id: 8, name: 'X123N' }, { id: 9, name: 'X456P' }, { id: 10, name: 'X456Q' }],
            ],
        );
    });

    test('disambiguate conditions in OR statements', () => {
        const Mp = MolecularProfile();
        Mp.conditions = [
            [{ id: 8, name: 'X123M/N' }],
            [{ id: 9, name: 'X456O/P' }],
        ];
        expect(Mp._disambiguate().conditions).toEqual(
            [
                [{ id: 8, name: 'X123M' }],
                [{ id: 8, name: 'X123N' }],
                [{ id: 9, name: 'X456O' }],
                [{ id: 9, name: 'X456P' }],
            ],
        );
    });
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
            { __typename: 'Feature' }, { id: 1 }, { text: 'AND' }, { text: 'NOT' }, { text: '(' },
            { __typename: 'Feature' }, { id: 2 }, { text: 'OR' }, { __typename: 'Feature' }, { id: 3 }, { text: ')' },
        ])).toBe(true);
        expect(MolecularProfile()._not([
            { __typename: 'Feature' }, { id: 1 }, { text: 'AND' }, { text: '(' }, { __typename: 'Feature' },
            { id: 2 }, { text: 'OR' }, { __typename: 'Feature' }, { id: 3 }, { text: ')' },
        ])).toBe(false);
    });
});

describe('MolecularProfile._parse()', () => {
    test.each([
        [
            [{ id: 1 }, { text: 'AND' }, { id: 2 }],
            [[1, 2]],
        ],
        [
            [{ id: 1 }, { text: 'OR' }, { id: 2 }],
            [[1], [2]],
        ],
        [
            [{ id: 1 }, { text: 'AND' }, { text: '(' }, { id: 2 }, { text: 'OR' }, { id: 3 }, { text: ')' }],
            [[1, 2], [1, 3]],
        ],
        [
            [{ id: 1 }, { text: 'OR' }, { text: '(' }, { id: 2 }, { text: 'AND' }, { id: 3 }, { text: ')' }],
            [[1], [2, 3]],
        ],
        [
            [
                { text: '(' }, { id: 1 }, { text: 'AND' }, { id: 2 }, { text: ')' },
                { text: 'OR' }, { text: '(' }, { id: 3 }, { text: 'AND' }, { id: 4 }, { text: ')' },
            ],
            [[1, 2], [3, 4]],
        ],
        [
            [
                { text: '(' }, { id: 1 }, { text: 'OR' }, { id: 2 }, { text: ')' },
                { text: 'AND' }, { text: '(' }, { id: 3 }, { text: 'OR' }, { id: 4 }, { text: ')' },
            ],
            [[1, 3], [1, 4], [2, 3], [2, 4]],
        ],
        [
            [
                { id: 1 }, { text: 'AND' }, { text: '(' }, { id: 2 }, { text: 'OR' }, { id: 3 }, { text: ')' },
                { text: 'AND' }, { text: '(' }, { id: 4 }, { text: 'OR' }, { id: 5 }, { text: ')' },
            ],
            [[1, 2, 4], [1, 2, 5], [1, 3, 4], [1, 3, 5]],
        ],
        [
            [
                { id: 1 }, { text: 'OR' }, { text: '(' }, { id: 2 }, { text: 'AND' }, { id: 3 }, { text: ')' },
                { text: 'OR' }, { text: '(' }, { id: 4 }, { text: 'AND' }, { id: 5 }, { text: ')' },
            ],
            [[1], [2, 3], [4, 5]],
        ],
        [
            [
                { id: 1 }, { text: 'AND' }, { text: '(' }, { id: 2 }, { text: 'AND' },
                { text: '(' }, { id: 3 }, { text: 'OR' }, { id: 4 }, { text: ')' }, { text: ')' },
            ],
            [[1, 2, 3], [1, 2, 4]],
        ],
    ])(
        'testing some Molecular Profiles expressions', (block, expected) => {
            expect(MolecularProfile()._parse(block)).toEqual(expected);
        },
    );
});

describe('MolecularProfile._split()', () => {
    test.each([
        ['Q157P/R', [[{ name: 'Q157P' }], [{ name: 'Q157R' }]]],
        ['Q157P', [[{ name: 'Q157P' }]]],
    ])(
        'Split %s into its variations', (name, expected) => {
            expect(MolecularProfile()._split({ name })).toEqual(expected);
        },
    );
});

describe('MolecularProfile._variants()', () => {
    test('variants ids replaced by objects', () => {
        const Mp = MolecularProfile({
            variants: [
                { id: 1, name: 'a1' },
                { id: 2, name: 'a2' },
                { id: 3, name: 'a3' },
            ],
        });
        Mp.conditions = [[1, 2], [1, 3]];
        expect(Mp._variants().conditions).toEqual([
            [{ id: 1, name: 'a1' }, { id: 2, name: 'a2' }],
            [{ id: 1, name: 'a1' }, { id: 3, name: 'a3' }],
        ]);
    });

    test('tests cases that should throw an Error', () => {
        const molecularProfile = {
            id: 123,
            variants: [
                { id: 1, name: 'a1' },
                { id: 2, name: 'a2' },
            ],
        };
        const Mp = MolecularProfile(molecularProfile);
        Mp.conditions = [[1, 2], [1, 3]];
        expect(() => Mp._variants()).toThrow(
            `unable to process molecular profile with missing or misformatted variants (${molecularProfile.id || ''})`,
        );
    });
});

describe('MolecularProfile.process()', () => {
    test('gene infos not interfering', () => {
        expect(MolecularProfile({
            parsedName: [{ __typename: 'Feature' }, { id: 1 }],
            variants: [{ id: 1, name: 'a1' }],
        }).process().conditions).toEqual([[{ id: 1, name: 'a1' }]]);
    });

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
                { __typename: 'Feature' }, { id: 1 }, { text: 'AND' }, { text: 'NOT' }, { text: '(' },
                { __typename: 'Feature' }, { id: 2 }, { text: 'OR' }, { __typename: 'Feature' }, { id: 3 }, { text: ')' },
            ],
        };
        expect(() => MolecularProfile(molecularProfile).process()).toThrow(
            `unable to process molecular profile with NOT operator (${molecularProfile.id || ''})`,
        );
    });
});
