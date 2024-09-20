/* eslint-disable jest/no-disabled-tests */
const {
    contentMatching,
    isMatching,
    needsUpdate,
} = require('../../src/civic/statement');


// Generic content
const content = {
    conditions: ['#123:1', '#123:2'], // conditions NEEDS to be already sorted in ascending order
    description: 'test',
    evidence: ['#123:1'],
    evidenceLevel: ['#123:1'],
    relevance: '#123:1',
    reviewStatus: 'not required',
    source: '#123:1',
    sourceId: '9999',
    subject: '#123:1',
};

// Combination of matching and not matching content
const allFromCivic = [
    { ...content, subject: '#888:0' }, // matching with allFromGkb[3]
    { ...content, subject: '#888:1' }, // matching with allFromGkb[1]
    { ...content, subject: '#888:2' }, // not matching
];
const allFromGkb = [
    { ...content, '@rid': '#999:0', subject: '#888:3' }, // not matching
    { ...content, '@rid': '#999:1', subject: '#888:1' }, // matching with allFromCivic[1]
    { ...content, '@rid': '#999:2', subject: '#888:4' }, // not matching
    { ...content, '@rid': '#999:3', subject: '#888:0' }, // matching with allFromCivic[0]
];

describe('needsUpdate', () => {
    // No need to update
    test('identical content', () => {
        expect(needsUpdate({
            fromCivic: content,
            fromGkb: content,
        })).toBe(false);
    });

    test('discarding gkb rid', () => {
        expect(needsUpdate({
            fromCivic: content,
            fromGkb: { ...content, '@rid': '#123:1' },
        })).toBe(false);
    });

    // Need to update
    test('any difference', () => {
        expect(needsUpdate({
            fromCivic: content,
            fromGkb: { ...content, description: '' },
        })).toBe(true);
    });
});

describe('isMatching', () => {
    // No matching
    test('difference on conditions', () => {
        expect(isMatching({
            fromCivic: content,
            fromGkb: { ...content, conditions: ['#123:1', '#123:3'] },
        })).toBe(false);
    });

    test('difference on subject', () => {
        expect(isMatching({
            fromCivic: content,
            fromGkb: { ...content, subject: '#123:2' },
        })).toBe(false);
    });

    // Matching
    test('difference on conditions while matching only on subject', () => {
        expect(isMatching({
            fromCivic: content,
            fromGkb: { ...content, conditions: ['#123:1', '#123:3'] },
            p: ['subject'],
        })).toBe(true);
    });

    // Matching on subject alone
    test('any other difference', () => {
        expect(isMatching({
            fromCivic: content,
            fromGkb: { ...content, description: '' },
        })).toBe(true);
    });
});

describe('contentMatching', () => {
    test('matching only on conditions and subject', () => {
        const records = contentMatching({
            allFromCivic,
            allFromGkb,
            matchingOnSubjectAlone: false,
        });

        // matching content
        expect(records.toUpdate.length).toBe(2);

        // allFromGkb with no matches
        expect(records.toDelete.length).toBe(2);

        // allFromCivic with no matches
        expect(records.toCreate.length).toBe(1);

        // matching content
        expect(records.toUpdate[0]).toEqual({
            fromCivic: allFromCivic[0],
            fromGkb: allFromGkb[3],
        });
        expect(records.toUpdate[1]).toEqual({
            fromCivic: allFromCivic[1],
            fromGkb: allFromGkb[1],
        });

        // allFromGkb with no matches
        expect(records.toDelete[0]).toEqual(allFromGkb[0]);
        expect(records.toDelete[1]).toEqual(allFromGkb[2]);

        // allFromCivic with no matches
        expect(records.toCreate[0]).toEqual(allFromCivic[2]);
    });

    test('matching also on subject alone, without artificial matching', () => {
        const records = contentMatching({
            allFromCivic: [
                { ...content, conditions: ['#777:77'], subject: '#777:1' },
                { ...content, conditions: ['#777:77'], subject: '#777:2' },
            ],
            allFromGkb: [
                { ...content, conditions: ['#888:88'], subject: '#777:1' },
                { ...content, conditions: ['#888:88'], subject: '#888:2' },
            ],
            matchingWithoutComparing: false,
        });

        // matching content
        expect(records.toUpdate.length).toBe(1);

        // allFromGkb with no matches
        expect(records.toDelete.length).toBe(1);

        // allFromCivic with no matches
        expect(records.toCreate.length).toBe(1);
    });

    test('matching until artificial matching', () => {
        const records = contentMatching({
            allFromCivic,
            allFromGkb,
        });

        // matching content
        expect(records.toUpdate.length).toBe(3);

        // allFromGkb with no matches
        expect(records.toDelete.length).toBe(1);

        // allFromCivic with no matches
        expect(records.toCreate.length).toBe(0);
    });
});
