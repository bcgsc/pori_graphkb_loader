const {
    fetchPrevious,
    hashContentToSourceId,
    hashOncokbRecordToId,
    parseEvidence,
} = require('../../src/oncokb/util');


afterEach(() => {
    jest.restoreAllMocks();
});


describe('parseEvidence', () => {
    test.each([
        ['returns an empty array for missing input', undefined, undefined, []],
        ['splits PMID strings on commas and trims whitespace', ' A, B , , C ', undefined, ['A', 'B', 'C']],
        ['splits abstract strings on semicolons and trims whitespace', ' A; B ; ; C', 'abstracts', ['A', 'B', 'C']],
    ])('%s', (_, evidence, type, expected) => {
        expect(parseEvidence(evidence, type)).toEqual(expected);
    });
});

describe('fetchPrevious', () => {
    const source = { '@rid': '#456:78', name: 'oncokb' };

    test('fetches OncoKB statements and maps records by sourceId', async () => {
        const valid1 = { '@rid': '#123:01', sourceId: 'statement-1', subject: '#123:11' };
        const valid2 = { '@rid': '#123:02', sourceId: 'statement-2', subject: '#123:12' };
        const conn = {
            getRecords: jest.fn().mockResolvedValue([
                valid1,
                valid2,
                { '@rid': '#123:03', sourceId: '' }, // no sourceId (cancer gene list). Discard
            ]),
        };

        await expect(fetchPrevious({ conn, source })).resolves.toEqual(new Map([
            ['statement-1', valid1],
            ['statement-2', valid2],
        ]));
        expect(conn.getRecords).toHaveBeenCalledWith({
            filters: { source: '#456:78' },
            target: 'Statement',
        });
    });

    test('throws when multiple OncoKB statements share the same sourceId', async () => {
        const conn = {
            getRecords: jest.fn().mockResolvedValue([
                { '@rid': '#123:01', sourceId: 'duplicate' },
                { '@rid': '#123:02', sourceId: 'duplicate' },
                { '@rid': '#123:03', sourceId: 'unique' },
            ]),
        };

        await expect(fetchPrevious({ conn, source })).rejects.toThrow();
    });
});

describe('hashContentToSourceId', () => {
    test('normalizes conditions and evidenceLevel array order', () => {
        const recordA = {
            conditions: ['#123:02', '#123:01'], // unsorted
            evidenceLevel: ['#123:04', '#123:03'], // unsorted
            relevance: '#123:05',
            subject: '#123:06',
        };
        const recordB = {
            conditions: ['#123:01', '#123:02'], // sorted
            evidenceLevel: ['#123:03', '#123:04'], // sorted
            relevance: '#123:05',
            subject: '#123:06',
        };

        expect(hashContentToSourceId(recordA)).toEqual(hashContentToSourceId(recordB));
    });

    test('does not mutate input arrays while normalizing order', () => {
        const content = {
            conditions: ['#123:02', '#123:01'],
            evidenceLevel: ['#123:04', '#123:03'],
            relevance: '#123:05',
            subject: '#123:06',
        };
        const original = JSON.parse(JSON.stringify(content));

        hashContentToSourceId(content);

        expect(content).toEqual(original);
    });

    test('ignores unselected fields but changes when selected fields change', () => {
        const base = {
            conditions: ['#123:01'],
            evidenceLevel: ['#123:02'],
            relevance: '#123:03',
            subject: '#123:04',
        };

        expect(hashContentToSourceId({
            ...base,
            comment: 'ignored field',
        })).toEqual(hashContentToSourceId(base));
        expect(hashContentToSourceId({
            ...base,
            subject: '#123:05',
        })).not.toEqual(hashContentToSourceId(base));
    });
});

describe('hashOncokbRecordToId', () => {
    const BASE = {
        entrezGeneId: 1,
        grch37Isoform: 'ENST0000012345',
        grch37RefSeq: 'NM_0000012345.1',
        grch38Isoform: 'ENST0000012345',
        grch38RefSeq: 'NM_0000012345.2',
        proteinChange: 'V600E',
        setting: 'Somatic',
        variant: 'V600E',
    };

    test('ignores fields outside the selected hash input', () => {
        const actionable = {
            ...BASE,
            cancerType: 'Melanoma',
            drugs: 'Drug A',
            level: '1',
        };
        const annotated = {
            ...BASE,
            mutationEffect: 'Gain-of-function',
            oncogenicity: 'Oncogenic',
        };

        expect(hashOncokbRecordToId({
            ...actionable,
            abstracts: 'Some abstract',
            description: 'Some description',
            liquidPropagationLevel: 'NO',
            pmids: '123456789',
            referenceGenome: 'GRCh37, GRCh38',
            solidPropagationLevel: '3B',
        })).toEqual(hashOncokbRecordToId(actionable));

        expect(hashOncokbRecordToId({
            ...annotated,
            description: 'Some description',
            mutationEffectAbstracts: 'Some abstract',
            mutationEffectPmids: '123456789',
            referenceGenome: 'GRCh37, GRCh38',
        })).toEqual(hashOncokbRecordToId(annotated));
    });

    test('changes when an identifying field changes', () => {
        expect(hashOncokbRecordToId({
            ...BASE,
            proteinChange: 'V600K',
        })).not.toEqual(hashOncokbRecordToId(BASE));
    });
});
