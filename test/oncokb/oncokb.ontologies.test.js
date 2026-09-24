const { constants: { TYPES_TO_NOTATION } } = require('@bcgsc-pori/graphkb-parser');

const entrezGene = require('../../src/entrez/gene');
const pubmed = require('../../src/entrez/pubmed');
const {
    ACTIONABLE_RELEVANCE_TERMS,
    DISCARDED_RELEVANCES,
    chromosomeMapping,
    diseaseMapping,
    evidenceLevelMapping,
    geneMapping,
    getEvidences,
    parseLevelIntoRelevanceTerm,
    publicationMapping,
    relevanceMapping,
    typeMapping,
} = require('../../src/oncokb/ontologies');


afterEach(() => {
    jest.restoreAllMocks();
});


describe('chromosomeMapping', () => {
    test('maps chromosome names to GraphKB RIDs', async () => {
        const conn = {
            getRecords: jest.fn().mockResolvedValue([
                { '@rid': '#123:01', name: 'chr1' },
                { '@rid': '#123:02', name: 'chrx' },
            ]),
        };

        await expect(chromosomeMapping(conn)).resolves.toEqual(new Map([
            ['chr1', '#123:01'],
            ['chrx', '#123:02'],
        ]));
        expect(conn.getRecords).toHaveBeenCalledWith({
            filters: { biotype: 'chromosome' },
            returnProperties: ['@rid', 'name'],
            target: 'Feature',
        });
    });
});

describe('diseaseMapping', () => {
    const conn = {
        getUniqueRecordBy: jest.fn().mockImplementation(async (opt) => {
            const name = JSON.stringify(opt.filters.name).toLowerCase();

            if (name.includes('acute myeloid leukemia')) {
                return { '@rid': '#123:01' };
            }
            if (name.includes('esophagogastric cancer')) {
                return { '@rid': '#123:02' };
            }
            throw new Error();
        }),
    };
    const data = {
        actionable: [
            { cancerType: 'Acute Myeloid Leukemia' },
            { cancerType: 'Esophagogastric Cancer' },
            { cancerType: 'Other disease' }, // non-matching term
        ],
    };

    test('get Disease name to RID mapping', async () => {
        expect(await diseaseMapping({ conn, data })).toEqual(new Map([
            ['Acute Myeloid Leukemia', '#123:01'],
            ['Esophagogastric Cancer', '#123:02'],
        ]));
    });
});

describe('evidenceLevelMapping', () => {
    let evidenceLevels;

    test('get evidenceLevels mapping', async () => {
        const data = {
            actionable: [
                { level: 'Dx1' },
                { level: 'Z' },
            ],
        };
        const conn = {
            getUniqueRecordBy: jest.fn().mockImplementation(async (opt) => {
                if (opt.filters.AND[0].name === 'dx1') {
                    return { '@rid': '#123:01', name: 'dx1' };
                }
                throw new Error();
            }),
        };

        evidenceLevels = await evidenceLevelMapping({ conn, data, source: { '@rid': '#123::02' } });

        expect(evidenceLevels).toEqual(new Map([
            ['Dx1', '#123:01'],
        ]));
    });

    test('unknowned evidenceLevels as undefined', () => {
        expect(evidenceLevels.get('Z')).toEqual(undefined);
    });
});

describe('geneMapping', () => {
    test('maps existing genes and uploads missing ones from Entrez', async () => {
        const conn = {
            getRecords: jest.fn().mockResolvedValue([
                // returns #123:01 only, not #123:02
                { '@rid': '#123:01', sourceId: '12301' },
            ]),
        };
        const data = {
            actionable: [
                { entrezGeneId: 12301, gene: 'GENE01' },
            ],
            annotated: [
                { entrezGeneId: 12302, gene: 'GENE02' },
                { entrezGeneId: -2, gene: 'Other Biomarkers' },
            ],
        };

        const fetchSpy = jest.spyOn(entrezGene, 'fetchAndLoadByIds').mockResolvedValue([
            // 12302 (#123:02) fetched and loaded from Entrez
            { '@rid': '#123:02', sourceId: '12302' },
        ]);

        await expect(geneMapping({ conn, data })).resolves.toEqual(new Map([
            [12301, '#123:01'],
            [12302, '#123:02'],
        ]));
        expect(conn.getRecords).toHaveBeenCalledWith({
            filters: {
                AND: [
                    { biotype: 'gene' },
                    { source: { filters: { name: 'entrez gene' }, target: 'Source' } },
                    { sourceId: [12301, 12302] },
                ],
            },
            returnProperties: ['@rid', 'sourceId'],
            target: 'Feature',
        });
        expect(fetchSpy).toHaveBeenCalledWith(conn, [12302]);
    });
});

describe('getEvidences', () => {
    const ontologies = {
        publications: new Map([
            ['12345', '#123:45'],
        ]),
        source: { '@rid': '#123:01' },
    };

    test('uses source OncoKB as evidences for oncogenicity', () => {
        expect(getEvidences(
            { ontologies, record: { abstracts: 'A', pmids: '12345' } },
            true, // for Annotated Variants oncogenicity
        )).toEqual({
            comments: '',
            evidences: ['#123:01'],
        });
    });

    test('uses PMIDs mapping as evidences, and abstracts as comments', () => {
        expect(getEvidences(
            { ontologies, record: { abstracts: 'A; B', pmids: '12345,99999' } },
            false, // for Actionable Variants, and Annotated Variants mutationEffect
        )).toEqual({
            comments: '\nA\nB',
            evidences: ['#123:45'],
        });
    });

    test('falls back to source OncoKB when no evidences are mapped', () => {
        expect(getEvidences(
            { ontologies, record: { abstracts: '', pmids: '99999' } },
            false,
        )).toEqual({
            comments: '',
            evidences: ['#123:01'],
        });
    });
});

describe('parseLevelIntoRelevanceTerm', () => {
    test.each([
        ['1', ACTIONABLE_RELEVANCE_TERMS.sensitivity],
        ['3A', ACTIONABLE_RELEVANCE_TERMS.sensitivity],
        ['Dx1', ACTIONABLE_RELEVANCE_TERMS.diagnostic],
        ['Px1', ACTIONABLE_RELEVANCE_TERMS.prognostic],
        ['R1', ACTIONABLE_RELEVANCE_TERMS.resistance],
    ])(
        'parse %s into %s', (level, expected) => {
            expect(parseLevelIntoRelevanceTerm(level)).toEqual(expected);
        },
    );

    test('unresolved relevance parsing returns undefined', () => {
        expect(parseLevelIntoRelevanceTerm('Z')).toEqual(undefined);
    });
});

describe('publicationMapping', () => {
    test('loads all referenced PMIDs through PubMed', async () => {
        const conn = {};
        const data = {
            actionable: [
                { pmids: '11111,22222' },
            ],
            annotated: [
                { mutationEffectPmids: '22222,33333' },
            ],
        };

        const preloadSpy = jest.spyOn(pubmed, 'preLoadCache').mockResolvedValue();
        const fetchSpy = jest.spyOn(pubmed, 'fetchAndLoadByIds').mockResolvedValue([
            { '@rid': '#123:01', sourceId: '11111' },
            { '@rid': '#123:02', sourceId: '22222' },
            { '@rid': '#123:03', sourceId: '33333' },
        ]);

        await expect(publicationMapping({ conn, data })).resolves.toEqual(new Map([
            ['11111', '#123:01'],
            ['22222', '#123:02'],
            ['33333', '#123:03'],
        ]));
        expect(preloadSpy).toHaveBeenCalledWith(conn);
        expect(fetchSpy).toHaveBeenCalledWith(conn, ['11111', '22222', '33333']);
    });
});

describe('relevanceMapping', () => {
    let relevances;

    test('get relevances mapping', async () => {
        const conn = {
            getUniqueRecordBy: jest.fn().mockImplementation(async (opt) => {
                if (opt.filters.name === 'gain of function') {
                    return { '@rid': '#123:01', name: 'gain of function' };
                }
                if (opt.filters.name === 'likely neutral') {
                    return { '@rid': '#123:02', name: 'likely neutral' };
                }
                if (opt.filters.name === 'resistance') {
                    return { '@rid': '#123:03', name: 'resistance' };
                }
                if (opt.filters.name === 'sensitivity') {
                    return { '@rid': '#123:04', name: 'sensitivity' };
                }
                throw new Error();
            }),
        };
        const data = {
            annotated: [
                {
                    mutationEffect: 'Gain-of-function',
                    oncogenicity: 'Likely Neutral',
                },
                // discarded
                {
                    mutationEffect: [...DISCARDED_RELEVANCES][2],
                    oncogenicity: [...DISCARDED_RELEVANCES][1],
                },
            ],
        };
        const levels = new Set(['1', 'R1']); // sensitivity and resistance

        relevances = await relevanceMapping({ conn, data, levels });

        expect(relevances).toEqual(new Map([
            ['Gain-of-function', '#123:01'],
            ['Likely Neutral', '#123:02'],
            ['Resistance', '#123:03'],
            ['Sensitivity', '#123:04'],
        ]));
    });

    test('unresolved relevance mapping returns undefined', async () => {
        expect(relevances.get([...DISCARDED_RELEVANCES][1])).toEqual(undefined);
    });
});

describe('typeMapping', () => {
    test('maps positional and category variant types', async () => {
        const positionalType = Object.keys(TYPES_TO_NOTATION)[0];
        const conn = {
            getRecords: jest.fn().mockImplementation(async ({ filters }) => {
                if (filters.name.includes(positionalType)) {
                    return [{ '@rid': '#123:01', name: positionalType }];
                }
                if (filters.name.includes('amplification')) {
                    return [{ '@rid': '#123:02', name: 'amplification' }];
                }
                return [];
            }),
        };

        await expect(typeMapping(conn)).resolves.toEqual(new Map([
            [positionalType, '#123:01'],
            ['amplification', '#123:02'],
        ]));
        expect(conn.getRecords).toHaveBeenCalledTimes(2);
    });
});
