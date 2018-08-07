const {expect} = require('chai');
const {types} = require('orientjs');

const {ClassModel, splitSchemaClassLevels} = require('./../../app/repo/schema');


const OJS_TYPES = {};
for (const num of Object.keys(types)) {
    const name = types[num].toLowerCase();
    OJS_TYPES[name] = num;
}


describe('splitSchemaClassLevels', () => {
    it('splits dependency chain', () => {
        const schema = {
            grandparent: {name: 'grandparent'},
            parent: {inherits: ['grandparent'], name: 'parent', properties: [{linkedClass: 'other'}]},
            child: {inherits: ['grandparent'], properties: [{linkedClass: 'parent'}], name: 'child'},
            other: {name: 'other'}
        };
        const levels = splitSchemaClassLevels(schema);
        expect(levels).to.have.property('length', 3);
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
            }, {});
            expect(parsed).to.have.property('name', 'Pathway');
            expect(parsed).to.have.property('isAbstract', false);
            expect(parsed.required).to.eql([]);
            expect(parsed.optional).to.eql([]);
            expect(parsed.defaults).to.eql({});
            expect(parsed.inherits).to.eql([]);
        });
        it('parses abstract class', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                defaultClusterId: -1,
                properties: [{name: 'prop1', mandatory: true, type: OJS_TYPES.any}],
                superClass: null
            }, {properties: [{type: 'any', name: 'prop1'}]});
            expect(parsed).to.have.property('name', 'name');
            expect(parsed).to.have.property('isAbstract', true);
            expect(parsed.required).to.eql(['prop1']);
            expect(parsed.optional).to.eql([]);
            expect(parsed.defaults).to.eql({});
            expect(parsed.inherits).to.eql([]);
        });
        it('parses optional properties', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                properties: [{name: 'prop1', mandatory: false, type: OJS_TYPES.any}],
                superClass: null
            }, {properties: [{type: 'any', name: 'prop1'}]});
            expect(parsed.optional).to.eql(['prop1']);
        });
        it('parses default values', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                properties: [{
                    name: 'prop1', mandatory: false, defaultValue: 1, type: OJS_TYPES.integer
                }],
                superClass: null
            }, {properties: [{type: 'integer', name: 'prop1'}]});
            expect(parsed.defaults).to.have.property('prop1');
        });
        it('parses integer cast', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                properties: [{
                    name: 'prop1', mandatory: false, defaultValue: 1, type: OJS_TYPES.string
                }],
                superClass: null
            }, {properties: [{type: 'string', name: 'prop1'}]});
        });
    });
    describe('routeName', () => {
        it('does not alter ary suffix', () => {
            const model = new ClassModel({name: 'vocabulary'});
            expect(model.routeName).to.equal('/vocabulary');
        });
        it('does not alter edge class names', () => {
            const model = new ClassModel({name: 'edge', isEdge: true});
            expect(model.routeName).to.equal('/edge');
        });
        it('changes ys to ies', () => {
            const model = new ClassModel({name: 'ontology'});
            expect(model.routeName).to.equal('/ontologies');
        });
        it('adds s to regular class names', () => {
            const model = new ClassModel({name: 'statement'});
            expect(model.routeName).to.equal('/statements');
        });
    });
    describe('subclassModel', () => {
        const child = new ClassModel({name: 'child'});
        const parent = new ClassModel({name: 'parent', subclasses: [child]});
        const grandparent = new ClassModel({name: 'grandparent', subclasses: [parent]});
        it('errors when the class does not exist', () => {
            expect(() => {
                grandparent.subClassModel('badName');
            }).to.throw('was not found as a subclass');
        });
        it('returns an immeadiate subclass', () => {
            expect(parent.subClassModel('child')).to.eql(child);
        });
        it('returns a subclass of a subclass recursively', () => {
            expect(grandparent.subClassModel('child')).to.eql(child);
        });
    });
    describe('inheritance', () => {
        const person = new ClassModel({
            name: 'person',
            properties: {
                gender: {name: 'gender'},
                name: {name: 'name', mandatory: true}
            },
            defaults: {gender: () => 'not specified'}
        });
        const child = new ClassModel({
            name: 'child',
            properties: {
                mom: {name: 'mom', mandatory: true, cast: x => x.toLowerCase()},
                age: {name: 'age'}
            },
            inherits: [person],
            edgeRestrictions: []
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
                    req1: {name: 'req1', mandatory: true, cast: x => x.toLowerCase()},
                    req2: {name: 'req2', mandatory: true},
                    opt1: {name: 'opt1'},
                    opt2: {name: 'opt2', choices: [2, 3], notNull: false}
                },
                defaults: {req2: () => 1, opt2: () => 2}
            });
        });
        it('errors on un-cast-able input', () => {
            expect(() => {
                model.formatRecord({
                    req1: 2
                }, {dropExtra: false, addDefaults: true});
            }).to.throw();
        });
        it('errors on un-expected attr', () => {
            expect(() => {
                model.formatRecord({
                    req1: 2,
                    req2: 1,
                    badAttr: 3
                }, {dropExtra: false, ignoreExtra: false, addDefaults: false});
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
                    thing: {name: 'thing', type: 'embeddedset', cast: x => x.toLowerCase().trim()}
                }
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
                    thing: {name: 'thing', type: 'embeddedset', cast: x => x.toLowerCase().trim()}
                }
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
        it('error on invalid enum choice', () => {
            expect(() => {
                model.formatRecord({
                    req1: 'term1', opt2: 4, req2: 1
                }, {dropExtra: false, addDefaults: false});
            }).to.throw('not in the list of valid choices');
        });
        it('allow nullable enum', () => {
            const record = model.formatRecord({
                req1: 'term1', opt2: null, req2: 1
            }, {dropExtra: false, addDefaults: false});
            expect(record).to.have.property('req1', 'term1');
            expect(record).to.have.property('opt2', null);
        });
    });
});
