'use strict';
const {expect} = require('chai');
const {castUUID, looksLikeRID} = require('./../../app/repo/util');
const cache = require('./../../app/repo/cache');
const {ClassModel} = require('./../../app/repo/schema');
const {checkAccess, SelectionQuery, Follow, RELATED_NODE_DEPTH} = require('./../../app/repo/base');
const {PERMISSIONS} = require('./../../app/repo/constants');
const {types, RID}  = require('orientjs');


const OJS_TYPES = {};
for (let num of Object.keys(types)) {
    const name = types[num].toLowerCase();
    OJS_TYPES[name] = num;
}

const stripSQL = (string) => {
    return string.replace(/\s+\./g, '.').replace(/\s+/g, ' ');
};

describe('util.castUUID', () => {
    it('returns valid uuid', () => {
        const uuid = '933fd4de-5bd6-471c-9869-a7601294ea6e';
        expect(castUUID(uuid)).to.equal(uuid);
    });
    it('errors on bad uuid', () => {
        const uuid = '933fd4de-5bd6-471c-4ea6e';
        expect(() => { castUUID(uuid); }).to.throw();
    });
});


describe('util.looksLikeRID', () => {
    it('false for bad rid', () => {
        expect(looksLikeRID('4')).to.be.false;
    });
    it('true for rid without hash if not strict', () => {
        expect(looksLikeRID('4:0')).to.be.true;
    });
    it('false for rid without hash if strict', () => {
        expect(looksLikeRID('4:0', true)).to.be.false;
    });
    it('true for rid with hash if strict', () => {
        expect(looksLikeRID('#4:0'), true).to.be.true;
    });
    it('true for rid with hash if not strict', () => {
        expect(looksLikeRID('#4:0')).to.be.true;
    });
});


describe('checkAccess', () => {
    it('user with no permissions', () => {
        const access = checkAccess({});
        expect(access).to.be.false;
    });
    it('inherits permission', () => {
        const access = checkAccess({permissions: {V: PERMISSIONS.ALL}}, {name: 'name', inherits: ['V']}, PERMISSIONS.ALL);
        expect(access).to.be.true;
    });
    it('does not inherit permission', () => {
        const access = checkAccess({permissions: {V: PERMISSIONS.WRITE}}, {name: 'name', inherits: ['V']}, PERMISSIONS.ALL);
        expect(access).to.be.false;
    });
    it('has permission on the current class', () => {
        const access = checkAccess({permissions: {name: PERMISSIONS.ALL}}, {name: 'name'}, PERMISSIONS.ALL);
        expect(access).to.be.true;
    });
    it('has permissions for read requires write', () => {
        const access = checkAccess({permissions: {name: PERMISSIONS.READ}}, {name: 'name', inherits: []}, PERMISSIONS.WRITE);
        expect(access).to.be.false;
    });
});


describe('Follow', () => {
    it('errors on bad edge type', () => {
        expect(() => {
            new Follow([], 'badEdgeType');
        }).to.throw('expected type to be');
    });
    it('allows empty constructor arguments', () => {
        const follow = new Follow();
        expect(follow.toString()).to.equal(`.both(){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('allows In edge type', () => {
        const follow = new Follow([], 'in');
        expect(follow.toString()).to.equal(`.in(){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('allows Out edge type', () => {
        const follow = new Follow([], 'out');
        expect(follow.toString()).to.equal(`.out(){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('allows In and null depth', () => {
        const follow = new Follow([], 'in', null);
        expect(follow.toString()).to.equal('.in(){while: ($matched.in().size() > 0)}');
    });
    it('allows Out and null depth', () => {
        const follow = new Follow([], 'out', null);
        expect(follow.toString()).to.equal('.out(){while: ($matched.out().size() > 0)}');
    });
    it('allows In and null depth with classes', () => {
        const follow = new Follow(['blargh', 'monkeys'], 'in', null);
        expect(follow.toString()).to.equal('.in(\'blargh\', \'monkeys\'){while: ($matched.in(\'blargh\', \'monkeys\').size() > 0)}');
    });
    it('allows Out and null depth with classes', () => {
        const follow = new Follow(['blargh', 'monkeys'], 'out', null);
        expect(follow.toString()).to.equal('.out(\'blargh\', \'monkeys\'){while: ($matched.out(\'blargh\', \'monkeys\').size() > 0)}');
    });
    it('allows Both edge type', () => {
        const follow = new Follow([], 'both');
        expect(follow.toString()).to.equal(`.both(){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('throws error for null depth and both type', () => {
        expect(() => { new Follow([], 'both', null);}).to.throw();
    });
    it('allows multiple edge classes', () => {
        const follow = new Follow(['thing1', 'thing2'], 'in');
        expect(follow.toString()).to.equal(`.in('thing1', 'thing2'){while: ($depth < ${RELATED_NODE_DEPTH})}`);
    });
    it('allows input depth to override default', () => {
        const follow = new Follow([], 'in', RELATED_NODE_DEPTH + 1);
        expect(follow.toString()).to.equal(`.in(){while: ($depth < ${RELATED_NODE_DEPTH + 1})}`);
    });
});


describe('SelectionQuery', () => {
    const person = new ClassModel({
        name: 'Person',
        properties: {
            name: {name: 'name'},
            lastname: {name: 'lastname'}
        }
    });
    const parent = new ClassModel({
        name: 'parent',
        properties: {
            name: {name: 'name', mandatory: true},
            child: {name: 'child', linkedModel: person}
        }
    });
    const linkedModel = new ClassModel({
        name: 'other',
        properties: {
            thing: {name: 'thing'}
        }
    });
    const restrictiveModel = new ClassModel({
        name: 'example',
        properties: {
            requiredVar: {name: 'requiredVar', mandatory: true},
            defaultVar: {name: 'defaultVar'},
            castable: {name: 'castable'},
            linkVar: {name: 'linkVar', linkedModel: linkedModel},
            embeddedSetVar: {name: 'embeddedSetVar', type: 'embeddedset'}
        },
        defaults: {defaultVar: () => 'default'},
        cast: {
            castable: (x) => x.toLowerCase(),
            embeddedSetVar: (x) => {
                const items = new Set();
                for (let item of x) {
                    item = item.toLowerCase().trim();
                    if (item) {
                        items.add(item);
                    }
                }
                return items;
            }
        }
    });
    it('errors on unexpected parameter', () => {
        expect(() => {
            new SelectionQuery(parent, {name: 'blargh', fuzzyMatch: 1, badAttr: null});
        }).to.throw('unexpected attribute');
    });
    it('match in select when returnProperties and fuzzyMatch specified', () => {
        const query = new SelectionQuery(parent, {name: 'blargh', fuzzyMatch: 1, returnProperties: ['name', 'child']});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT name, child FROM (MATCH {class: parent, where: (name = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1)}
            RETURN $pathElements)`
        ));
    });
    it('throws error on invalid return property', () => {
        expect(() => {
            new SelectionQuery(parent, {name: 'blargh', returnProperties: ['name', 'bad']});
        }).to.throw('columns on this class type');
    });
    it('match in select when returnProperties and ancestors specified');
    it('match in select when returnProperties and descendants specified');
    it('defaults to a match statement when fuzzyMatch is given', () => {
        const query = new SelectionQuery(parent, {name: 'blargh', fuzzyMatch: 1});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `MATCH {class: parent, where: (name = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1)}
            RETURN $pathElements`
        ));
    });
    it('defaults to a select statement when no follow arguments are given', () => {
        const query = new SelectionQuery(parent, {name: 'blargh'});
        const {query: statement} = query.toString();
        expect(statement).to.equal('SELECT * FROM parent WHERE name = :param0');
    });
    it('parses simple query', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1'
        });
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({requiredVar: ['vocab1']});
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM example WHERE requiredVar = :param0');
        expect(params).to.eql({param0: 'vocab1'});
    });
    it('parses query without where clause', () => {
        const query = new SelectionQuery(restrictiveModel);
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({});
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM example');
        expect(params).to.eql({});
    });
    it('parses and re-flattens simple subquery', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'linkVar.thing': 'thing'
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            'linkVar.thing': ['thing']
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM example WHERE linkVar.thing = :param0 AND requiredVar = :param1');
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses subquery with fuzzyMatch', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'linkVar.thing': 'thing',
            'linkVar.fuzzyMatch': 4
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            linkVar: new SelectionQuery(linkedModel, {thing: 'thing', fuzzyMatch: 4})
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE linkVar IN
                (SELECT @rid FROM
                    (MATCH {class: other, where: (thing = :param0)}.both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)} RETURN $pathElements))
                    AND requiredVar = :param1`));
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses subquery with fuzzyMatch and ancestors');
    it('parses subquery with fuzzyMatch and descendants');
    it('parses subquery with fuzzyMatch and both ancestors and descendants');
    it('parses subquery with ancestors (single edge class)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'linkVar.thing': 'thing',
            'linkVar.ancestors': 'subclassof'
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            linkVar: new SelectionQuery(linkedModel, {thing: 'thing', ancestors: 'subclassof'})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .in('subclassof'){while: ($matched.in('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with ancestors (multiple edge classes)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'linkVar.thing': 'thing',
            'linkVar.ancestors': ['subclassof', 'aliasof']
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            linkVar: new SelectionQuery(linkedModel, {thing: 'thing', ancestors: ['subclassof', 'aliasof']})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .in('subclassof', 'aliasof'){while: ($matched.in('subclassof', 'aliasof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (single edge class)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'linkVar.thing': 'thing',
            'linkVar.descendants': 'subclassof'
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            linkVar: new SelectionQuery(linkedModel, {thing: 'thing', descendants: 'subclassof'})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .out('subclassof'){while: ($matched.out('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (multiple edge classes)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'linkVar.thing': 'thing',
            'linkVar.descendants': ['subclassof', 'aliasof']
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            linkVar: new SelectionQuery(linkedModel, {thing: 'thing', descendants: ['subclassof', 'aliasof']})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .out('subclassof', 'aliasof'){while: ($matched.out('subclassof', 'aliasof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with both ancestors and descendants', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'linkVar.thing': 'thing',
            'linkVar.descendants': ['subclassof'],
            'linkVar.ancestors': ['aliasof']
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            linkVar: new SelectionQuery(linkedModel, {
                thing: 'thing',
                descendants: ['subclassof'],
                ancestors: ['aliasof']
            })
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .in('aliasof'){while: ($matched.in('aliasof').size() > 0)},
                {class: other, where: (thing = :param0)}
                .out('subclassof'){while: ($matched.out('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses query with fuzzyMatch', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            fuzzyMatch: 4
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
        });
        expect(query.follow).to.eql([[new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4)]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: example, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)} RETURN $pathElements`));
    });
    it('parses query with fuzzyMatch and ancestors', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            fuzzyMatch: 4,
            ancestors: ''
        });
        expect(query.conditions).to.eql({requiredVar: ['vocab1']});
        expect(query.follow).to.eql([[
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4),
            new Follow([], 'in', null),
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4)
        ]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: example, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            .in(){while: ($matched.in().size() > 0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            RETURN $pathElements`));
    });
    it('parses query with fuzzyMatch and descendants', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            fuzzyMatch: 4,
            descendants: ''
        });
        expect(query.conditions).to.eql({requiredVar: ['vocab1']});
        expect(query.follow).to.eql([[
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4),
            new Follow([], 'out', null),
            new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4)
        ]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: example, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            .out(){while: ($matched.out().size() > 0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            RETURN $pathElements`));
    });
    it('parses query with fuzzyMatch and both ancestors and descendants');
    it('parses query with ancestors');
    it('parses query with descendants');
    it('parses query with both ancestors and descendants');
    it('list attribute ok', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: ['vocab1', 'vocab2']
        });
        expect(query.conditions).to.eql({requiredVar: ['vocab1', 'vocab2']});
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1', param1: 'vocab2'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM example WHERE
            (requiredVar = :param0 OR requiredVar = :param1)`));
    });
    it('parses and flattens subquery list', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: ['vocab1', 'vocab2'],
            'linkVar.thing': ['thing1', 'thing2']
        });
        expect(query.conditions).to.eql({requiredVar: ['vocab1', 'vocab2'], 'linkVar.thing': ['thing1', 'thing2']});
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param2: 'vocab1', param3: 'vocab2', param0: 'thing1', param1: 'thing2'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM example WHERE
            (linkVar.thing = :param0 OR linkVar.thing = :param1)
            AND (requiredVar = :param2 OR requiredVar = :param3)`));
    });
    it('cast for single attr', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            castable: 'MixedCase'
        });
        expect(query.conditions).to.eql({requiredVar: ['vocab1'], castable: ['mixedcase']});
    });
    it('cast for list values', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'castable': ['MixedCase', 'UPPERCASE']
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            castable: ['mixedcase', 'uppercase']
        });
        expect(query.follow).to.have.property('length', 0);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'mixedcase', param1: 'uppercase', param2: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM example WHERE
            (castable = :param0 OR castable = :param1)
            AND requiredVar = :param2`));
    });
    it('cast for list values to be compared against list attr', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: 'vocab1',
            'embeddedSetVar': ['mixedCase', 'UPPERCASE']
        });
        expect(query.conditions).to.eql({
            requiredVar: ['vocab1'],
            embeddedSetVar: new Set('mixedcase', 'uppercase')
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'mixedcase', param1: 'uppercase', param2: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM example WHERE
            (embeddedSetVar contains :param0 OR embeddedSetVar contains :param1)
            AND requiredVar = :param2`));
    });
    it('error on cast for dict attr', () => {
        expect(() => {
            return restrictiveModel.formatQuery({
                requiredVar: 'vocab1',
                'castable': {MixedCase: 1, UPPERCASE: 2}
            });
        }).to.throw(TypeError);
    });
    describe('conditionClause', () => {
        it('allows alternate join string', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'any'}}
            });
            const {query, params} = selectionQuery.conditionClause('blargh', ['monkey', null], {joinOperator: ', '});
            expect(query).to.equal('(blargh = :param0, blargh is NULL)');
            expect(params).to.eql({param0: 'monkey'});
        });
        it('defaults a string to an RID object if the expected property is a link', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'link'}}
            });
            const {query, params} = selectionQuery.conditionClause('blargh', ['4:0', null]);
            expect(query).to.equal('(blargh = :param0 OR blargh is NULL)');
            expect(params).to.eql({param0: new RID('#4:0')});
        });
        it('defaults to OR statement', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'any'}}
            });
            const {query, params} = selectionQuery.conditionClause('blargh', ['monkey', null]);
            expect(query).to.equal('(blargh = :param0 OR blargh is NULL)');
            expect(params).to.eql({param0: 'monkey'});
        });
        it('allows the surrounding braces to be left off', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'any'}}
            });
            const {query, params} = selectionQuery.conditionClause('blargh', ['monkey', null], {joinOperator: ', ', noWrap: true});
            expect(query).to.equal('blargh = :param0, blargh is NULL');
            expect(params).to.eql({param0: 'monkey'});
        });
        it('defaults to contains for non-object vs set/map/list types', () => {
            const model = new ClassModel({
                name: 'blargh',
                properties: {
                    monkeys: {name: 'monkeys', type: 'embeddedlist'}
                }
            });
            const selectionQuery = new SelectionQuery(model);
            const {query} = selectionQuery.conditionClause('monkeys', [2]);
            expect(query).to.equal('monkeys contains :param0');
        });
        it('defaults to = for object vs set/map/list types', () => {
            const model = new ClassModel({
                name: 'blargh',
                properties: {
                    monkeys: {name: 'monkeys', type: 'embeddedlist'}
                }
            });
            const selectionQuery = new SelectionQuery(model);
            const {query} = selectionQuery.conditionClause('monkeys', [[2, 3]]);
            expect(query).to.equal('monkeys = :param0');
        });
    });
});


describe('ClassModel', () => {
    describe('parseOClass', () => {
        it('parses non-abstract class', () => {
            const parsed = ClassModel.parseOClass({
                name: 'Pathway',
                shortName: null,
                defaultClusterId: 65,
                properties: [],
                superClass: 'Ontology'
            });
            expect(parsed).to.have.property('name', 'Pathway');
            expect(parsed).to.have.property('isAbstract', false);
            expect(parsed.required).to.eql([]);
            expect(parsed.optional).to.eql([]);
            expect(parsed.defaults).to.eql({});
            expect(parsed.inherits).to.eql([]);
            expect(parsed.cast).to.eql({});
        });
        it('parses abstract class', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                defaultClusterId: -1,
                properties: [{name: 'prop1', mandatory: true, type: OJS_TYPES.any}],
                superClass: null
            });
            expect(parsed).to.have.property('name', 'name');
            expect(parsed).to.have.property('isAbstract', true);
            expect(parsed.required).to.eql(['prop1']);
            expect(parsed.optional).to.eql([]);
            expect(parsed.defaults).to.eql({});
            expect(parsed.inherits).to.eql([]);
            expect(parsed.cast).to.eql({});
        });
        it('parses optional properties', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                properties: [{name: 'prop1', mandatory: false, type: OJS_TYPES.any}],
                superClass: null
            });
            expect(parsed.optional).to.eql(['prop1']);
        });
        it('parses default values', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                properties: [{name: 'prop1', mandatory: false, defaultValue: 1, type: OJS_TYPES.integer}],
                superClass: null
            });
            expect(parsed.defaults).to.have.property('prop1');
        });
        it('parses integer cast', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                properties: [{name: 'prop1', mandatory: false, defaultValue: 1, type: OJS_TYPES.string}],
                superClass: null
            });
            expect(parsed.cast).to.have.property('prop1');
        });
    });
    describe('inheritance', () => {
        const person = new ClassModel({
            name: 'person',
            properties: {
                gender: {name: 'gender'},
                name: {name: 'name', mandatory: true}
            },
            defaults: {'gender': () => 'not specified'}
        });
        const child = new ClassModel({
            name: 'child',
            properties: {
                mom: {name: 'mom', mandatory: true},
                age: {name: 'age'}
            },
            cast: {'mom': (x) => x.toLowerCase()},
            inherits: [person], edgeRestrictions: []
        });

        it('child required returns person attr', () => {
            expect(person.required).to.eql(['name']);
            expect(child.required).to.eql(['mom', 'name']);
        });
        it('child optional returns person attr', () => {
            expect(person.optional).to.eql(['gender']);
            expect(child.optional).to.eql(['age', 'gender']);
        });
        it('inherits to return list of strings', () => {
            expect(person.inherits).to.eql([]);
            expect(child.inherits).to.eql([person.name]);
        });
        it('child defaults returns person attr', () => {
            expect(person.defaults).to.have.property('gender');
            expect(child.defaults).to.have.property('gender');
        });
        it('is not an edge', () => {
            expect(person.isEdge).to.be.false;
            expect(child.isEdge).to.be.true;
        });
    });

    describe('formatRecord', () => {
        let model;
        beforeEach(() => {
            model = new ClassModel({
                name: 'example',
                properties: {
                    req1: {name: 'req1', mandatory: true},
                    req2: {name: 'req2', mandatory: true},
                    opt1: {name: 'opt1'},
                    opt2: {name: 'opt2'}
                },
                defaults: {req2: () => 1, opt2: () => 2},
                cast: {req1: (x) => x.toLowerCase()}
            });
            cache.vocabulary = {example: {
                req1: [{class: 'example', name: 'req1', term: 'term1'}, {class: 'example', name: 'req1', term: 2}]
            }};
        });
        it('errors on bad vocabulary', () => {
            expect(() => {
                model.formatRecord({
                    req1: 'badTerm'
                }, {dropExtra: false, addDefaults: true});
            }).to.throw();
        });
        it('allows expected vocabulary', () => {
            expect(() => {
                model.formatRecord({
                    req1: 'term1'
                }, {dropExtra: false, addDefaults: true});
            }).to.not.throw();
        });
        it('errors on un-cast-able input', () => {
            expect(() => {
                model.formatRecord({
                    req1: 2
                }, {dropExtra: false, addDefaults: true});
            }).to.throw();
        });
        it('adds defaults', () => {
            const record = model.formatRecord({
                req1: 'term1'
            }, {dropExtra: false, addDefaults: true});
            expect(record).to.have.property('req1', 'term1');
            expect(record).to.have.property('req2', 1);
            expect(record).to.have.property('opt2', 2);
            expect(record).to.not.have.property('opt1');
        });
        it('cast embedded types', () => {
            model = new ClassModel({
                name: 'example',
                properties: {
                    thing: {name: 'thing', type: 'embeddedset'}
                },
                cast: {thing: (x) => {
                    const thing = new Set();
                    for (let item of x) {
                        item = item.toLowerCase().trim();
                        if (item !== '') {
                            thing.add(item);
                        }
                    }
                    return thing;
                }}
            });
            const record = model.formatRecord({
                thing: ['aThinNG', 'another THING']
            }, {dropExtra: false, addDefaults: true});
            expect(record).to.have.property('thing');
            expect(record.thing).to.eql(new Set(['athing', 'another thing']));
        });
        it('cast inheritied embedded types', () => {
            model = new ClassModel({
                name: 'example',
                properties: {
                    thing: {name: 'thing', type: 'embeddedset'}
                },
                cast: {thing: (x) => {
                    const thing = new Set();
                    for (let item of x) {
                        item = item.toLowerCase().trim();
                        if (item !== '') {
                            thing.add(item);
                        }
                    }
                    return thing;
                }}
            });
            const childModel = new ClassModel({
                name: 'child',
                inherits: [model]
            });
            const record = childModel.formatRecord({
                thing: ['aThinNG', 'another THING']
            }, {dropExtra: false, addDefaults: true});
            expect(record).to.have.property('thing');
            expect(record.thing).to.eql(new Set(['athing', 'another thing']));
        });
        it('does not add defaults', () => {
            expect(() => {
                model.formatRecord({
                    req1: 'term1'
                }, {dropExtra: false, addDefaults: false});
            }).to.throw();

            const record = model.formatRecord({
                req1: 'term1', req2: '1'
            }, {dropExtra: false, addDefaults: false});
            expect(record).to.have.property('req1', 'term1');
            expect(record).to.have.property('req2', '1');
            expect(record).to.not.have.property('opt2');
            expect(record).to.not.have.property('opt1');
        });
        it('allows optional parameters', () => {
            const record = model.formatRecord({
                req1: 'term1', req2: '1', opt1: '1'
            }, {dropExtra: false, addDefaults: false});
            expect(record).to.have.property('req1', 'term1');
            expect(record).to.have.property('req2', '1');
            expect(record).to.have.property('opt1', '1');
            expect(record).to.not.have.property('opt2');
        });
        after(() => {
            cache.vocabularyByClass = {};
        });
    });

});
