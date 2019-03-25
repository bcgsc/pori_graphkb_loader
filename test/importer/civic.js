const {
    expect
} = require('chai');

const kbParser = require('@bcgsc/knowledgebase-parser');


const {getVariantName} = require('./../../importer/civic');


describe('civic', () => {
    describe('getVariantName', () => {
        it('parses exon mutations', () => {
            const parsedName = getVariantName({name: 'EXON 12 MUTATION'});
            expect(parsedName).to.eql('e.12mut');
            // external parser should not throw error
            expect(() => {
                kbParser.variant.parse(parsedName, false).toJSON();
            }).to.not.throw;
        });
        it.skip('handles gene name included', () => {
            // jak2 f694l
        });
        it.skip('handles cds notation in parentheses', () => {
            // s65l (c.194c>t)
            // E70K (c.208G>A)
            // r167p (c.500g>c)
        });
    });
});
