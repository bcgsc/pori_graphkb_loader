

const {
    convertDeprecatedSyntax
} = require('../src/ipr');

describe('convertDeprecatedSyntax', () => {
    test('SV_e.fusion(FGFR2,?)(?,?)', () => {
        const result = convertDeprecatedSyntax('SV_e.fusion(FGFR2,?)(?,?)');
        expect(result).toEqual({type: 'fusion', reference1: 'fgfr2'});
    });
    test('SV_e.fusion(?,RET)(?,?)', () => {
        const result = convertDeprecatedSyntax('SV_e.fusion(?,RET)(?,?)');
        expect(result).toEqual({type: 'fusion', reference1: 'ret'});
    });
    test('fusion with specific exons', () => {
        const result = convertDeprecatedSyntax('(CLTC,ALK):fusion(e.31,e.20)');
        expect(result).toEqual({
            positional: '(CLTC,ALK):fusion(e.31,e.20)'
        });
    });
    test('CNV_ERBB2_amplification_na', () => {
        const result = convertDeprecatedSyntax('CNV_ERBB2_amplification_na');
        expect(result).toEqual({type: 'amplification', reference1: 'erbb2'});
    });
    test('MUT_ARAF:p.S214A', () => {
        const result = convertDeprecatedSyntax('MUT_ARAF:p.S214A');
        expect(result).toEqual({positional: 'ARAF:p.S214A'});
    });
    test('MUT_ERBB2_any', () => {
        const result = convertDeprecatedSyntax('MUT_ERBB2_any');
        expect(result).toEqual({type: 'mutation', reference1: 'erbb2'});
    });
    test('MUT_MET:p.Xnspl', () => {
        const result = convertDeprecatedSyntax('MUT_MET:p.Xnspl');
        expect(result).toEqual({reference1: 'met', type: 'splice-site'});
    });
    test('NTRK', () => {
        const result = convertDeprecatedSyntax('NTRK');
        expect(result).toEqual({name: 'NTRK', isFeature: true});
    });
    test('CNV_RAD54L_copy loss_homozygous', () => {
        const result = convertDeprecatedSyntax('CNV_RAD54L_copy loss_homozygous');
        expect(result).toEqual({reference1: 'rad54l', type: 'copy loss', zygosity: 'homozygous'});
    });
});
