const {
    expect
} = require('chai');

const {parseVariantName} = require('../src/oncokb');


describe('oncokb', () => {
    describe('parseVariantName', () => {
        it('parses exon mutations');
        it('kinase domain duplication');
        it('amplification');
        it('wildtype');
        it('adds p prefix (T790M)');
        it('fusion', () => {
            const parsed = parseVariantName('BCR-ABL1 Fusion');
            expect(parsed).to.eql({
                type: 'fusion',
                reference2: 'abl1'
            });
        });
        it('fusion with gene given', () => {
            const parsed = parseVariantName('BCR-ABL1 Fusion', {reference1: 'bcr'});
            expect(parsed).to.eql({
                type: 'fusion',
                reference2: 'abl1'
            });
        });
        it('fusion with gene given', () => {
            const parsed = parseVariantName('BCR-ABL1 Fusion', {reference1: 'ABL1'});
            expect(parsed).to.eql({
                type: 'fusion',
                reference1: 'bcr',
                reference2: 'abl1'
            });
        });
    });
});
