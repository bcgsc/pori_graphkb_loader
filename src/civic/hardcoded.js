/* eslint-disable quote-props */
const discardedEvidenceItems = new Set([
    '860', // ...cytoplasmic localization of a protein
    '867', // ...nuclear translocation
    '898', // ...exon expression
]);

const variants = {
    // ERBB2 P780INS Inframe Insertion
    '41': [
        {
            positional: true,
            reference1: { name: 'erbb2', sourceId: '2064' },
            variant: 'p.?779_?780ins',
        },
    ],
    // reg_e@[IGH]::BCL2
    '151': [
        {
            reference1: { name: 'igh', sourceId: '3492' },
            reference2: { name: 'bcl2', sourceId: '596' },
            type: 'fusion',
        },

    ],
    // TYMS 5' TANDEM REPEAT
    '265': [
        {
            reference1: { name: 'tyms', sourceId: '7298' },
            type: 'tandem duplication',
        },
    ],
    // CDKN2A p16 Expression
    '272': [
        {
            reference1: { name: 'cdkn2a', sourceId: '1029' },
            type: 'expression',
        },
    ],
    // MET Exon 14 Skipping Mutation
    '324': [
        {
            positional: true,
            reference1: { name: 'met', sourceId: '4233' },
            variant: 'e.14del',
        },
    ],
    // EGFR VIII Disruptive Inframe Deletion
    '312': [
        {
            reference1: { name: 'egfr', sourceId: '1956' },
            type: 'in-frame deletion',
        },
    ],
    // EGFRVIII ************* Same as 312 ?? *************
    '1516': [
        // {
        //     positional: true,
        //     reference1: { name: 'egfr', sourceId: '1956' },
        //     variant: 'e.2_7del',
        // },
        {
            reference1: { name: 'egfr', sourceId: '1956' },
            type: 'in-frame deletion',
        },
    ],
    // VEGFA Decreased Peri-therapeutic Expression
    '334': [
        {
            reference1: { name: 'vegfa', sourceId: '7422' },
            type: 'reduced expression',
        },
    ],
    // AR V7 EXPRESSION
    '362': [
        {
            positional: true,
            reference1: { name: 'ar', sourceId: '367' },
            variant: 'e.4_8delins',
        },
    ],
};

module.exports = {
    discardedEvidenceItems,
    variants,
};
