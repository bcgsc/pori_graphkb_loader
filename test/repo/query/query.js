const {expect} = require('chai');

const {
    schema: SCHEMA_DEFN,
    util: {castDecimalInteger, castToRID}
} = require('@bcgsc/knowledgebase-schema');

const {
    Clause, Comparison, Query, Traversal, constants: {NEIGHBORHOOD_EDGES, OPERATORS}
} = require('./../../../app/repo/query');
const {quoteWrap} = require('./../../../app/repo/util');

const SOURCE_PROPS = SCHEMA_DEFN.Source.queryProperties;
const DISEASE_PROPS = SCHEMA_DEFN.Disease.queryProperties;
const FEATURE_PROPS = SCHEMA_DEFN.Feature.queryProperties;

const {stripSQL} = require('./util');


describe('Query Parsing', () => {
    it('parses a complex traversal', () => {
        const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.V, {
            where: {
                attr: 'inE(ImpliedBy).vertex',
                value: {
                    type: 'neighborhood',
                    where: [
                        {
                            attr: 'name',
                            value: 'KRAS'
                        }
                    ],
                    class: 'Feature',
                    depth: 3
                }
            },
            neighbors: 3,
            limit: 1000
        });
        const expected = new Query(
            SCHEMA_DEFN.V.name,
            new Clause('AND', [
                new Comparison(
                    new Traversal({
                        type: 'EDGE', edges: ['ImpliedBy'], direction: 'in', child: new Traversal({attr: 'outV()', cast: castToRID})
                    }),
                    new Query(
                        'Feature',
                        new Clause('AND', [
                            new Comparison(
                                new Traversal({attr: 'name', property: FEATURE_PROPS.name}), 'KRAS'
                            )
                        ]),
                        {type: 'neighborhood'}
                    )
                )
            ]),
            {limit: 1000, neighbors: 3}
        );
        expect(parsed).to.eql(expected);
    });
    it('parses a simple single Comparison', () => {
        const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
            where: [{
                attr: 'name',
                value: 'thing'
            }],
            activeOnly: true
        });
        const expected = new Query(
            SCHEMA_DEFN.Disease.name,
            new Clause('AND', [
                new Comparison(
                    new Traversal({attr: 'name', property: DISEASE_PROPS.name}),
                    'thing'
                )
            ])
        );
        expect(expected).to.eql(parsed);
    });
    it('parses a simple single Comparison including history', () => {
        const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
            where: [{
                attr: 'name',
                value: 'thing'
            }],
            activeOnly: false
        });
        const expected = new Query(
            SCHEMA_DEFN.Disease.name,
            new Clause('AND', [
                new Comparison(
                    new Traversal({attr: 'name', property: DISEASE_PROPS.name}),
                    'thing'
                )
            ]),
            {activeOnly: false}
        );
        expect(parsed).to.eql(expected);
    });
    describe('nested Clause', () => {
        it('AND then OR', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [
                    {attr: 'name', value: 'thing'},
                    {
                        operator: 'OR',
                        comparisons: [
                            {attr: 'sourceId', value: '1234'},
                            {attr: 'sourceId', value: '12345'}
                        ]
                    }
                ],
                activeOnly: false
            });
            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', [
                    new Comparison(
                        new Traversal({attr: 'name', property: DISEASE_PROPS.name}),
                        'thing'
                    ),
                    new Clause('OR', [
                        new Comparison(new Traversal({attr: 'sourceId', property: DISEASE_PROPS.sourceId}), '1234'),
                        new Comparison(new Traversal({attr: 'sourceId', property: DISEASE_PROPS.sourceId}), '12345')
                    ])
                ]),
                {activeOnly: false}
            );
            expect(parsed).to.eql(expected);
        });
    });
    describe('list attributes', () => {
        it('uses contains if the input value is not also a list', () => {

        });
    });
    describe('orderBy', () => {
        it('parses a single order column', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [],
                activeOnly: false,
                orderBy: ['@rid']
            });

            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', []),
                {activeOnly: false, orderBy: ['@rid']}
            );
            expect(parsed).to.eql(expected);
            const sql = 'SELECT * FROM Disease ORDER BY @rid ASC';
            const {query, params} = parsed.toString();
            expect(params).to.eql({});
            expect(stripSQL(query)).to.equal(stripSQL(sql));
        });
        it('descending order', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [],
                activeOnly: false,
                orderBy: ['name'],
                orderByDirection: 'DESC'
            });

            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', []),
                {activeOnly: false, orderBy: ['name'], orderByDirection: 'DESC'}
            );
            expect(parsed).to.eql(expected);
            const sql = 'SELECT * FROM Disease ORDER BY name DESC';
            const {query, params} = parsed.toString();
            expect(params).to.eql({});
            expect(stripSQL(query)).to.equal(stripSQL(sql));
        });
        it('parses a multiple ordering columns', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [],
                activeOnly: false,
                orderBy: ['@rid', '@class']
            });

            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', []),
                {activeOnly: false, orderBy: ['@rid', '@class']}
            );
            expect(parsed).to.eql(expected);
            const sql = 'SELECT * FROM Disease ORDER BY @rid ASC, @class ASC';
            const {query, params} = parsed.toString();
            expect(params).to.eql({});
            expect(stripSQL(query)).to.equal(stripSQL(sql));
        });
    });
    describe('subquery', () => {
        it('link in subquery', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [
                    {
                        attr: 'source',
                        value: {
                            class: 'Source',
                            where: [
                                {attr: 'name', value: 'disease-ontology'}
                            ],
                            activeOnly: true
                        }
                    }
                ],
                activeOnly: true
            });
            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', [
                    new Comparison(
                        new Traversal({attr: 'source', property: DISEASE_PROPS.source}),
                        new Query(
                            SCHEMA_DEFN.Source.name,
                            new Clause(
                                'AND', [
                                    new Comparison({attr: 'name', property: SOURCE_PROPS.name}, 'disease-ontology')
                                ]
                            ),
                            {activeOnly: true}
                        )
                    )
                ]),
                {activeOnly: true}
            );
            expect(parsed).to.eql(expected);
            const sql = stripSQL(`
                SELECT *
                    FROM (SELECT *
                        FROM Disease
                        WHERE source IN
                            (SELECT * FROM (SELECT * FROM Source WHERE name = :param0) WHERE deletedAt IS NULL)
                        )
                    WHERE deletedAt IS NULL`);
            const {query, params} = parsed.toString();
            expect(params).to.eql({param0: 'disease-ontology'});
            expect(query).to.equal(sql);
        });
        it('link in neighborhood subquery', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [
                    {
                        attr: 'source',
                        value: {
                            class: 'Source',
                            where: [
                                {attr: 'name', value: 'disease-ontology'}
                            ],
                            type: 'neighborhood',
                            activeOnly: false
                        }
                    }
                ],
                activeOnly: false
            });
            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', [
                    new Comparison(
                        new Traversal({attr: 'source', property: DISEASE_PROPS.source}),
                        new Query(
                            SCHEMA_DEFN.Source.name,
                            new Clause(
                                'AND', [
                                    new Comparison({attr: 'name', property: SOURCE_PROPS.name}, 'disease-ontology')
                                ]
                            ),
                            {type: 'neighborhood', activeOnly: false}
                        )
                    )
                ]),
                {activeOnly: false}
            );
            expect(parsed).to.eql(expected);
            const sql = `SELECT * FROM Disease
                WHERE source IN (SELECT * FROM (
                    MATCH {class: Source, WHERE: (name = :param0)}.both(
                        ${Array.from(NEIGHBORHOOD_EDGES, quoteWrap).join(', ')}
                    ){WHILE: ($depth < 3)} RETURN $pathElements))`;
            const {query, params} = parsed.toString();
            expect(params).to.eql({param0: 'disease-ontology'});
            expect(stripSQL(query)).to.equal(stripSQL(sql));
        });
        it('query by string in subset', () => {

        });
    });
});


describe('Comparison', () => {
    describe('constructor', () => {
        it('throws error on non-std operator', () => {
            expect(() => {
                new Comparison('blargh', 'monkeys', 'BAD');
            }).to.throw('Invalid operator');
        });
        it('throws error on AND operator', () => {
            expect(() => {
                new Comparison('blargh', 'monkeys', 'AND');
            }).to.throw('Invalid operator');
        });
        it('throws error on OR operator', () => {
            expect(() => {
                new Comparison('blargh', 'monkeys', 'OR');
            }).to.throw('Invalid operator');
        });
    });
    describe('toString', () => {
        it('wrap when negated', () => {
            const comp = new Comparison('blargh', 'monkeys', OPERATORS.EQ, true);
            const {query, params} = comp.toString();
            expect(query).to.equal('NOT (blargh = :param0)');
            expect(params).to.eql({param0: 'monkeys'});
        });
        it('value is a list', () => {
            const comp = new Comparison('blargh', ['monkeys', 'monkees'], OPERATORS.EQ, true);
            const {query, params} = comp.toString();
            expect(query).to.equal('NOT (blargh = [:param0, :param1])');
            expect(params).to.eql({param0: 'monkeys', param1: 'monkees'});
        });
    });
    describe('validate', () => {
        it('throws error on GT and iterable prop', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        cast: castDecimalInteger,
                        iterable: true
                    }
                }),
                '1',
                OPERATORS.GT
            );
            expect(comp.validate.bind(comp)).to.throw(
                'cannot be used in conjunction with an iterable property'
            );
        });
        it('casts all values in an Array individually', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        cast: castDecimalInteger,
                        iterable: true
                    }
                }),
                ['1', '2', '3'],
                OPERATORS.IN
            );
            comp.validate();
            expect(comp.value).to.eql([1, 2, 3]);
        });
        it('checks values against an choices for each value in an Array', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true,
                        choices: ['blargh', 'monkey']
                    }
                }),
                ['blargh', 'monkey'],
                OPERATORS.IN
            );
            comp.validate();
        });
        it('Error on bad choices value in array', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true,
                        choices: ['blargh', 'modnkey']
                    }
                }),
                ['blargh', 'monkey'],
                OPERATORS.IN
            );
            expect(comp.validate.bind(comp)).to.throw('restricted to enum values');
        });
        it('Error on non-terable prop = LIST', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: false
                    }
                }),
                ['blargh', 'monkey'],
                OPERATORS.EQ
            );
            expect(comp.validate.bind(comp)).to.throw('Using a direct comparison');
        });
        it('Error on iterable prop CONTAINS LIST', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true
                    }
                }),
                ['blargh', 'monkey'],
                OPERATORS.CONTAINS
            );
            expect(comp.validate.bind(comp)).to.throw('CONTAINS should be used with non-iterable values');
        });
        it('Error on non-iterable prop contains', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: false
                    }
                }),
                'monkey',
                OPERATORS.CONTAINS
            );
            expect(comp.validate.bind(comp)).to.throw('CONTAINS can only be used with iterable properties');
        });
        it('Error on iterable prop contains NULL', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true
                    }
                }),
                null,
                OPERATORS.CONTAINS
            );
            expect(comp.validate.bind(comp)).to.throw('used for NULL comparison');
        });
        it('Error on non-iterable value using IN', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: false
                    }
                }),
                'blarghmonkeys',
                OPERATORS.IN
            );
            expect(comp.validate.bind(comp)).to.throw('IN should only be used with iterable values');
        });
        it('Error on iterable prop = non-null, non-iterable value', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true
                    }
                }),
                'blarghmonkeys',
                OPERATORS.EQ
            );
            expect(comp.validate.bind(comp)).to.throw('must be against an iterable value');
        });
    });
});


describe('SQL', () => {
});
