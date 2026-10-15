const { rid } = require('../../src/graphkb');
const {
    fetchAndLoadTherapyCombination,
    fetchTherapies,
    parseDrugs,
    preferredTherapy,
    therapyMapping,
} = require('../../src/oncokb/therapies');


const ONCOKB_SOURCE = { '@rid': '#456:78', name: 'oncokb' };
const THERAPY_RECORDS = [
    // c00001
    {
        '@rid': '#123:01', alias: false, deprecated: false, name: 'a', sourceId: 'c00001', updatedAt: 1704067200000,
    },
    {
        '@rid': '#123:02', alias: false, deprecated: false, name: 'a2', sourceId: 'c00001', updatedAt: 1704153600000,
    },
    {
        '@rid': '#123:03', alias: false, deprecated: true, name: 'a3', sourceId: 'c00001', updatedAt: 1704240000000,
    },
    {
        '@rid': '#123:04', alias: true, deprecated: false, name: 'a4', sourceId: 'c00001', updatedAt: 1704326400000,
    },
    // c00002
    {
        '@rid': '#123:05', alias: false, deprecated: false, name: 'b', sourceId: 'c00002', updatedAt: 1704412800000,
    },
    // c00003
    {
        '@rid': '#123:06', alias: false, deprecated: false, name: 'c', sourceId: 'c00003', updatedAt: 1704499200000,
    },
    {
        '@rid': '#123:08', alias: false, deprecated: false, name: 'c', sourceId: 'c00003', updatedAt: 1704585600000,
    },
];
const COMBINATION_THERAPY_RECORD = {
    '@rid': '#123:07',
    combinationType: 'combination',
    name: 'a + b',
    sourceId: 'c00001 + c00002',
};

describe('fetchAndLoadTherapyCombination', () => {
    const therapies = new Map([
        ['a', rid(THERAPY_RECORDS[0])],
        ['b', rid(THERAPY_RECORDS[4])],
        ['c', rid(THERAPY_RECORDS[5])],
    ]);

    test('fetch existing combination', async () => {
        const conn = {
            getUniqueRecordBy: jest.fn().mockResolvedValue(COMBINATION_THERAPY_RECORD),
        };

        await fetchAndLoadTherapyCombination({
            conn,
            drug: 'B + A', // will get ordered and lowercased
            source: ONCOKB_SOURCE,
            therapies,
        });

        expect(conn.getUniqueRecordBy).toHaveBeenCalledWith(expect.objectContaining({
            filters: {
                AND: [
                    { combinationType: 'combination' },
                    { name: 'a + b' },
                    { source: rid(ONCOKB_SOURCE) },
                ],
            },
        }));
    });

    test('upload new combination', async () => {
        const NEW_COMBINATION_THERAPY_RECORD = {
            '@rid': '#123:08',
            combinationType: 'combination',
            name: 'b + c',
            sourceId: 'c00002 + c00003',
        };
        const conn = {
            addRecord: jest.fn().mockImplementation(async ({ target }) => {
                if (target === 'Therapy') {
                    return NEW_COMBINATION_THERAPY_RECORD;
                }
                if (target === 'ElementOf') return {};
                throw new Error();
            }),
            getUniqueRecordBy: jest.fn().mockImplementation(async () => {
                throw new Error(); // combination therapy not found
            }),
            request: jest.fn().mockImplementation(async ({ uri }) => {
                if (uri === `/therapies/${THERAPY_RECORDS[4]['@rid'].replace('#', '')}`) {
                    return { result: THERAPY_RECORDS[4] };
                }
                if (uri === `/therapies/${THERAPY_RECORDS[5]['@rid'].replace('#', '')}`) {
                    return { result: THERAPY_RECORDS[5] };
                }
                throw new Error();
            }),
        };

        const therapy = await fetchAndLoadTherapyCombination({
            conn,
            drug: 'C + B', // THERAPY_RECORDS[2] + THERAPY_RECORDS[1]
            source: ONCOKB_SOURCE,
            therapies,
        });

        // have try to fetch combination therapy but dosen't exists
        await expect(conn.getUniqueRecordBy()).rejects.toThrow();

        // have fetched individual therapies
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            uri: `/therapies/${THERAPY_RECORDS[4]['@rid'].replace('#', '')}`,
        }));
        expect(conn.request).toHaveBeenCalledWith(expect.objectContaining({
            uri: `/therapies/${THERAPY_RECORDS[5]['@rid'].replace('#', '')}`,
        }));

        // have uploaded new combination therapy, with edges
        expect(conn.addRecord).toHaveBeenNthCalledWith(1,
            expect.objectContaining({
                content: {
                    combinationType: 'combination',
                    displayName: `${NEW_COMBINATION_THERAPY_RECORD.name.toUpperCase()} [${NEW_COMBINATION_THERAPY_RECORD.sourceId}]`,
                    name: NEW_COMBINATION_THERAPY_RECORD.name,
                    source: rid(ONCOKB_SOURCE),
                    sourceId: NEW_COMBINATION_THERAPY_RECORD.sourceId,
                },
                target: 'Therapy',
            }),
        );
        expect(conn.addRecord).toHaveBeenNthCalledWith(2,
            expect.objectContaining({
                target: 'ElementOf',
            }),
        );
        expect(conn.addRecord).toHaveBeenNthCalledWith(3,
            expect.objectContaining({
                target: 'ElementOf',
            }),
        );

        // have returned new combination rid
        expect(therapy).toEqual('#123:08');
    });

    test('returns undefined if only one term is given', async () => {
        const conn = {
            addRecord: jest.fn(),
            getUniqueRecordBy: jest.fn(),
            request: jest.fn(),
        };

        await expect(fetchAndLoadTherapyCombination({
            conn,
            drug: 'A',
            source: ONCOKB_SOURCE,
            therapies,
        })).resolves.toBe(undefined);

        expect(conn.getUniqueRecordBy).not.toHaveBeenCalled();
        expect(conn.request).not.toHaveBeenCalled();
        expect(conn.addRecord).not.toHaveBeenCalled();
    });

    test('returns undefined when a constituent therapy cannot be fetched', async () => {
        const conn = {
            addRecord: jest.fn(),
            getUniqueRecordBy: jest.fn().mockRejectedValue(new Error()),
            request: jest.fn().mockRejectedValue(new Error()),
        };

        await expect(fetchAndLoadTherapyCombination({
            conn,
            drug: 'A + B',
            source: ONCOKB_SOURCE,
            therapies,
        })).resolves.toBe(undefined);

        expect(conn.addRecord).not.toHaveBeenCalled();
    });
});

describe('fetchTherapies', () => {
    let therapies;

    test('calls getRecords with NCIt filters', async () => {
        const conn = {
            getRecords: jest.fn().mockResolvedValue(THERAPY_RECORDS),
        };
        const drugs = new Map([
            ['c00001', 'a'],
            ['c00002', 'b'],
            ['c00003', 'c'],
            ['c00004', 'd'], // additional unknown drug (not in THERAPY_RECORDS)
        ]);

        therapies = await fetchTherapies({ conn, drugs });

        expect(conn.getRecords).toHaveBeenCalledWith(expect.objectContaining({
            filters: {
                AND: [
                    { source: { filters: { name: 'ncit' }, target: 'Source' } },
                    { sourceId: ['c00001', 'c00002', 'c00003', 'c00004'] },
                ],
            },
        }));
    });

    test('returns name to rid mapping', () => {
        expect(therapies).toEqual(new Map([
            ['a', '#123:01'],
            ['b', '#123:05'],
            ['c', '#123:08'],
        ]));
    });

    test('unknowned therapies as undefined', () => {
        expect(therapies.get('d')).toEqual(undefined);
    });
});

describe('parseDrugs', () => {
    test.each([
        ['empty string', '', []],
        ['keep uppercase', 'A', ['A']],
        ['trim whitespace', ' a ', ['a']],
        ['split on commas', 'a, b', ['a', 'b']],
        ['split & trim', 'a, b, ', ['a', 'b']],
        ['keep combinations together', 'a + b', ['a + b']],
        ['split mixed content', 'a, b + c', ['a', 'b + c']],
        ['split multiple combinations', 'a + b, c + d', ['a + b', 'c + d']],
    ])(
        '%s', (msg, drugs, expected) => {
            expect(parseDrugs(drugs)).toEqual(expected);
        },
    );
});

describe('preferredTherapy', () => {
    test.each([
        ['Not deprecated over deprecated', THERAPY_RECORDS[2], THERAPY_RECORDS[0], false],
        ['Not an alias over alias', THERAPY_RECORDS[3], THERAPY_RECORDS[0], false],
        ['name matching over not matching', THERAPY_RECORDS[0], THERAPY_RECORDS[1], true],
        ['more recent updatedAt on equal rank', THERAPY_RECORDS[6], THERAPY_RECORDS[5], true],
    ])(
        '%s', (_, a, b, expected) => {
            expect(preferredTherapy(a, b, a.name)).toEqual(expected);
        },
    );
});

describe('therapyMapping', () => {
    const data = {
        actionable: [
            { drugs: 'A' },
            { drugs: 'B + A' },
        ],
        drugs: [
            { drugName: 'A', ncitCode: 'C00001' },
            { drugName: 'B', ncitCode: 'C00002' },
            { drugName: 'C', ncitCode: 'C00003' },
            { drugName: 'Z', ncitCode: 'C00004' }, // not in THERAPY_RECORDS
        ],
    };
    const conn = {
        getRecords: jest.fn().mockResolvedValue(THERAPY_RECORDS),
        getUniqueRecordBy: jest.fn().mockResolvedValue(COMBINATION_THERAPY_RECORD),
    };

    test('get Therapy name to RID mapping', async () => {
        const mapping = await therapyMapping({ conn, data, source: ONCOKB_SOURCE });

        expect(mapping).toEqual(new Map([
            // drug names get lowercased
            ['a', rid(THERAPY_RECORDS[0])],
            ['b', rid(THERAPY_RECORDS[4])],
            ['c', rid(THERAPY_RECORDS[6])],
            ['b + a', rid(COMBINATION_THERAPY_RECORD)], // combination keys stay in original sorting order
        ]));
        expect(mapping.get('missingdrug')).toEqual(undefined);
    });
});
