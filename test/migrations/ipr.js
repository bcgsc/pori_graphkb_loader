

const {expect} = require('chai');
const {
    convertDeprecatedSyntax
} = require('./../../migrations/ipr_v0/migrate');

describe('convertDeprecatedSyntax', () => {
    it('SV_e.fusion(FGFR2,?)(?,?)', () => {
        const result = convertDeprecatedSyntax('SV_e.fusion(FGFR2,?)(?,?)');
        expect(result).to.eql({type: 'fusion', reference1: 'fgfr2'});
    });
    it('SV_e.fusion(?,RET)(?,?)', () => {
        const result = convertDeprecatedSyntax('SV_e.fusion(?,RET)(?,?)');
        expect(result).to.eql({type: 'fusion', reference1: 'ret'});
    });
    it('CNV_ERBB2_amplification_na', () => {
        const result = convertDeprecatedSyntax('CNV_ERBB2_amplification_na');
        expect(result).to.eql({type: 'amplification', reference1: 'erbb2'});
    });
    it('MUT_ARAF:p.S214A', () => {
        const result = convertDeprecatedSyntax('MUT_ARAF:p.S214A');
        expect(result).to.eql({positional: 'p.S214A', reference1: 'araf'});
    });
    it('MUT_ERBB2_any', () => {
        const result = convertDeprecatedSyntax('MUT_ERBB2_any');
        expect(result).to.eql({type: 'mutation', reference1: 'erbb2'});
    });
    it('MUT_MET:p.Xnspl', () => {
        const result = convertDeprecatedSyntax('MUT_MET:p.Xnspl');
        expect(result).to.eql({reference1: 'met', type: 'splice-site'});
    });
    it('NTRK', () => {
        const result = convertDeprecatedSyntax('NTRK');
        expect(result).to.eql({name: 'NTRK', isFeature: true});
    });
    it('CNV_RAD54L_copy loss_homozygous', () => {
        const result = convertDeprecatedSyntax('CNV_RAD54L_copy loss_homozygous');
        expect(result).to.eql({reference1: 'rad54l', type: 'copy loss', zygosity: 'homozygous'});
    });
});
