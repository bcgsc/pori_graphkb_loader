const { preprocessVariants } = require('../src/cancergenomeinterpreter');

describe('preprcessVariants', () => {
    test.todo('mutations in an exon range');

    test('events in different genes', () => {
        expect(preprocessVariants({ biomarker: 'PTEN deletion + BRAF oncogenic mutation' }))
            .toEqual([[
                { gene: 'PTEN', isCat: true, type: 'deletion' },
                { gene: 'BRAF', isCat: true, type: 'oncogenic mutation' },
            ]]);
    });

    test('gene fusion', () => {
        expect(preprocessVariants({ biomarker: 'RET-TPCN1 fusion' })).toEqual([[
            {
                gene: 'RET', gene2: 'TPCN1', isCat: true, type: 'fusion',
            },
        ]]);
    });

    test('one-gene fusion', () => {
        expect(preprocessVariants({ biomarker: 'BRAF fusion' })).toEqual([[
            { gene: 'BRAF', isCat: true, type: 'fusion' },
        ]]);
    });

    test('mutation in a list of exons', () => {
        expect(preprocessVariants({ biomarker: 'KIT mutation in exon 9,11 or 17' })).toEqual([
            [{ exonic: 'e.9mut', gene: 'KIT' }],
            [{ exonic: 'e.11mut', gene: 'KIT' }],
            [{ exonic: 'e.17mut', gene: 'KIT' }],
        ]);
    });

    test('exon insertion', () => {
        expect(preprocessVariants({ biomarker: 'EGFR exon 19 insertions' })).toEqual([[
            { exonic: 'e.19ins', gene: 'EGFR' },
        ]]);
    });

    test('single exon mutation', () => {
        expect(preprocessVariants({ biomarker: 'KIT mutation in exon 11' })).toEqual([[
            { exonic: 'e.11mut', gene: 'KIT' },
        ]]);
    });

    test('protein variant + category mutation', () => {
        expect(preprocessVariants({ biomarker: 'IL7R (S185C) + SH2B3 deletion' })).toEqual([[
            { gene: 'IL7R', protein: 'IL7R:p.S185C' },
            { gene: 'SH2B3', isCat: true, type: 'deletion' },
        ]]);
    });

    test('list of small mutations', () => {
        expect(preprocessVariants({ biomarker: 'EGFR (L858R,L861Q,G719A)' }))
            .toEqual([
                [{ gene: 'EGFR', protein: 'EGFR:p.L858R' }],
                [{ gene: 'EGFR', protein: 'EGFR:p.L861Q' }],
                [{ gene: 'EGFR', protein: 'EGFR:p.G719A' }],
            ]);
    });

    test('single protein change', () => {
        expect(preprocessVariants({ biomarker: 'EGFR (T790M)' }))
            .toEqual([[{ gene: 'EGFR', protein: 'EGFR:p.T790M' }]]);
    });

    test('single category variant', () => {
        expect(preprocessVariants({ biomarker: 'PIK3CA oncogenic mutation' }))
            .toEqual([[{ gene: 'PIK3CA', isCat: true, type: 'oncogenic mutation' }]]);

        expect(preprocessVariants({ biomarker: 'PTEN deletion' }))
            .toEqual([[{ gene: 'PTEN', isCat: true, type: 'deletion' }]]);

        expect(preprocessVariants({ biomarker: 'EGFR amplification' }))
            .toEqual([[{ gene: 'EGFR', isCat: true, type: 'amplification' }]]);
    });

    test('in-frame deletion', () => {
        expect(preprocessVariants({ biomarker: 'BRAF inframe deletion (L485)' })).toEqual([[
            { gene: 'BRAF', protein: 'BRAF:p.L485del' },
        ]]);
    });

    test.skip('complex OR/AND combination', () => {
        // TODO: confirm this is protein notation?
        expect(preprocessVariants({ biomarker: 'IL7R inframe insertion (237-255),inframe deletion (237-255) + SH2B3 deletion' }))
            .toEqual([
                [
                    { gene: 'IL7R', protein: 'IL7R:p.(?237_?255)_(?237_?255)ins' },
                    { gene: 'SH2B3', isCat: true, type: 'deletion' },
                ],
                [
                    { gene: 'IL7R', protein: 'IL7R:p.(?237_?255)_(?237_?255)del' },
                    { gene: 'SH2B3', isCat: true, type: 'deletion' },
                ],
            ]);
    });
});
