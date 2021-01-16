

const {
    convertDeprecatedSyntax,
} = require('../src/knowledgebases/iprkb');

describe('convertDeprecatedSyntax', () => {
    test('SV_e.fusion(FGFR2,?)(?,?)', () => {
        const result = convertDeprecatedSyntax('SV_e.fusion(FGFR2,?)(?,?)');
        expect(result).toEqual({ reference1: 'fgfr2', type: 'fusion' });
    });

    test('SV_e.fusion(?,RET)(?,?)', () => {
        const result = convertDeprecatedSyntax('SV_e.fusion(?,RET)(?,?)');
        expect(result).toEqual({ reference1: 'ret', type: 'fusion' });
    });

    test('KIT:e.9?', () => {
        const result = convertDeprecatedSyntax('KIT:e.9?');
        const parsed = {
            break1Repr: 'e.9',
            break1Start: {
                '@class': 'ExonicPosition',
                pos: 9,
            },
            reference1: 'KIT',
            type: 'mutation',
        };
        expect(result).toEqual({ positional: parsed });
    });

    test('CNV_12:y.q13_q14copygain_na', () => {
        const result = convertDeprecatedSyntax('CNV_12:y.q13_q14copygain_na');
        const parsed = {
            break1Repr: 'y.q13',
            break1Start: {
                '@class': 'CytobandPosition',
                arm: 'q',
                majorBand: 13,
            },
            break2Repr: 'y.q14',
            break2Start: {
                '@class': 'CytobandPosition',
                arm: 'q',
                majorBand: 14,
            },
            reference1: '12',
            type: 'copy gain',
        };
        expect(result).toEqual({
            positional: parsed,
        });
    });

    test('fusion with specific exons', () => {
        const result = convertDeprecatedSyntax('(CLTC,ALK):fusion(e.31,e.20)');
        const parsed = {
            break1Repr: 'e.31',
            break1Start: {
                '@class': 'ExonicPosition',
                pos: 31,
            },
            break2Repr: 'e.20',
            break2Start: {
                '@class': 'ExonicPosition',
                pos: 20,
            },
            reference1: 'CLTC',
            reference2: 'ALK',
            type: 'fusion',
        };
        expect(result).toEqual({
            positional: parsed,
        });
    });

    test('CNV_ERBB2_amplification_na', () => {
        const result = convertDeprecatedSyntax('CNV_ERBB2_amplification_na');
        expect(result).toEqual({ reference1: 'erbb2', type: 'amplification' });
    });

    test('MUT_ARAF:p.S214A', () => {
        const result = convertDeprecatedSyntax('MUT_ARAF:p.S214A');
        const parsed = {
            break1Repr: 'p.S214',
            break1Start: {
                '@class': 'ProteinPosition',
                pos: 214,
                refAA: 'S',
            },
            refSeq: 'S',
            reference1: 'ARAF',
            type: 'missense mutation',
            untemplatedSeq: 'A',
            untemplatedSeqSize: 1,
        };
        expect(result).toEqual({ positional: parsed });
    });

    test('MUT_ERBB2_any', () => {
        const result = convertDeprecatedSyntax('MUT_ERBB2_any');
        expect(result).toEqual({ reference1: 'erbb2', type: 'mutation' });
    });

    test('MUT_MET:p.Xnspl', () => {
        const result = convertDeprecatedSyntax('MUT_MET:p.Xnspl');
        expect(result).toEqual({ reference1: 'met', type: 'splice-site' });
    });

    test('NTRK', () => {
        const result = convertDeprecatedSyntax('NTRK');
        expect(result).toEqual({ isFeature: true, name: 'NTRK' });
    });

    test('CNV_RAD54L_copy loss_homozygous', () => {
        const result = convertDeprecatedSyntax('CNV_RAD54L_copy loss_homozygous');
        expect(result).toEqual({ reference1: 'rad54l', type: 'deep deletion', zygosity: 'homozygous' });
    });
});
