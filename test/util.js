const {expect} = require('chai');
const path = require('path');

const {
    convertNulls,
    orderPreferredOntologyTerms,
    loadDelimToJson,
    loadXmlToJson
} = require('./../src/util');

describe('util', () => {
    describe('convertNulls', () => {
        it('returns \'null\'', () => {
            const result = convertNulls({thing: null, other: 1});
            expect(result).to.eql({thing: 'null', other: 1});
        });
        it('convert nested values', () => {
            const result = convertNulls({thing: {other: null}});
            expect(result).to.eql({thing: {other: 'null'}});
        });
    });
    describe('orderPreferredOntologyTerms', () => {
        it('prefer non-deprecated', () => {
            expect(orderPreferredOntologyTerms(
                {deprecated: true}, {}
            )).to.equal(1);
            expect(orderPreferredOntologyTerms(
                {deprecated: false}, {deprecated: true}
            )).to.equal(-1);
        });
        it('prefer newer version of same record', () => {
            expect(orderPreferredOntologyTerms(
                {sourceIdVersion: '2019-10-08'}, {sourceIdVersion: '2019-09-08'}
            )).to.equal(1);
            expect(orderPreferredOntologyTerms(
                {sourceIdVersion: '2019-10-08'}, {sourceIdVersion: '2019-11-08'}
            )).to.equal(-1);
        });
        it('prefer records without dependencies', () => {
            expect(orderPreferredOntologyTerms(
                {dependency: true}, {}
            )).to.equal(1);
            expect(orderPreferredOntologyTerms(
                {dependency: null}, {dependency: true}
            )).to.equal(-1);
        });
    });
    it('preferredSources');
    it('convertOwlGraphToJson');
    it('loadDelimToJson', async () => {
        const filename = path.join(__dirname, 'data/UNII_Records_25Oct2018_sample.txt');
        const result = await loadDelimToJson(filename, '\t');
        expect(result.length).to.equal(99);
    });
    it('loadXmlToJson', async () => {
        const filename = path.join(__dirname, 'data/drugbank_sample.xml');
        const result = await loadXmlToJson(filename);
        expect(result).to.have.property('drugbank');
        expect(result.drugbank).to.have.property('drug');
        expect(result.drugbank.drug.length).to.equal(1);
    });
});
