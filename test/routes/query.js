/**
 * tests for the parsing of query parameters into the std body query format for POST requets
 */
const {
    expect
} = require('chai');
const qs = require('qs'); // to simulate express query parameter pparsing for tests

const {schema: SCHEMA_DEFN} = require('@bcgsc/knowledgebase-schema');

const DISEASE_PROPS = SCHEMA_DEFN.Disease.queryProperties;
const SOURCE_PROPS = SCHEMA_DEFN.Source.queryProperties;


const {
    constants: {TRAVERSAL_TYPE, OPERATORS}, Query, Clause, Comparison, Traversal
} = require('./../../app/repo/query');
const {
    flattenQueryParams, formatTraversal, parseValue, parse
} = require('./../../app/routes/query');


describe('flattenQueryParams', () => {
    it('flattens single level query', () => {
        const flat = flattenQueryParams({
            key: 'value'
        });
        expect(flat).to.eql([{attrList: ['key'], value: 'value'}]);
    });
    it('chains mutli-level query', () => {
        const flat = flattenQueryParams({
            key1: {key2: 'value'}
        });
        expect(flat).to.eql([{attrList: ['key1', 'key2'], value: 'value'}]);
    });
    it('Does not chain lists', () => {
        const flat = flattenQueryParams({
            key1: {key2: ['value1', 'value2']}
        });
        expect(flat).to.eql([{attrList: ['key1', 'key2'], value: ['value1', 'value2']}]);
    });
});


describe('formatTraversal', () => {
    it('returns direct for single attr', () => {
        const formatted = formatTraversal(['a']);
        expect(formatted).to.eql({attr: 'a'});
    });
    it('creates links for intermediary attrs', () => {
        const formatted = formatTraversal(['a', 'b', 'c']);
        expect(formatted).to.eql({
            attr: 'a',
            type: TRAVERSAL_TYPE.LINK,
            child: {
                attr: 'b',
                type: TRAVERSAL_TYPE.LINK,
                child: {attr: 'c'}
            }
        });
    });
});


describe('parseValue', () => {
    it('parses basic equals', () => {
        const parsed = parseValue('attr', 'blargh');
        expect(parsed).to.eql({
            attr: 'attr',
            value: 'blargh',
            negate: false
        });
    });
    it('parses null', () => {
        const parsed = parseValue('attr', 'null');
        expect(parsed).to.eql({
            attr: 'attr',
            value: null,
            negate: false
        });
    });
    it('parses CONTAINSTEXT operator', () => {
        const parsed = parseValue('attr', 'null');
        expect(parsed).to.eql({
            attr: 'attr',
            value: null,
            negate: false
        });
    });
    it('parses initial negation', () => {
        const parsed = parseValue('attr', '!blargh');
        expect(parsed).to.eql({
            attr: 'attr',
            value: 'blargh',
            negate: true
        });
    });
    it('parses OR list', () => {
        const parsed = parseValue('attr', 'blargh|monkeys');
        expect(parsed).to.eql({
            operator: OPERATORS.OR,
            comparisons: [
                {
                    attr: 'attr', value: 'blargh', negate: false
                },
                {
                    attr: 'attr', value: 'monkeys', negate: false
                }
            ]
        });
    });
    it('parses OR list with different operators', () => {
        const parsed = parseValue('attr', 'blargh|~monkeys');
        expect(parsed).to.eql({
            operator: OPERATORS.OR,
            comparisons: [
                {
                    attr: 'attr', value: 'blargh', negate: false
                },
                {
                    attr: 'attr', value: 'monkeys', operator: OPERATORS.CONTAINSTEXT, negate: false
                }
            ]
        });
    });
    it('parses OR list with some negatives', () => {
        const parsed = parseValue('attr', 'blargh|!monkeys');
        expect(parsed).to.eql({
            operator: OPERATORS.OR,
            comparisons: [
                {
                    attr: 'attr', value: 'blargh', negate: false
                },
                {
                    attr: 'attr', value: 'monkeys', negate: true
                }
            ]
        });
    });
});


describe('parse', () => {
    it('no query parameters', () => {
        const qparams = qs.parse('');
        const result = parse(qparams);
        expect(result).to.eql({where: []});
    });
    it('neighbors', () => {

    });
    it('errors on too many neighbors');
    it('limit');
    it('error on negative limit');
    it('error on 0 limit');
    it('error on limit too large');
    it('skip');
    it('error on negative skip');
    it('sourceId OR name', () => {
        const qparams = qs.parse('sourceId=blargh&name=monkeys&or=sourceId,name');
        const result = parse(qparams);
        expect(result).to.eql({
            where: [{
                operator: OPERATORS.OR,
                comparisons: [
                    {
                        attr: 'sourceId', value: 'blargh', negate: false
                    },
                    {
                        attr: 'name', value: 'monkeys', negate: false
                    }
                ]
            }]
        });
        const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, result);
    });
    it('similar attr names', () => {
        const qparams = qs.parse('source[name]=disease%20ontology&name=~pediat&neighbors=1');
        const result = parse(qparams);
        expect(result).to.eql({
            where: [
                {
                    attr: {attr: 'source', type: 'LINK', child: {attr: 'name'}},
                    value: 'disease ontology',
                    negate: false
                },
                {
                    attr: 'name',
                    operator: OPERATORS.CONTAINSTEXT,
                    value: 'pediat',
                    negate: false
                }
            ],
            neighbors: 1
        });
        const query = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, result);
        const exp = new Query(
            'Disease',
            new Clause('AND', [
                new Comparison(
                    new Traversal({
                        type: TRAVERSAL_TYPE.LINK,
                        child: new Traversal({
                            attr: 'name',
                            property: SOURCE_PROPS.name
                        }),
                        attr: 'source',
                        property: DISEASE_PROPS.source
                    }),
                    'disease ontology'
                ),
                new Comparison(
                    new Traversal({attr: 'name', property: DISEASE_PROPS.name}),
                    'pediat',
                    OPERATORS.CONTAINSTEXT
                ),
                new Comparison(
                    'deletedAt',
                    null,
                    OPERATORS.IS
                )
            ]),
            {neighbors: 1}
        );
        expect(query).to.eql(exp);
        const {query: sql, params} = query.toString();
        expect(sql).to.equal('SELECT * FROM Disease WHERE source.name = :param0 AND name CONTAINSTEXT :param1 AND deletedAt IS NULL');
        expect(params).to.eql({
            param0: 'disease ontology',
            param1: 'pediat'
        });
    });
    it('returnProperties', () => {
        const qparams = qs.parse('returnProperties=name,sourceId');
        const result = parse(qparams);
        expect(result).to.eql({
            where: [],
            returnProperties: ['name', 'sourceId']
        });
    });
});
