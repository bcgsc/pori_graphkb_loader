const path = require('path');

const {
    convertNulls,
    orderPreferredOntologyTerms,
    loadDelimToJson,
    loadXmlToJson
} = require('./../src/util');

describe('util', () => {
    describe('convertNulls', () => {
        test('returns \'null\'', () => {
            const result = convertNulls({thing: null, other: 1});
            expect(result).toEqual({thing: 'null', other: 1});
        });
        test('convert nested values', () => {
            const result = convertNulls({thing: {other: null}});
            expect(result).toEqual({thing: {other: 'null'}});
        });
    });
    describe('orderPreferredOntologyTerms', () => {
        test('prefer non-deprecated', () => {
            expect(orderPreferredOntologyTerms(
                {deprecated: true}, {}
            )).toBe(1);
            expect(orderPreferredOntologyTerms(
                {deprecated: false}, {deprecated: true}
            )).toBe(-1);
        });
        test('prefer newer version of same record', () => {
            expect(orderPreferredOntologyTerms(
                {sourceIdVersion: '2019-10-08'}, {sourceIdVersion: '2019-09-08'}
            )).toBe(1);
            expect(orderPreferredOntologyTerms(
                {sourceIdVersion: '2019-10-08'}, {sourceIdVersion: '2019-11-08'}
            )).toBe(-1);
        });
        test('prefer records without dependencies', () => {
            expect(orderPreferredOntologyTerms(
                {dependency: true}, {}
            )).toBe(1);
            expect(orderPreferredOntologyTerms(
                {dependency: null}, {dependency: true}
            )).toBe(-1);
        });
    });
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
});
