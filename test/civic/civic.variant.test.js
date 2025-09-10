/* eslint-disable jest/no-disabled-tests */
const {
    normalizeFactorVariant,
    normalizeFusionVariant,
    normalizeGeneVariant,
    normalizeVariant,
    NotImplementedError,
    uploadInferences,
    uploadReferences,
    uploadVariant,
    uploadVariants,
} = require('../../src/civic/variant');


/*
    SYNCHRONOUS TESTS
*/

const civicVariantRecordsFactor = [
    {
        feature: { featureInstance: { __typename: 'Factor', name: 'TMB' } },
        id: 123,
        name: 'abc',
    },
];
const civicVariantRecordsFusion = [
    {
        feature: {
            featureInstance: {
                __typename: 'Fusion',
                fivePrimeGene: {
                    entrezId: 673,
                    id: 5,
                    name: 'BRAF',
                },
            },
        },
        id: 123,
    },
    {
        feature: {
            featureInstance: {
                __typename: 'Fusion',
                threePrimeGene: {
                    entrezId: 238,
                    id: 1,
                    name: 'ALK',
                },
            },
        },
        id: 123,
    },
    {
        feature: {
            featureInstance: {
                __typename: 'Fusion',
                fivePrimeGene: {
                    entrezId: 673,
                    id: 5,
                    name: 'BRAF',
                },
                threePrimeGene: {
                    entrezId: 238,
                    id: 1,
                    name: 'ALK',
                },
            },
        },
        id: 123,
    },
];
const civicVariantRecordsGene = [
    {
        feature: { featureInstance: { __typename: 'Gene', entrezId: 672, name: 'BRCA1' } },
        name: 'Mutation',
    },
];


describe('normalizeFactorVariant', () => {
    test('testnormalizeFactorVariant', () => {
        const normalizedVariants = normalizeFactorVariant(civicVariantRecordsFactor[0]);
        expect(normalizedVariants.length).toEqual(1);
        expect(normalizedVariants[0]).toEqual({
            reference1: {
                class: 'Signature',
                name: 'high mutation burden',
            },
            type: 'high signature',
        });
    });
});

describe('normalizeFusionVariant', () => {
    test('testnormalizeFusionVariantFivePrimeGeneOnly', () => {
        const normalizedVariants = normalizeFusionVariant(civicVariantRecordsFusion[0]);
        expect(normalizedVariants.length).toEqual(1);
        expect(normalizedVariants[0]).toEqual({
            reference1: { name: 'braf', sourceId: '673' },
            type: 'fusion',
        });
    });

    test('testnormalizeFusionVariantThreePrimeGeneOnly', () => {
        const normalizedVariants = normalizeFusionVariant(civicVariantRecordsFusion[1]);
        expect(normalizedVariants.length).toEqual(1);
        expect(normalizedVariants[0]).toEqual({
            reference1: { name: 'alk', sourceId: '238' },
            type: 'fusion',
        });
    });

    test('testnormalizeFusionVariantBothGenes', () => {
        const normalizedVariants = normalizeFusionVariant(civicVariantRecordsFusion[2]);
        expect(normalizedVariants.length).toEqual(1);
        expect(normalizedVariants[0]).toEqual({
            reference1: { name: 'braf', sourceId: '673' },
            reference2: { name: 'alk', sourceId: '238' },
            type: 'fusion',
        });
    });
});

describe('normalizeGeneVariant', () => {
    test('exon mutation', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'gene',
            name: 'EXON 12 MUTATION',
        });
        expect(variants).toEqual([{
            positional: true,
            reference1: {
                name: 'gene',
                sourceId: '1',
            },
            variant: 'e.12mut',
        }]);
    });

    test('deleterious mutation', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'gene',
            name: 'DELETRIOUS MUTATION',
        });
        expect(variants).toEqual([{
            reference1: { name: 'gene', sourceId: '1' },
            type: 'deletrious mutation',
        }]);
    });

    test('phosphorylation variant', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'gene',
            name: 'Y1234 phosphorylation',
        });
        expect(variants).toEqual([{
            positional: true,
            reference1: { name: 'gene', sourceId: '1' },
            variant: 'p.y1234phos',
        }]);
    });

    test('single gene fusion with missense mutation', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'ALK FUSION G1202R',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'alk', sourceId: '1' },
                type: 'fusion',
            },
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.g1202r',
            },
        ]);
    });

    test('multi-gene fusion with 2 resistance mutations (dash notation)', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'alk',
            name: 'EML4-ALK G1202R-L1198F',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'eml4' },
                reference2: { name: 'alk', sourceId: '1' },
                type: 'fusion',
            },
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.g1202r',
            },
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.l1198f',
            },
        ]);
    });

    test('multi-gene fusion', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'NRG1',
            name: 'CD74-NRG1',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'cd74' },
                reference2: { name: 'nrg1', sourceId: '1' },
                type: 'fusion',
            },
        ]);
    });

    test('fusion with multiple variants', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'LMNA-NTRK1 G595R AND G667C',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'lmna' },
                reference2: { name: 'ntrk1', sourceId: '1' },
                type: 'fusion',
            },
            {
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.g595r',
            },
            {
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.g667c',
            },
        ]);
    });

    test('fusion with multiple variants (colon sep)', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'LMNA::NTRK1 G595R AND G667C',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'lmna' },
                reference2: { name: 'ntrk1', sourceId: '1' },
                type: 'fusion',
            },
            {
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.g595r',
            },
            {
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.g667c',
            },
        ]);
    });

    test('corrects deprecated indel syntax', () => {
        // S111C (c.330CA>TT)
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'S111C (c.330CA>TT)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [{
                    positional: true,
                    reference1: { name: 'ntrk1', sourceId: '1' },
                    variant: 'c.330_331delcainstt',
                }],
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.s111c',
            },
        ]);
    });

    test('categorical variant', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'UNDEREXPRESSION',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'ntrk1', sourceId: '1' },
                type: 'underexpression',
            },
        ]);
    });

    test('protein truncation with cds notation', () => {
        // e46* (c.136g>t)
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'E46* (c.136G>T)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.136g>t',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.e46*',
            },
        ]);
    });

    test('categorical variant with spaces', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'DNA BINDING DOMAIN MUTATION',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'ntrk1', sourceId: '1' },
                type: 'dna binding domain mutation',
            },
        ]);
    });

    test('regular missense mutation', () => {
        // R132H
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'R132H',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.r132h',
            },
        ]);
    });

    test('plural for single gene fusion', () => {
        // ALK FUSIONS
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'NRG1',
            name: 'NRG1 fusions',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'nrg1', sourceId: '1' },
                type: 'fusion',
            },
        ]);
    });

    test('fusion with exon positions', () => {
        // EML4-ALK E20;A20
        // ALK FUSIONS
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'EML4-ALK E20;A20',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'eml4' },
                reference2: { name: 'alk', sourceId: '1' },
                variant: 'fusion(e.20,e.20)',
            },
        ]);
    });

    test('fusion with new exon notation', () => {
        // EWSR1-FLI1 e7-e6
        // FLI1 Fusion
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'FLI1',
            name: 'EWSR1-FLI1 e7-e6',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'ewsr1' },
                reference2: { name: 'fli1', sourceId: '1' },
                variant: 'fusion(e.7,e.6)',
            },
        ]);
    });

    test('fusion with reference2 input gene', () => {
        // EML4-ALK E20;A20
        // ALK FUSIONS
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'EML4',
            name: 'EML4-ALK E20;A20',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'eml4', sourceId: '1' },
                reference2: { name: 'alk' },
                variant: 'fusion(e.20,e.20)',
            },
        ]);
    });

    test('abl fusion', () => {
        // BCR-ABL
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'BCR-ABL',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'bcr' },
                reference2: { name: 'abl1', sourceId: '1' },
                type: 'fusion',
            },
        ]);
    });

    test('cds notation', () => {
        // BCR-ABL
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'c.123G>T',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'abl1', sourceId: '1' },
                variant: 'c.123g>t',
            },
        ]);
    });

    test('exon range deletion', () => {
        // BCR-ABL
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'exon 2-3 deletion',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'abl1', sourceId: '1' },
                variant: 'e.2_3del',
            },
        ]);
    });

    test('frameshift with cds', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 't133lfs*26 (c.397dela)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.397dela',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.t133lfs*26',
            },
        ]);
    });

    test('protein indel with cds', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 't133lfs*26 (c.397dela)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.397dela',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.t133lfs*26',
            },
        ]);
    });

    test('simple gene mutation', () => {
        // BCR-ABL
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'ABL1 mutations',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'abl1', sourceId: '1' },
                type: 'mutation',
            },
        ]);
    });

    test('exon plural mutations', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'exon 3 mutations',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'abl1', sourceId: '1' },
                variant: 'e.3mut',
            },
        ]);
    });

    test('mutations', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'mutations',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'abl1', sourceId: '1' },
                type: 'mutation',
            },
        ]);
    });

    test('splice site mutation', () => {
        // F547 SPLICE SITE MUTATION
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'F547 SPLICE SITE MUTATION',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.f547spl',
            },
        ]);
    });

    test('protein deletion with cds deletion sequence', () => {
        // r79_s80del (c.236_241delgcagtc)
        // r82_v84del (c.244_252del)
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'r79_s80del (c.236_241delgcagtc)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.236_241delgcagtc',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.r79_s80del',
            },
        ]);
    });

    test('protein deletion with cds deletion no sequence', () => {
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'r82_v84del (c.244_252del)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.244_252del',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.r82_v84del',
            },
        ]);
    });

    test('protein dup with cds dup', () => {
        // p.s193_c196dupstsc (c.577_588dupagcaccagctgc)
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'p.s193_c196dupstsc (c.577_588dupagcaccagctgc)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.577_588dupagcaccagctgc',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.s193_c196dupstsc',
            },
        ]);
    });

    test('protein with cds notation', () => {
        // A122I (c.364_365GC>AT)
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'A122I (c.364_365GC>AT)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.364_365gc>at',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.a122i',
            },
        ]);
    });

    test('OR-able position no alt seq', () => {
        // G12/G13
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'G12/G13',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.(g12_g13)mut',
            },
        ]);
    });

    test('semi-colon delimited variants', () => {
        // A50A (c.150C>G); Splicing alteration (c.463-1G>T)
        const variants = normalizeGeneVariant({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'A50A (c.150C>G); Splicing alteration (c.463-1G>T)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.150c>g',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.a50a',
            },
            {
                infers: [{
                    reference1: { name: 'alk', sourceId: '1' },
                    type: 'splicing alteration',
                }],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'c.463-1g>t',
            },
        ]);
    });

    test.skip('multiple variants with plus notation', () => {
        // V600E+V600M
        // E2014K + E2419K
    });

    test.skip('missense and amplification', () => {
        // V600E AMPLIFICATION
    });

    test.skip('germline notation', () => {
        // DPYD*2A HOMOZYGOSITY
    });

    test.skip('catalogue variant', () => {
        // RS3910384
    });

    test.skip('duplicate fusion', () => {
        // AGGF1-PDGFRB, AGGF1-PDGFRB C843G
    });

    test.skip('non-specific positional mutaiton', () => {
        // E1813 mutations
    });

    describe('bad notation should return as vocabulary', () => {
        test('ERBB2 G776INSV_G/C', () => {
            const variants = normalizeGeneVariant({
                entrezId: 1,
                entrezName: 'ERBB2',
                name: 'ERBB2 G776INSV_G/C',
            });
            expect(variants).toEqual([{
                reference1: { name: 'erbb2', sourceId: '1' },
                type: 'erbb2 g776insv_g/c',
            }]);
        });

        test('exon1 151nt del; Null (Partial deletion of Exon 1)', () => {
            const variants = normalizeGeneVariant({
                entrezId: 1,
                entrezName: 'ERBB2',
                name: 'exon1 151nt del; Null (Partial deletion of Exon 1)',
            });
            expect(variants).toEqual([{
                reference1: { name: 'erbb2', sourceId: '1' },
                type: 'exon1 151nt del',
            }, {
                reference1: { name: 'erbb2', sourceId: '1' },
                type: 'null (partial deletion of exon 1)',
            }]);
        });
    });
});

describe('normalizeVariant', () => {
    [
        civicVariantRecordsFactor[0],
        civicVariantRecordsFusion[0],
        civicVariantRecordsGene[0],

    ].forEach((record) => {
        test(`testNormalizeVariantFeatureType${record.feature.featureInstance.__typename}`, () => {
            expect(normalizeVariant(record).length).toBe(1);
        });
    });

    test('testNormalizeVariantFeatureTypeNotImplemented', () => {
        expect(() => {
            normalizeVariant(
                { feature: { featureInstance: { __typename: 'Other' } } },
            );
        }).toThrow(NotImplementedError);
    });
});


/*
    ASYNCHRONOUS TESTS
*/

const mockConn = () => ({
    addRecord: jest.fn().mockResolvedValue({ '@rid': '#', reference1: '#' }), // used by Entrez loader
    addSource: jest.fn().mockResolvedValue({ '@rid': '#', reference1: '#' }), // used by Entrez loader
    addVariant: jest.fn().mockResolvedValue({ '@rid': '#123:45' }),
    getUniqueRecordBy: jest.fn().mockResolvedValue({ '@rid': '#678:90', reference1: '#' }),
    getVocabularyTerm: jest.fn().mockResolvedValue({ '@rid': '#' }),
});
const conn = mockConn();


describe.skip('uploadReferences', () => {
    const normalizedVariants = [
        { },
        { reference1: { } },
        { reference1: { class: 'Signature', name: '' } },
        { reference1: { sourceId: '123' } },
        { reference1: { name: 'abc' } },
        { reference1: { sourceId: '123' }, reference2: { sourceId: '456' } },
    ];

    test('testUploadReferencesNoReference1', async () => {
        await expect(
            uploadReferences(conn, normalizedVariants[0]),
        ).rejects.toThrow('reference1 is mandatory on normalizedVariant');
    });

    test('testUploadReferencesNoName', async () => {
        await expect(
            uploadReferences(conn, normalizedVariants[1]),
        ).rejects.toThrow('name property is mandatory on normalizedVariant reference');
    });

    test('testUploadReferencesSignature', async () => {
        const [reference1, reference2] = await uploadReferences(conn, normalizedVariants[2]);
        expect(reference1).toEqual({ '@rid': '#678:90', reference1: '#' });
        expect(reference2).toEqual(undefined);
    });

    test('testUploadReferencesWithSourceId', async () => {
        const [reference1, reference2] = await uploadReferences(conn, normalizedVariants[3]);
        expect(reference1).toEqual({ '@rid': '#678:90', reference1: '#' });
        expect(reference2).toEqual(undefined);
    });

    test('testUploadReferencesWithName', async () => {
        const [reference1, reference2] = await uploadReferences(conn, normalizedVariants[4]);
        expect(reference1).toEqual({ '@rid': '#678:90', reference1: '#' });
        expect(reference2).toEqual(undefined);
    });

    test('testUploadReferencesWithReference2', async () => {
        const [reference1, reference2] = await uploadReferences(conn, normalizedVariants[5]);
        expect(reference1).toEqual({ '@rid': '#678:90', reference1: '#' });
        expect(reference2).toEqual({ '@rid': '#678:90', reference1: '#' });
    });
});

describe.skip('uploadInferences', () => {
    const normalizedVariants = [
        {
            infers: [
                { reference1: { name: '...' }, type: '...' },
                { reference1: { name: '...' }, type: '...' },
            ],
        },
        {
            inferredBy: [
                { reference1: { name: '...' }, type: '...' },
                { reference1: { name: '...' }, type: '...' },
                { reference1: { name: '...' }, type: '...' },
            ],
        },
    ];

    test('testUploadInferencesInfers', async () => {
        const { links, variants } = await uploadInferences(conn, normalizedVariants[0], { '@rid': '#' });
        expect(links.infers.length).toEqual(2);
        expect(variants.inferred.length).toEqual(2);
    });

    test('testUploadInferencesInferredBy', async () => {
        const { links, variants } = await uploadInferences(conn, normalizedVariants[1], { '@rid': '#' });
        expect(links.inferredBy.length).toEqual(3);
        expect(variants.inferring.length).toEqual(3);
    });
});

describe.skip('uploadVariant', () => {
    const normalizedVariants = [
        { type: 'rs123' },
        { positional: true, reference1: { name: 'egfr', sourceId: 1956 }, variant: 'c.1del' },
        { reference1: { name: 'egfr', sourceId: 1956 }, type: 'mutation' },
    ];

    test('testUploadVariantRSID', async () => {
        const result = await uploadVariant(conn, normalizedVariants[0]);
        expect(result).toEqual({ '@rid': '#678:90', reference1: '#' });
    });

    test('testUploadVariantPositional', async () => {
        const result = await uploadVariant(conn, normalizedVariants[1]);
        expect(result).toEqual({ '@rid': '#123:45' });
    });

    test('testUploadVariantCategory', async () => {
        const result = await uploadVariant(conn, normalizedVariants[2]);
        expect(result).toEqual({ '@rid': '#123:45' });
    });
});

describe('uploadVariants', () => {
    const normalizedVariants = [
        // Factor
        {
            reference1: {
                class: 'Signature',
                name: 'high mutation burden',
            },
            type: 'high signature',
        },
        // Fusion
        {
            reference1: { name: 'braf', sourceId: '673' },
            reference2: { name: 'alk', sourceId: '238' },
            type: 'fusion',
        },
        // Gene
        {
            reference1: { name: 'braf', sourceId: '673' },
            type: 'mutation',
        },
    ];

    test('testuploadVariants', async () => {
        const uploadedVariants = await uploadVariants(conn, normalizedVariants);
        expect(uploadedVariants.length).toEqual(3);

        for (let i = 0; i < uploadedVariants.length; i++) {
            expect(uploadedVariants[i]).toEqual({ '@rid': '#123:45' });
        }
    });
});
