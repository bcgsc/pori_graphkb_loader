'use strict';
const {expect} = require('chai');
const {castUUID, looksLikeRID} = require('./../../app/repo/util');
const {parseQueryLanguage, MAX_JUMPS} = require('./../../app/routes/util');
const cache = require('./../../app/repo/cache');
const {ClassModel} = require('./../../app/repo/schema');
const {checkAccess, SelectionQuery, Follow, RELATED_NODE_DEPTH, Clause, Comparison, QUERY_LIMIT} = require('./../../app/repo/base');
const {PERMISSIONS} = require('./../../app/repo/constants');
const {types, RID}  = require('orientjs');
const qs = require('qs'); // to simulate express query parameter pparsing for tests


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
        expect(() => { new Follow([], 'both', null);}).to.throw();
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
            name: {name: 'name', mandatory: true, type: 'string'},
            child: {name: 'child', linkedModel: person, type: 'link'}
        }
    });
    const linkedModel = new ClassModel({
        name: 'other',
        properties: {
            thing: {name: 'thing', type: 'string'}
        }
    });
    const restrictiveModel = new ClassModel({
        name: 'example',
        properties: {
            requiredVar: {name: 'requiredVar', mandatory: true, type: 'string'},
            defaultVar: {name: 'defaultVar', type: 'string'},
            castable: {name: 'castable', type: 'string'},
            linkVar: {name: 'linkVar', linkedModel: linkedModel, type: 'link'},
            embeddedSetVar: {name: 'embeddedSetVar', type: 'embeddedset'}
        },
        defaults: {defaultVar: () => 'default'},
        cast: {
            castable: (x) => x.toLowerCase(),
            embeddedSetVar: (x) => x.toLowerCase().trim()
        }
    });
    it('errors on unexpected parameter', () => {
        expect(() => {
            const query = new SelectionQuery(parent, {name: new Comparison('blargh'), fuzzyMatch: 1, badAttr: new Comparison(null)});
            console.log(query);
        }).to.throw('unexpected attribute');
    });
    it('match in select when returnProperties and fuzzyMatch specified', () => {
        const query = new SelectionQuery(parent, {name: new Comparison('blargh'), fuzzyMatch: 1, returnProperties: ['name', 'child']}, {activeOnly: false});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT name, child FROM (MATCH {class: parent, where: (name = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1)}
            RETURN $pathElements)`
        ));
    });
    it('match in select when returnProperties and fuzzyMatch specified (activeOnly)', () => {
        const query = new SelectionQuery(parent, {name: new Comparison('blargh'), fuzzyMatch: 1, returnProperties: ['name', 'child']}, {activeOnly: true});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT name, child FROM (MATCH {class: parent, where: (deletedAt IS NULL AND name = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            RETURN $pathElements)`
        ));
    });
    it('throws error on invalid return property', () => {
        expect(() => {
            new SelectionQuery(parent, {name: new Comparison('blargh'), returnProperties: ['name', 'bad']});
        }).to.throw('is not a valid member of class');
    });
    it('match in select when returnProperties and ancestors specified');
    it('match in select when returnProperties and descendants specified');
    it('defaults to a match statement when fuzzyMatch is given', () => {
        const query = new SelectionQuery(parent, {name: new Comparison('blargh'), fuzzyMatch: 1}, {activeOnly: false});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `MATCH {class: parent, where: (name = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1)}
            RETURN $pathElements`
        ));
    });
    it('defaults to a match statement when fuzzyMatch is given (activeOnly)', () => {
        const query = new SelectionQuery(parent, {name: new Comparison('blargh'), fuzzyMatch: 1});
        const {query: statement} = query.toString();
        expect(statement).to.equal(stripSQL(
            `MATCH {class: parent, where: (deletedAt IS NULL AND name = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 1 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            RETURN $pathElements`
        ));
    });
    it('defaults to a select statement when no follow arguments are given', () => {
        const query = new SelectionQuery(parent, {name: new Comparison('blargh')}, {activeOnly: false});
        const {query: statement} = query.toString();
        expect(statement).to.equal('SELECT * FROM parent WHERE name = :param0');
    });
    it('defaults to a select statement when no follow arguments are given (active Only)', () => {
        const query = new SelectionQuery(parent, {name: new Comparison('blargh')}, {activeOnly: true});
        const {query: statement} = query.toString();
        expect(statement).to.equal('SELECT * FROM parent WHERE deletedAt IS NULL AND name = :param0');
    });
    it('parses simple query', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1')
        }, {activeOnly: false});
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1')});
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM example WHERE requiredVar = :param0');
        expect(params).to.eql({param0: 'vocab1'});
    });
    it('parses simple query (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1')
        }, {activeOnly: true});
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1'), deletedAt: new Comparison(null)});
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM example WHERE deletedAt IS NULL AND requiredVar = :param0');
        expect(params).to.eql({param0: 'vocab1'});
    });
    it('parses query without where clause', () => {
        const query = new SelectionQuery(restrictiveModel, {}, {activeOnly: false});
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({});
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM example');
        expect(params).to.eql({});
    });
    it('parses query without where clause (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {}, {activeOnly: true});
        expect(query).to.have.property('conditions');
        expect(query.conditions).to.eql({
            deletedAt: new Comparison(null)
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM example WHERE deletedAt IS NULL');
        expect(params).to.eql({});
    });
    it('parses and re-flattens simple subquery', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing')}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            'linkVar.thing': new Comparison('thing')
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal('SELECT * FROM example WHERE linkVar.thing = :param0 AND requiredVar = :param1');
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses and re-flattens simple subquery (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
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
        expect(statement).to.equal('SELECT * FROM example WHERE deletedAt IS NULL AND linkVar.deletedAt IS NULL AND linkVar.thing = :param0 AND requiredVar = :param1');
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses subquery with fuzzyMatch', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), fuzzyMatch: 4}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: new SelectionQuery(linkedModel, {
                thing: new Comparison('thing'),
                fuzzyMatch: 4}, {activeOnly: false}
            )
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE linkVar IN
                (SELECT @rid FROM
                    (MATCH {class: other, where: (thing = :param0)}.both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)} RETURN $pathElements))
                    AND requiredVar = :param1`));
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses subquery with fuzzyMatch (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), fuzzyMatch: 4}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), fuzzyMatch: 4, deletedAt: new Comparison(null)}),
            deletedAt: new Comparison(null)
        });
        const {query: statement, params} = query.toString();
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE deletedAt IS NULL AND linkVar IN
                (SELECT @rid FROM
                    (MATCH {class: other, where: (deletedAt IS NULL AND thing = :param0)}.both('AliasOf', 'DeprecatedBy'){while: ($depth < 4 AND deletedAt IS NULL), where: (deletedAt IS NULL)} RETURN $pathElements))
                    AND requiredVar = :param1`));
        expect(params).to.eql({param1: 'vocab1', param0: 'thing'});
    });
    it('parses subquery with fuzzyMatch and ancestors');
    it('parses subquery with fuzzyMatch and descendants');
    it('parses subquery with fuzzyMatch and both ancestors and descendants');
    it('parses subquery with ancestors (single edge class)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), ancestors: ['subclassof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), ancestors: ['subclassof']}, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .in('subclassof'){while: (in('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with ancestors (single edge class) (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), ancestors: ['subclassof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), ancestors: ['subclassof']})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (deletedAt IS NULL AND thing = :param0)}
                .in('subclassof'){while: (in('subclassof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with ancestors (multiple edge classes)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), ancestors: ['subclassof', 'aliasof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), ancestors: ['subclassof', 'aliasof']}, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .in('subclassof', 'aliasof'){while: (in('subclassof', 'aliasof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with ancestors (multiple edge classes) (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), ancestors: ['subclassof', 'aliasof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), ancestors: ['subclassof', 'aliasof']}),
            deletedAt: new Comparison(null)
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (deletedAt IS NULL AND thing = :param0)}
                .in('subclassof', 'aliasof'){while: (in('subclassof', 'aliasof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (single edge class)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), descendants: ['subclassof']}, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .out('subclassof'){while: (out('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (single edge class) (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), descendants: ['subclassof']})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (deletedAt IS NULL AND thing = :param0)}
                .out('subclassof'){while: (out('subclassof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (multiple edge classes)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof', 'aliasof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), descendants: ['subclassof', 'aliasof']}, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .out('subclassof', 'aliasof'){while: (out('subclassof', 'aliasof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with descendants (multiple edge classes) (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof', 'aliasof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            linkVar: new SelectionQuery(linkedModel, {thing: new Comparison('thing'), descendants: ['subclassof', 'aliasof']})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (deletedAt IS NULL AND thing = :param0)}
                .out('subclassof', 'aliasof'){while: (out('subclassof', 'aliasof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with both ancestors and descendants', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof'], ancestors: ['aliasof']}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            linkVar: new SelectionQuery(linkedModel, {
                thing: new Comparison('thing'),
                descendants: ['subclassof'],
                ancestors: ['aliasof']
            }, {activeOnly: false})
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (thing = :param0)}
                .in('aliasof'){while: (in('aliasof').size() > 0)},
                {class: other, where: (thing = :param0)}
                .out('subclassof'){while: (out('subclassof').size() > 0)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses subquery with both ancestors and descendants (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            linkVar: {thing: new Comparison('thing'), descendants: ['subclassof'], ancestors: ['aliasof']}
        });
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
            deletedAt: new Comparison(null),
            linkVar: new SelectionQuery(linkedModel, {
                thing: new Comparison('thing'),
                descendants: ['subclassof'],
                ancestors: ['aliasof']
            })
        });
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'thing', param1: 'vocab1'});
        expect(statement).to.equal(stripSQL(
            `SELECT * FROM example WHERE
            deletedAt IS NULL AND linkVar IN (SELECT @rid FROM
                (MATCH {class: other, where: (deletedAt IS NULL AND thing = :param0)}
                .in('aliasof'){while: (in('aliasof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)},
                {class: other, where: (deletedAt IS NULL AND thing = :param0)}
                .out('subclassof'){while: (out('subclassof').size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
                RETURN $pathElements))
            AND requiredVar = :param1`
        ));
    });
    it('parses query with fuzzyMatch', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            fuzzyMatch: 4
        }, {activeOnly: false});
        expect(query.conditions).to.eql({
            requiredVar: new Comparison('vocab1'),
        });
        expect(query.follow).to.eql([[new Follow(['AliasOf', 'DeprecatedBy'], 'both', 4, false)]]);
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1'});
        expect(statement).to.eql(stripSQL(
            `MATCH {class: example, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)} RETURN $pathElements`));
    });
    it('parses query with fuzzyMatch (activeOnly)', () => {
        const query = new SelectionQuery(restrictiveModel, {
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
            `MATCH {class: example, where: (deletedAt IS NULL AND requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4 AND deletedAt IS NULL), where: (deletedAt IS NULL)} RETURN $pathElements`));
    });
    it('parses query with fuzzyMatch and ancestors (activeOnly', () => {
        const query = new SelectionQuery(restrictiveModel, {
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
            `MATCH {class: example, where: (deletedAt IS NULL AND requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            .in(){while: (in().size() > 0 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4 AND deletedAt IS NULL), where: (deletedAt IS NULL)}
            RETURN $pathElements`));
    });
    it('parses query with fuzzyMatch and ancestors', () => {
        const query = new SelectionQuery(restrictiveModel, {
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
            `MATCH {class: example, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            .in(){while: (in().size() > 0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            RETURN $pathElements`));
    });
    it('parses query with fuzzyMatch and descendants', () => {
        const query = new SelectionQuery(restrictiveModel, {
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
            `MATCH {class: example, where: (requiredVar = :param0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            .out(){while: (out().size() > 0)}
            .both('AliasOf', 'DeprecatedBy'){while: ($depth < 4)}
            RETURN $pathElements`));
    });
    it('parses query with fuzzyMatch and both ancestors and descendants');
    it('parses query with ancestors');
    it('parses query with descendants');
    it('parses query with both ancestors and descendants');
    it('list attribute ok', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Clause('OR', ['vocab1', 'vocab2'])
        }, {activeOnly: false});
        expect(query.conditions).to.eql({requiredVar: new Clause('OR', ['vocab1', 'vocab2'])});
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param0: 'vocab1', param1: 'vocab2'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM example WHERE
            (requiredVar = :param0 OR requiredVar = :param1)`));
    });
    it('parses and flattens subquery list', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Clause('OR', ['vocab1', 'vocab2']),
            linkVar: {thing: new Clause('OR', ['thing1', 'thing2'])}
        }, {activeOnly: false});
        expect(query.conditions).to.eql({requiredVar: new Clause('OR', ['vocab1', 'vocab2']), 'linkVar.thing': new Clause('OR', ['thing1', 'thing2'])});
        const {query: statement, params} = query.toString();
        expect(params).to.eql({param2: 'vocab1', param3: 'vocab2', param0: 'thing1', param1: 'thing2'});
        expect(statement).to.eql(stripSQL(
            `SELECT * FROM example WHERE
            (linkVar.thing = :param0 OR linkVar.thing = :param1)
            AND (requiredVar = :param2 OR requiredVar = :param3)`));
    });
    it('cast for single attr', () => {
        const query = new SelectionQuery(restrictiveModel, {
            requiredVar: new Comparison('vocab1'),
            castable: new Comparison('MixedCase')
        }, {activeOnly: false});
        expect(query.conditions).to.eql({requiredVar: new Comparison('vocab1'), castable: new Comparison('mixedcase')});
    });
    it('cast for list values', () => {
        const query = new SelectionQuery(restrictiveModel, {
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
            `SELECT * FROM example WHERE
            (castable = :param0 OR castable = :param1)
            AND requiredVar = :param2`));
    });
    it('cast for list values to be compared against list attr', () => {
        const query = new SelectionQuery(restrictiveModel, {
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
            `SELECT * FROM example WHERE
            (embeddedSetVar CONTAINS :param0 OR embeddedSetVar CONTAINS :param1)
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
        it('defaults a string to an RID object if the expected property is a link', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'link'}},
                propertyNames: ['blargh']
            });
            const {query, params} = selectionQuery.conditionClause('blargh', new Clause('OR', ['4:0', null]));
            expect(query).to.equal('blargh = :param0 OR blargh IS NULL');
            expect(params).to.eql({param0: new RID('#4:0')});
        });
        it('defaults to OR statement', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'any'}},
                propertyNames: ['blargh']
            });
            const {query, params} = selectionQuery.conditionClause('blargh', new Clause('OR', ['monkey', null]));
            expect(query).to.equal('blargh = :param0 OR blargh IS NULL');
            expect(params).to.eql({param0: 'monkey'});
        });
        it('allows mix of AND and OR', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'any'}, name: {type: 'string'}},
                propertyNames: ['blargh', 'name']
            });
            const {query, params} = selectionQuery.conditionClause('blargh', new Clause('AND', [new Clause('OR', ['monkey', null]), 'blargh']));
            expect(query).to.equal('(blargh = :param0 OR blargh IS NULL) AND blargh = :param1');
            expect(params).to.eql({param0: 'monkey', param1: 'blargh'});
        });
        it('containstext operator', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'string'}, name: {type: 'string'}},
                propertyNames: ['blargh', 'name']
            });
            const {query, params} = selectionQuery.conditionClause('blargh', new Comparison('monkeys', '~'));
            expect(query).to.equal('blargh CONTAINSTEXT :param0');
            expect(params).to.eql({param0: 'monkeys'});
        });
        it('not operator', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'string'}, name: {type: 'string'}},
                propertyNames: ['blargh', 'name']
            });
            const {query, params} = selectionQuery.conditionClause('blargh', new Comparison('monkeys', '=', true));
            expect(query).to.equal('NOT (blargh = :param0)');
            expect(params).to.eql({param0: 'monkeys'});
        });
        it('not and containstext operators', () => {
            const selectionQuery = new SelectionQuery({
                name: 'model',
                formatQuery: () => { return {subqueries: {}, where: {}}; },
                properties: {blargh: {type: 'string'}, name: {type: 'string'}},
                propertyNames: ['blargh', 'name']
            });
            const {query, params} = selectionQuery.conditionClause('blargh', new Comparison('monkeys', '~', true));
            expect(query).to.equal('NOT (blargh CONTAINSTEXT :param0)');
            expect(params).to.eql({param0: 'monkeys'});
        });
        it('defaults to contains for non-object vs set/map/list types', () => {
            const model = new ClassModel({
                name: 'blargh',
                properties: {
                    monkeys: {name: 'monkeys', type: 'embeddedlist'}
                },
                propertyNames: ['monkeys']
            });
            const selectionQuery = new SelectionQuery(model);
            const {query} = selectionQuery.conditionClause('monkeys', new Comparison(2));
            expect(query).to.equal('monkeys CONTAINS :param0');
        });
        it('defaults to contains for set/map/list types', () => {
            const model = new ClassModel({
                name: 'blargh',
                properties: {
                    monkeys: {name: 'monkeys', type: 'embeddedlist'}
                },
                propertyNames: ['monkeys']
            });
            const selectionQuery = new SelectionQuery(model);
            const {query} = selectionQuery.conditionClause('monkeys', new Clause('OR', [2, 3]));
            expect(query).to.equal('monkeys CONTAINS :param0 OR monkeys CONTAINS :param1');
        });
    });
});


describe('parseQueryLanguage', () => {
    it('not operator', () => {
        const result = parseQueryLanguage(qs.parse('thing=!0'));
        expect(result).to.eql({thing: new Comparison('0', '=', true)});
    });
    it('OR operator', () => {
        const result = parseQueryLanguage(qs.parse('thing=2|3'));
        expect(result).to.eql({thing: new Clause('OR', ['2', '3'])});
    });
    describe('fuzzyMatch', () => {
        it('error on non-number', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('fuzzyMatch=r'));
            }).to.throw('to be a number');
        });
        it('error on negative number', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('fuzzyMatch=-2'));
            }).to.throw('must be a number between 0 and');
        });
        it(`error on number greater than limit ${MAX_JUMPS}`, () => {
            expect(() => {
                parseQueryLanguage(qs.parse(`fuzzyMatch=${MAX_JUMPS + 1}`));
            }).to.throw('must be a number between 0 and');
        });
        it('ok for valid number', () => {
            let result = parseQueryLanguage(qs.parse('fuzzyMatch=1'));
            expect(result).to.eql({fuzzyMatch: 1});
            result = parseQueryLanguage(qs.parse(`fuzzyMatch=${MAX_JUMPS}`));
            expect(result).to.eql({fuzzyMatch: MAX_JUMPS});
        });
    });
    describe('neighbors', () => {
        it('error on non-number', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('neighbors=r'));
            }).to.throw('to be a number');
        });
        it('error on negative number', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('neighbors=-2'));
            }).to.throw('must be a number between 0 and');
        });
        it(`error on number greater than limit ${MAX_JUMPS}`, () => {
            expect(() => {
                parseQueryLanguage(qs.parse(`neighbors=${MAX_JUMPS + 1}`));
            }).to.throw('must be a number between 0 and');
        });
        it('ok for valid number', () => {
            let result = parseQueryLanguage(qs.parse('neighbors=1'));
            expect(result).to.eql({neighbors: 1});
            result = parseQueryLanguage(qs.parse(`neighbors=${MAX_JUMPS}`));
            expect(result).to.eql({neighbors: MAX_JUMPS});
        });
    });
    describe('limit', () => {
        it('error on non-number', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('limit=r'));
            }).to.throw('to be a number');
        });
        it('error on negative number', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('limit=-2'));
            }).to.throw('must be a positive integer greater than');
        });
        it(`error on number greater than limit ${QUERY_LIMIT}`, () => {
            expect(() => {
                parseQueryLanguage(qs.parse(`limit=${QUERY_LIMIT + 1}`));
            }).to.throw('must be a number between 1 and');
        });
        it('ok for valid number', () => {
            let result = parseQueryLanguage(qs.parse('limit=1'));
            expect(result).to.eql({limit: 1});
        });
    });
    describe('skip', () => {
        it('error on non-number', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('skip=r'));
            }).to.throw('to be a number');
        });
        it('error on zero', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('skip=0'));
            }).to.throw('must be a positive');
        });
        it('ok for valid number', () => {
            let result = parseQueryLanguage(qs.parse('skip=1'));
            expect(result).to.eql({skip: 1});
        });
    });
    describe('descendants', () => {
        it('splits list', () => {
            const result = parseQueryLanguage(qs.parse('descendants=thing,other'));
            expect(result).to.eql({descendants: ['thing', 'other']});
        });
        it('removes empty strings', () => {
            const result = parseQueryLanguage(qs.parse('descendants='));
            expect(result).to.eql({descendants: []});
        });
        it('ignores trailing commas', () => {
            const result = parseQueryLanguage(qs.parse('descendants=thing,,'));
            expect(result).to.eql({descendants: ['thing']});
        });
        it('errors on list', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('descendants=1&descendants=2'));
            }).to.throw('cannot be specified multiple times');
        });
    });
    describe('ancestors', () => {
        it('splits list', () => {
            const result = parseQueryLanguage(qs.parse('ancestors=thing,other'));
            expect(result).to.eql({ancestors: ['thing', 'other']});
        });
        it('removes empty strings', () => {
            const result = parseQueryLanguage(qs.parse('ancestors='));
            expect(result).to.eql({ancestors: []});
        });
        it('ignores trailing commas', () => {
            const result = parseQueryLanguage(qs.parse('ancestors=thing,,'));
            expect(result).to.eql({ancestors: ['thing']});
        });
        it('errors on list', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('ancestors=1&ancestors=2'));
            }).to.throw('cannot be specified multiple times');
        });
    });
    describe('returnProperties', () => {
        it('splits list', () => {
            const result = parseQueryLanguage(qs.parse('returnProperties=thing,other'));
            expect(result).to.eql({returnProperties: ['thing', 'other']});
        });
        it('removes empty strings', () => {
            const result = parseQueryLanguage(qs.parse('returnProperties='));
            expect(result).to.eql({returnProperties: []});
        });
        it('ignores trailing commas', () => {
            const result = parseQueryLanguage(qs.parse('returnProperties=thing,,'));
            expect(result).to.eql({returnProperties: ['thing']});
        });
        it('errors on list', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('returnProperties=1&returnProperties=2'));
            }).to.throw('cannot be specified multiple times');
        });
    });
    describe('activeOnly', () => {
        it('can be true', () => {
            const result = parseQueryLanguage(qs.parse('activeOnly=1'));
            expect(result).to.eql({activeOnly: true});
        });
        it('can be false', () => {
            let result = parseQueryLanguage(qs.parse('activeOnly=f'));
            expect(result).to.eql({activeOnly: false});
            result = parseQueryLanguage(qs.parse('activeOnly=false'));
            expect(result).to.eql({activeOnly: false});
            result = parseQueryLanguage(qs.parse('activeOnly=0'));
            expect(result).to.eql({activeOnly: false});
        });
    });
    it('containstext operator', () => {
        const result = parseQueryLanguage(qs.parse('thing=~other'));
        expect(result).to.eql({thing: new Comparison('other', '~')});
    });
    it('multiple values', () => {
        const result = parseQueryLanguage(qs.parse('thing=1&thing=2'));
        expect(result).to.eql({thing: new Clause('AND', ['1', '2'])});
    });
    describe('subquery support', () => {
        it('not operator', () => {
            const result = parseQueryLanguage(qs.parse('thing[a]=1&thing[b]=!2'));
            expect(result).to.eql({thing: {a: new Comparison('1'), b: new Comparison('2', '=', true)}});
        });
        it('OR operator', () => {
            const result = parseQueryLanguage(qs.parse('thing[a]=1&thing[b]=2|3'));
            expect(result).to.eql({thing: {a: new Comparison('1'), b: new Clause('OR', ['2', '3'])}});
        });
        it('cast in subquery', () => {
            const input = `source[@type]=d&
                source[@class]=Source&
                source[name]=oncotree&
                source[version]=2018-06-01&
                source[createdAt]=1528923952899&
                source[createdBy]=#41:0&
                source[uuid]=739d22e8-7750-46b3-bce5-3f0b8f47e7e6&
                source[@rid]=#18:1&
                source[@version]=1&
                name=Dysembryoplastic Neuroepithelial Tumor&
                sourceId=DNT`.replace(/[\n\s]+/g, '');
            const result = parseQueryLanguage(qs.parse(input));
            expect(result).to.have.property('source');
            expect(result.source).to.have.property('@rid');
            expect(result.source['@rid']).to.eql(new Comparison('#18:1'));
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
                cast: {thing: (x) => x.toLowerCase().trim()}
            });
            const record = model.formatRecord({
                thing: ['aThinNG', 'another THING']
            }, {dropExtra: false, addDefaults: true});
            expect(record).to.have.property('thing');
            expect(record.thing).to.eql(['athinng', 'another thing']);
        });
        it('cast inheritied embedded types', () => {
            model = new ClassModel({
                name: 'example',
                properties: {
                    thing: {name: 'thing', type: 'embeddedset'}
                },
                cast: {thing: (x) => x.toLowerCase().trim()}
            });
            const childModel = new ClassModel({
                name: 'child',
                inherits: [model]
            });
            const record = childModel.formatRecord({
                thing: ['aThinNG', 'another THING']
            }, {dropExtra: false, addDefaults: true});
            expect(record).to.have.property('thing');
            expect(record.thing).to.eql(['athinng', 'another thing']);
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
