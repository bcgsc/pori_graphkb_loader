const {expect} = require('chai');
const {RID} = require('orientjs');

const {SCHEMA_DEFN} = require('./../../app/repo/schema');
const {ClassModel, Property} = require('./../../app/repo/model');
const {
    Clause, Comparison, SelectionQuery, Follow
} = require('./../../app/repo/query');
const {RELATED_NODE_DEPTH} = require('./../../app/repo/base');
const {castToRID} = require('./../../app/repo/util');

const stripSQL = string => string.replace(/\s+\./g, '.').replace(/\s+/g, ' ');


describe('Follow', () => {
    it('errors on bad edge type', () => {
        expect(() => {
            new Follow([], 'badEdgeType');
        }).to.throw('expected type to be');
    });
    it('allows empty constructor arguments', () => {
        const follow = new Follow();
        expect(follow.toString()).to.equal(`.both(){while: ($depth < ${RELATED_NODE_DEPTH} AND deletedAt IS NULL), where: (deletedAt IS NULL)}`);
    });
    it('allows In edge type', () => {
        const follow = new Follow([], 'in', RELATED_NODE_DEPTH, false);
        expect(follow.toString()).to.equal(`.in(){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('allows in edge type (default active)', () => {
        // active only ?
        const follow = new Follow([], 'in', RELATED_NODE_DEPTH, true);
        expect(follow.toString()).to.equal(`.in(){while: ($depth < ${RELATED_NODE_DEPTH} AND deletedAt IS NULL), where: (deletedAt IS NULL)}`);
    });
    it('allows Out edge type', () => {
        const follow = new Follow([], 'out', RELATED_NODE_DEPTH, false);
        expect(follow.toString()).to.equal(`.out(){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('allows Out edge type (default active)', () => {
        const follow = new Follow([], 'out');
        expect(follow.toString()).to.equal(`.out(){while: ($depth < ${RELATED_NODE_DEPTH} AND deletedAt IS NULL), where: (deletedAt IS NULL)}`);
    });
    it('allows In and null depth', () => {
        const follow = new Follow([], 'in', null, false);
        expect(follow.toString()).to.equal('.in(){while: (in().size() > 0)}');
    });
    it('allows In and null depth (default active)', () => {
        const follow = new Follow([], 'in', null);
        expect(follow.toString()).to.equal('.in(){while: (in().size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}');
    });
    it('allows Out and null depth', () => {
        const follow = new Follow([], 'out', null, false);
        expect(follow.toString()).to.equal('.out(){while: (out().size() > 0)}');
    });
    it('allows Out and null depth (default active)', () => {
        const follow = new Follow([], 'out', null);
        expect(follow.toString()).to.equal('.out(){while: (out().size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}');
    });
    it('allows In and null depth with classes', () => {
        const follow = new Follow(['blargh', 'monkeys'], 'in', null, false);
        expect(follow.toString()).to.equal('.in(\'blargh\', \'monkeys\'){while: (in(\'blargh\', \'monkeys\').size() > 0)}');
    });
    it('allows In and null depth with classes (active)', () => {
        const follow = new Follow(['blargh', 'monkeys'], 'in', null);
        expect(follow.toString()).to.equal('.in(\'blargh\', \'monkeys\'){while: (in(\'blargh\', \'monkeys\').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}');
    });
    it('allows Out and null depth with classes', () => {
        const follow = new Follow(['blargh', 'monkeys'], 'out', null, false);
        expect(follow.toString()).to.equal('.out(\'blargh\', \'monkeys\'){while: (out(\'blargh\', \'monkeys\').size() > 0)}');
    });
    it('allows Out and null depth with classes (active)', () => {
        const follow = new Follow(['blargh', 'monkeys'], 'out', null);
        expect(follow.toString()).to.equal('.out(\'blargh\', \'monkeys\'){while: (out(\'blargh\', \'monkeys\').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}');
    });
    it('allows Both edge type', () => {
        const follow = new Follow([], 'both', RELATED_NODE_DEPTH, false);
        expect(follow.toString()).to.equal(`.both(){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('allows Both edge type (active)', () => {
        const follow = new Follow([], 'both');
        expect(follow.toString()).to.equal(`.both(){while: ($depth < ${RELATED_NODE_DEPTH} AND deletedAt IS NULL), where: (deletedAt IS NULL)}`);
    });
    it('throws error for null depth and both type', () => {
        expect(() => { new Follow([], 'both', null); }).to.throw();
    });
    it('allows multiple edge classes', () => {
        const follow = new Follow(['thing1', 'thing2'], 'in', RELATED_NODE_DEPTH, false);
        expect(follow.toString()).to.equal(`.in('thing1', 'thing2'){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('allows multiple edge classes (active)', () => {
        const follow = new Follow(['thing1', 'thing2'], 'in');
        expect(follow.toString()).to.equal(`.in('thing1', 'thing2'){while: ($depth < ${RELATED_NODE_DEPTH} AND deletedAt IS NULL), where: (deletedAt IS NULL)}`);
    });
    it('allows input depth to override default', () => {
        const follow = new Follow([], 'in', RELATED_NODE_DEPTH + 1, false);
        expect(follow.toString()).to.equal(`.in(){while: ($depth < ${RELATED_NODE_DEPTH + 1})}`);
    });
    it('allows input depth to override default (active)', () => {
        const follow = new Follow([], 'in', RELATED_NODE_DEPTH + 1);
        expect(follow.toString()).to.equal(`.in(){while: ($depth < ${RELATED_NODE_DEPTH + 1} AND deletedAt IS NULL), where: (deletedAt IS NULL)}`);
    });
});


describe('Comparison', () => {
    it('uses IS for null', () => {
        const comp = new Comparison(null);
        const {query, params} = comp.toString('blargh', 1);
        expect(query).to.equal('blargh IS NULL');
        expect(params).to.eql({});
    });
    it('negates an entire statement', () => {
        const comp = new Comparison(null, '=', true);
        const {query, params} = comp.toString('blargh', 1);
        expect(query).to.equal('NOT (blargh IS NULL)');
        expect(params).to.eql({});
    });
    it('parses subelements in a list', () => {
        const comp = new Comparison([1, 2, 3, 4]);
        const {query, params} = comp.toString('outE().inV().asSet()', 1);
        expect(query).to.equal('outE().inV().asSet() = [:param1, :param2, :param3, :param4]');
        expect(params).to.eql({
            param1: 1, param2: 2, param3: 3, param4: 4
        });
    });
    it('checks contains null for listable type', () => {
        const comp = new Comparison(null);
        const {query, params} = comp.toString('blargh', 0, true);
        expect(query).to.equal('blargh CONTAINS NULL');
        expect(params).to.eql({});
    });
});


describe('SelectionQuery', () => {
    let schema;
    beforeEach(() => {
        schema = {
            Person: new ClassModel({
                name: 'Person',
                properties: {
                    name: {name: 'name'},
                    lastname: {name: 'lastname'}
                }
            })
        };
        schema.Parent = new ClassModel({
            name: 'Parent',
            properties: {
                name: {name: 'name', mandatory: true, type: 'string'},
                child: {name: 'child', linkedClass: schema.Person, type: 'link'}
            }
        });
        schema.LinkedModel = new ClassModel({
            name: 'LinkedModel',
            properties: {
                thing: {name: 'thing', type: 'string'}
            }
        });
        schema.RestrictiveModel = new ClassModel({
            name: 'RestrictiveModel',
            properties: {
                requiredVar: {name: 'requiredVar', mandatory: true, type: 'string'},
                defaultVar: {name: 'defaultVar', type: 'string'},
                castable: {name: 'castable', type: 'string', cast: x => x.toLowerCase()},
                linkVar: {name: 'linkVar', linkedClass: schema.LinkedModel, type: 'link'},
                embeddedSetVar: new Property({name: 'embeddedSetVar', type: 'embeddedset', cast: x => x.toLowerCase()})
            },
            defaults: {defaultVar: () => 'default'}
        });
    });
    describe('on related EDGES', () => {
        beforeEach(() => {
            schema.Source = new ClassModel({
                name: 'Source',
                properties: {
                    name: {name: 'name', type: 'string'}
                }
            });
            schema.V = new ClassModel({name: 'V', subclasses: [schema.Source]});
            schema.AliasOf = new ClassModel({
                name: 'AliasOf',
                properties: {
                    source: {name: 'source', type: 'link', linkedClass: schema.Source},
                    basicProp: {Name: 'basicProp', type: 'string'}
                },
                isEdge: true
            });
        });
        it('AND clause against listable prop', () => {
            const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
                embeddedSetVar: new Clause(
                    'AND',
                    [new Comparison('1'), new Comparison('2')]
                )
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM RestrictiveModel
                WHERE embeddedSetVar CONTAINS :param0
                AND embeddedSetVar CONTAINS :param1`
            ));
        });
        it('has 3 outgoing aliasof edges', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {direction: 'out', size: 3}
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND outE('AliasOf').size() = :param1`
            ));
        });
        it('explicit related nodes by @rid', () => {
            const query = SelectionQuery.parseQuery(SCHEMA_DEFN, SCHEMA_DEFN.Statement,
                {
                    supportedby: {
                        v: new Clause('AND', [
                            new Comparison('44:3'),
                            new Comparison('44:4')
                        ])
                    }
                }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Statement
                WHERE bothE('SupportedBy').bothV() CONTAINS :param0
                AND bothE('SupportedBy').bothV() CONTAINS :param1`
            ));
        });
        it('explicit outgoing nodes by @rid', () => {
            const query = SelectionQuery.parseQuery(SCHEMA_DEFN, SCHEMA_DEFN.Statement,
                {
                    supportedby: {
                        direction: 'out',
                        v: new Clause('AND', [
                            new Comparison('44:3'),
                            new Comparison('44:4')
                        ])
                    }
                }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Statement
                WHERE outE('SupportedBy').inV() CONTAINS :param0
                AND outE('SupportedBy').inV() CONTAINS :param1`
            ));
        });
        it('has 3 ingoing aliasof edges', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {direction: 'in', size: 3}
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND inE('AliasOf').size() = :param1`
            ));
        });
        it('has 3 aliasof edges (direction not specified)', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {size: 3}
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND bothE('AliasOf').size() = :param1`
            ));
        });
        it('size and direct edge properties (flattened)', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {direction: 'out', size: 3, source: '#4:0'}
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND outE('AliasOf').size() = :param1
                AND outE('AliasOf').source CONTAINS :param2`
            ));
        });
        it('size and direct edge properties (flattened)', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {direction: 'out', size: 3, source: '#4:0'}
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND outE('AliasOf').size() = :param1
                AND outE('AliasOf').source CONTAINS :param2`
            ));
        });
        it('size excluding deleted subquery', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {direction: 'out', size: 3, source: '#4:0'}
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND outE('AliasOf').size() = :param1
                AND outE('AliasOf').source CONTAINS :param2`
            ));
        });
        it('has a related vertex named bob', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {direction: 'out', v: {name: 'bob'}}
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND outE('AliasOf').inV().name CONTAINS :param1`
            ));
        });
        it('has a related vertex with a name containing the substring bob but not alice', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {
                    direction: 'out',
                    v: {
                        name: new Clause('AND', [
                            new Comparison('bob', 'CONTAINSTEXT'),
                            new Comparison('alice', 'CONTAINSTEXT', true)
                        ])
                    }
                }
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND outE('AliasOf').inV().name CONTAINSTEXT :param1
                AND NOT (outE('AliasOf').inV().name CONTAINSTEXT :param2)`
            ));
        });
        it('uses a set operator on a related vertex property', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {
                    direction: 'out',
                    v: ['#12:0']
                }
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND outE('AliasOf').inV() CONTAINS :param1`
            ));
        });

        it('uses IN for related vertex subqueries', () => {
            const query = SelectionQuery.parseQuery(schema, schema.Parent, {
                name: 'blargh',
                AliasOf: {
                    direction: 'out',
                    v: {name: 'alice', fuzzyMatch: 2}
                }
            }, {activeOnly: false});
            const {query: statement} = query.toString();
            expect(statement).to.equal(stripSQL(
                `SELECT * FROM Parent
                WHERE name = :param0
                AND outE('AliasOf').inV() IN
                    (SELECT @rid FROM
                        (MATCH {class: V, where: (name = :param1)}.both('AliasOf', 'DeprecatedBy'){while: ($depth < 2)}
                        RETURN $pathElements))`
            ));
        });
    });
    it('errors on unexpected parameter', () => {
        expect(() => {
            const query = SelectionQuery.parseQuery(
                schema,
                schema.Parent,
                {name: new Comparison('blargh'), fuzzyMatch: 1, badAttr: new Comparison(null)}
            );
            console.log(query);
        }).to.throw('unexpected attribute');
    });
    it('match in select when returnProperties and fuzzyMatch specified', () => {
        const query = SelectionQuery.parseQuery(
            schema,
            schema.Parent,
            {name: new Comparison('blargh'), fuzzyMatch: 1, returnProperties: ['name', 'child']},
            {activeOnly: false}
        );
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT name, child FROM (MATCH {class: Parent, where: (name = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1)}
            RETURN $pathElements)`
        ));
    });
    it('match in select when returnProperties and fuzzyMatch specified (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.Parent, {name: new Comparison('blargh'), fuzzyMatch: 1, returnProperties: ['name', 'child']}, {activeOnly: true});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT name, child FROM (MATCH {class: Parent, where: (name = :param0 AND deletedAt IS NULL)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            RETURN $pathElements)`
        ));
    });
    it('throws error on invalid return property', () => {
        expect(() => {
            SelectionQuery.parseQuery(schema, schema.Parent, {name: new Comparison('blargh'), returnProperties: ['name', 'bad']});
        }).to.throw('is not a valid member of class');
    });
    it('match in select when returnProperties and ancestors specified');
    it('match in select when returnProperties and descendants specified');
    it('defaults to a match statement when fuzzyMatch is given', () => {
        const query = SelectionQuery.parseQuery(schema, schema.Parent, {name: new Comparison('blargh'), fuzzyMatch: 1}, {activeOnly: false});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `MATCH {class: Parent, where: (name = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1)}
            RETURN $pathElements`
        ));
    });
    it('defaults to a match statement when fuzzyMatch is given (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.Parent, {name: new Comparison('blargh'), fuzzyMatch: 1});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `MATCH {class: Parent, where: (name = :param0 AND deletedAt IS NULL)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            RETURN $pathElements`
        ));
    });
    it('defaults to a select statement when no follow arguments are given', () => {
        const query = SelectionQuery.parseQuery(schema, schema.Parent, {name: new Comparison('blargh')}, {activeOnly: false});
        const {query: statement} = query.toString();
        expect(statement).to.equal('SELECT * FROM Parent WHERE name = :param0');
    });
    it('defaults to a select statement when no follow arguments are given (active Only)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.Parent, {name: new Comparison('blargh')}, {activeOnly: true});
        const {query: statement} = query.toString();
        expect(statement).to.equal('SELECT * FROM Parent WHERE name = :param0 AND deletedAt IS NULL');
    });
    it('or two top level properties', () => {
        const query = SelectionQuery.parseQuery(
            schema,
            schema.RestrictiveModel,
            {requiredVar: new Clause('OR', ['blargh', 'monkeys']), defaultVar: 'monkeys'},
            {or: ['requiredVar', 'defaultVar']}
        );
        const {query: statement} = query.toString();
        expect(statement).to.equal('SELECT * FROM RestrictiveModel WHERE deletedAt IS NULL AND (defaultVar = :param0 OR (requiredVar = :param1 OR requiredVar = :param2))');
    });
    it('parses simple query', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1')
        }, {activeOnly: false});
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1')});
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM RestrictiveModel WHERE requiredVar = :param0');
        expect(params).to.eql({param0: 'vocab1'});
    });
    it('parses simple query (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1')
        }, {activeOnly: true});
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1'), deletedAt: new Comparison(null)});
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM RestrictiveModel WHERE deletedAt IS NULL AND requiredVar = :param0');
        expect(params).to.eql({param0: 'vocab1'});
    });
    it('parses query without where clause', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {}, {activeOnly: false});
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({});
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM RestrictiveModel');
        expect(params).to.eql({});
    });
    it('parses query without where clause (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {}, {activeOnly: true});
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({
            deletedAt: new Comparison(null)
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM RestrictiveModel WHERE deletedAt IS NULL');
        expect(params).to.eql({});
    });
    it('parses and re-flattens simple subquery', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing')}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            'linkVar.thing': new Comparison('thing')
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM RestrictiveModel WHERE linkVar.thing = :param0 AND requiredVar = :param1');
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses and re-flattens simple subquery (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing')}
        }, {activeOnly: true});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            'linkVar.thing': new Comparison('thing'),
            'linkVar.deletedAt': new Comparison(null)
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM RestrictiveModel WHERE deletedAt IS NULL AND linkVar.deletedAt IS NULL AND linkVar.thing = :param0 AND requiredVar = :param1');
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses subquery with fuzzyMatch', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), fuzzyMatch: 4}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {
                thing: new Comparison('thing'),
                fuzzyMatch: 4
            }, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE linkVar IN
                (SELECT @rid FROM
                    (MATCH {class: LinkedModel, where: (thing = :param0)}.both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)} RETURN $pathElements))
                    AND requiredVar = :param1`
        ));
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses subquery with fuzzyMatch (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), fuzzyMatch: 4}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), fuzzyMatch: 4, deletedAt: new Comparison(null)}),
            deletedAt: new Comparison(null)
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE deletedAt IS NULL AND linkVar IN
                (SELECT @rid FROM
                    (MATCH {class: LinkedModel, where: (deletedAt IS NULL AND thing = :param0)}.both('AliasOf', 'DeprecatedBy'){while: ($depth < 4 AND deletedAt IS NULL), where: (deletedAt IS NULL)} RETURN $pathElements))
                    AND requiredVar = :param1`
        ));
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses subquery with fuzzyMatch and ancestors');
    it('parses subquery with fuzzyMatch and descendants');
    it('parses subquery with fuzzyMatch and both ancestors and descendants');
    it('parses subquery with ancestors (single edge class)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), ancestors: ['subclassof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), ancestors: ['subclassof']}, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (thing = :param0)}
                .in('subclassof'){while: (in('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with ancestors (single edge class) (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), ancestors: ['subclassof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), ancestors: ['subclassof']})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (deletedAt IS NULL AND thing = :param0)}
                .in('subclassof'){while: (in('subclassof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with ancestors (multiple edge classes)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), ancestors: ['subclassof', 'aliasof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), ancestors: ['subclassof', 'aliasof']}, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (thing = :param0)}
                .in('subclassof', 'aliasof'){while: (in('subclassof', 'aliasof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with ancestors (multiple edge classes) (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), ancestors: ['subclassof', 'aliasof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), ancestors: ['subclassof', 'aliasof']}),
            deletedAt: new Comparison(null)
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (deletedAt IS NULL AND thing = :param0)}
                .in('subclassof', 'aliasof'){while: (in('subclassof', 'aliasof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (single edge class)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), descendants: ['subclassof']}, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (thing = :param0)}
                .out('subclassof'){while: (out('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (single edge class) (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), descendants: ['subclassof']})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (deletedAt IS NULL AND thing = :param0)}
                .out('subclassof'){while: (out('subclassof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (multiple edge classes)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof', 'aliasof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), descendants: ['subclassof', 'aliasof']}, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (thing = :param0)}
                .out('subclassof', 'aliasof'){while: (out('subclassof', 'aliasof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (multiple edge classes) (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof', 'aliasof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {thing: new Comparison('thing'), descendants: ['subclassof', 'aliasof']})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (deletedAt IS NULL AND thing = :param0)}
                .out('subclassof', 'aliasof'){while: (out('subclassof', 'aliasof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with both ancestors and descendants', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof'], ancestors: ['aliasof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {
                thing: new Comparison('thing'),
                descendants: ['subclassof'],
                ancestors: ['aliasof']
            }, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (thing = :param0)}
                .in('aliasof'){while: (in('aliasof').size() > 0)},
                {class: LinkedModel, where: (thing = :param0)}
                .out('subclassof'){while: (out('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with both ancestors and descendants (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof'], ancestors: ['aliasof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            linkVar: SelectionQuery.parseQuery(schema, schema.LinkedModel, {
                thing: new Comparison('thing'),
                descendants: ['subclassof'],
                ancestors: ['aliasof']
            })
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: LinkedModel, where: (deletedAt IS NULL AND thing = :param0)}
                .in('aliasof'){while: (in('aliasof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)},
                {class: LinkedModel, where: (deletedAt IS NULL AND thing = :param0)}
                .out('subclassof'){while: (out('subclassof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses query with fuzzyMatch', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            fuzzyMatch: 4
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1')
        });
        expect(query.follow).to.eql([[new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4, false)]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: RestrictiveModel, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)} RETURN $pathElements`
        ));
    });
    it('parses query with fuzzyMatch (activeOnly)', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            fuzzyMatch: 4,
            deletedAt: new Comparison(null)
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null)
        });
        expect(query.follow).to.eql([[new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4)]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: RestrictiveModel, where: (deletedAt IS NULL AND requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4 AND deletedAt IS NULL), where: (deletedAt IS NULL)} RETURN $pathElements`
        ));
    });
    it('parses query with fuzzyMatch and ancestors (activeOnly', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            fuzzyMatch: 4,
            ancestors: []
        }, {activeOnly: true});
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1'), deletedAt: new Comparison(null)});
        expect(query.follow).to.eql([[
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4),
            new Follow([], 'in', null),
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4)
        ]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: RestrictiveModel, where: (deletedAt IS NULL AND requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            .in(){while: (in().size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            RETURN $pathElements`
        ));
    });
    it('parses query with fuzzyMatch and ancestors', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            fuzzyMatch: 4,
            ancestors: []
        }, {activeOnly: false});
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1')});
        expect(query.follow).to.eql([[
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4, false),
            new Follow([], 'in', null, false),
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4, false)
        ]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: RestrictiveModel, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            .in(){while: (in().size() > 0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            RETURN $pathElements`
        ));
    });
    it('parses query with fuzzyMatch and descendants', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            fuzzyMatch: 4,
            descendants: []
        }, {activeOnly: false});
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1')});
        expect(query.follow).to.eql([[
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4, false),
            new Follow([], 'out', null, false),
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4, false)
        ]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: RestrictiveModel, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            .out(){while: (out().size() > 0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            RETURN $pathElements`
        ));
    });
    it('parses query with fuzzyMatch and both ancestors and descendants');
    it('parses query with ancestors');
    it('parses query with descendants');
    it('parses query with both ancestors and descendants');
    it('list attribute ok', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Clause('OR', ['vocab1', 'vocab2'])
        }, {activeOnly: false});
        expect(query.conditions).to.eql({requiredVar: new Clause('OR', ['vocab1', 'vocab2'])});
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1', param1: 'vocab2'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            (requiredVar = :param0 OR requiredVar = :param1)`
        ));
    });
    it('parses and flattens subquery list', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Clause('OR', ['vocab1', 'vocab2']),
            linkVar: {thing: new Clause('OR', ['thing1', 'thing2'])}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({requiredVar: new Clause('OR', ['vocab1', 'vocab2']), 'linkVar.thing': new Clause('OR', ['thing1', 'thing2'])});
        const {query: statement, params} = query.toString();
        expect(params).to.eql({
            param2: 'vocab1', param3: 'vocab2', param0: 'thing1', param1: 'thing2'
        });
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            (linkVar.thing = :param0 OR linkVar.thing = :param1)
            AND (requiredVar = :param2 OR requiredVar = :param3)`
        ));
    });
    it('cast for single attr', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            castable: new Comparison('MixedCase')
        }, {activeOnly: false});
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1'), castable: new Comparison('mixedcase')});
    });
    it('cast for list values', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            castable: new Clause('OR', ['MixedCase', 'UPPERCASE'])
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            castable: new Clause('OR', ['mixedcase', 'uppercase'])
        });
        expect(query.follow).to.have.property('length', 0);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'mixedcase', param1: 'uppercase', param2: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            (castable = :param0 OR castable = :param1)
            AND requiredVar = :param2`
        ));
    });
    it('cast for list values to be compared against list attr', () => {
        const query = SelectionQuery.parseQuery(schema, schema.RestrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            embeddedSetVar: new Clause('OR', ['mixedCase', 'UPPERCASE'])
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            embeddedSetVar: new Clause('OR', ['mixedcase', 'uppercase'])
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'mixedcase', param1: 'uppercase', param2: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM RestrictiveModel WHERE
            (embeddedSetVar CONTAINS :param0 OR embeddedSetVar CONTAINS :param1)
            AND requiredVar = :param2`
        ));
    });
    it('error on cast for dict attr', () => {
        expect(() => schema.RestrictiveModel.formatQuery({
            requiredVar: 'vocab1',
            castable: {MixedCase: 1, UPPERCASE: 2}
        })).to.throw(TypeError);
    });
    describe('conditionClause', () => {
        it('defaults a string to an RID object if the expected property is a link', () => {
            const model = new ClassModel({
                name: 'model',
                properties: {blargh: {type: 'link', cast: castToRID, name: 'blargh'}}
            });
            const selectionQuery = SelectionQuery.parseQuery({model}, model);
            const {query, params} = selectionQuery.conditionClause('blargh', new Clause('OR', ['4:0', null]));
            expect(query).to.equal('blargh = :param0 OR blargh IS NULL');
            expect(params).to.eql({param0: new RID('#4:0')});
        });
        it('defaults to OR statement', () => {
            const model = new ClassModel({
                name: 'model',
                properties: {blargh: {type: 'any'}}
            });
            const selectionQuery = SelectionQuery.parseQuery({model}, model);
            const {query, params} = selectionQuery.conditionClause('blargh', new Clause('OR', ['monkey', null]));
            expect(query).to.equal('blargh = :param0 OR blargh IS NULL');
            expect(params).to.eql({param0: 'monkey'});
        });
        it('allows mix of AND and OR', () => {
            const model = new ClassModel({
                name: 'model',
                properties: {blargh: {type: 'any'}, name: {type: 'string'}}
            });
            const selectionQuery = SelectionQuery.parseQuery({model}, model);
            const {query, params} = selectionQuery.conditionClause('blargh', new Clause('AND', [new Clause('OR', ['monkey', null]), 'blargh']));
            expect(query).to.equal('(blargh = :param0 OR blargh IS NULL) AND blargh = :param1');
            expect(params).to.eql({param0: 'monkey', param1: 'blargh'});
        });
        it('containstext operator', () => {
            const model = new ClassModel({
                name: 'model',
                properties: {blargh: {type: 'string'}, name: {type: 'string'}}
            });
            const selectionQuery = SelectionQuery.parseQuery({model}, model);
            const {query, params} = selectionQuery.conditionClause('blargh', new Comparison('monkeys', 'CONTAINSTEXT'));
            expect(query).to.equal('blargh CONTAINSTEXT :param0');
            expect(params).to.eql({param0: 'monkeys'});
        });
        it('not operator', () => {
            const model = new ClassModel({
                name: 'model',
                properties: {blargh: {type: 'string'}, name: {type: 'string'}}
            });
            const selectionQuery = SelectionQuery.parseQuery({model}, model);
            const {query, params} = selectionQuery.conditionClause('blargh', new Comparison('monkeys', '=', true));
            expect(query).to.equal('NOT (blargh = :param0)');
            expect(params).to.eql({param0: 'monkeys'});
        });
        it('not and containstext operators', () => {
            const model = new ClassModel({
                name: 'model',
                properties: {blargh: {type: 'string'}, name: {type: 'string'}}
            });
            const selectionQuery = SelectionQuery.parseQuery({model}, model);
            const {query, params} = selectionQuery.conditionClause('blargh', new Comparison('monkeys', 'CONTAINSTEXT', true));
            expect(query).to.equal('NOT (blargh CONTAINSTEXT :param0)');
            expect(params).to.eql({param0: 'monkeys'});
        });
        it('defaults to contains for non-object vs set/map/list types', () => {
            const model = new ClassModel({
                name: 'blargh',
                properties: {
                    monkeys: {name: 'monkeys', type: 'embeddedlist', iterable: true}
                },
                propertyNames: ['monkeys']
            });
            const selectionQuery = SelectionQuery.parseQuery(schema, model);
            const {query} = selectionQuery.conditionClause('monkeys', new Comparison(2));
            expect(query).to.equal('monkeys CONTAINS :param0');
        });
        it('defaults to contains for set/map/list types', () => {
            const model = new ClassModel({
                name: 'blargh',
                properties: {
                    monkeys: {name: 'monkeys', type: 'embeddedlist', iterable: true}
                },
                propertyNames: ['monkeys']
            });
            const selectionQuery = SelectionQuery.parseQuery(schema, model);
            const {query} = selectionQuery.conditionClause('monkeys', new Clause('OR', [2, 3]));
            expect(query).to.equal('monkeys CONTAINS :param0 OR monkeys CONTAINS :param1');
        });
    });
});
