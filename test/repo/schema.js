const {expect} = require('chai');
const {types} = require('orientjs');

const {
    splitSchemaClassLevels,
    SCHEMA_DEFN
} = require('./../../app/repo/schema');
const {
    ClassModel,
    Property
} = require('./../../app/repo/model');


const OJS_TYPES = {};
for (const num of Object.keys(types)) {
    const name = types[num].toLowerCase();
    OJS_TYPES[name] = num;
}


describe('splitSchemaClassLevels', () => {
    it('splits dependency chain', () => {
        const schema = {
            grandparent: new ClassModel({name: 'grandparent'}),
            other: new ClassModel({name: 'other'})
        };
        schema.parent = new ClassModel({
            inherits: [schema.grandparent],
            name: 'parent',
            properties: {prop1: new Property({linkedClass: schema.other, name: 'prop1'})}
        });
        schema.child = new ClassModel({
            inherits: [schema.grandparent],
            properties: {child: new Property({linkedClass: schema.parent, name: 'child'})}
        });
        schema.grandparent._subclasses = [schema.parent, schema.child];
        const levels = splitSchemaClassLevels(schema);
        expect(levels).to.have.property('length', 3);
    });
});


describe('SCHEMA', () => {
    describe('PositionalVariant.formatRecord', () => {
        it('error on missing reference1', () => {
            expect(() => {
                SCHEMA_DEFN.PositionalVariant.formatRecord({
                    reference2: '#33:1',
                    break1Start: {'@class': 'ProteinPosition', pos: 1},
                    type: '#33:2',
                    createdBy: '#44:1'
                }, {addDefaults: true});
            }).to.throw('missing required attribute');
        });
        it('error on missing break1Start', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    reference1: '#33:1',
                    break2Start: {'@class': 'ProteinPosition', pos: 1, refAA: 'A'},
                    type: '#33:2',
                    createdBy: '#44:1'
                }, {addDefaults: true});
                console.error(formatted);
            }).to.throw('missing required attribute');
        });
        it('error on position without @class attribute', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    reference1: '#33:1',
                    break1Start: {pos: 1, refAA: 'A'},
                    type: '#33:2',
                    createdBy: '#44:1'
                }, {addDefaults: true});
                console.error(formatted);
            }).to.throw('positions must include the @class attribute');
        });
        it('error on break2End without break2Start', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    reference1: '#33:1',
                    break1Start: {'@class': 'ProteinPosition', pos: 1, refAA: 'A'},
                    type: '#33:2',
                    break2End: {'@class': 'ProteinPosition', pos: 10, refAA: 'B'},
                    createdBy: '#44:1'
                }, {addDefaults: true});
                console.error(formatted);
            }).to.throw('both start and end');
        });
        it('auto generates the breakRepr', () => {
            const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                reference1: '#33:1',
                type: '#33:2',
                createdBy: '#44:1',
                break1Start: {'@class': 'ProteinPosition', pos: 1, refAA: 'A'},
                break2Start: {'@class': 'ExonicPosition', pos: 1},
                break2End: {'@class': 'ExonicPosition', pos: 3}
            }, {addDefaults: true});
            expect(formatted).to.have.property('break1Repr', 'p.A1');
            expect(formatted).to.have.property('break2Repr', 'e.(1_3)');
        });
        it('ignores the input breakrepr if given', () => {
            const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                reference1: '#33:1',
                type: '#33:2',
                createdBy: '#44:1',
                break1Start: {'@class': 'ProteinPosition', pos: 1, refAA: 'A'},
                break1Repr: 'bad'
            }, {addDefaults: true});
            expect(formatted).to.have.property('break1Repr', 'p.A1');
        });
    });
});


describe('ClassModel', () => {
    describe('compareToDbClass', () => {
        const model = new ClassModel({
            name: 'Pathway',
            inherits: [{name: 'Ontology'}],
            properties: {prop1: new Property({name: 'prop1', type: 'string'})}
        });
        it('error on abstract mismatch', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    name: 'Pathway',
                    shortName: null,
                    defaultClusterId: -1,
                    properties: [{name: 'prop1', type: OJS_TYPES.string}],
                    superClass: 'Ontology'
                }, {});
            }).to.throw('does not match the database definition');
        });
        it('error on undefined property', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    name: 'Pathway',
                    shortName: null,
                    defaultClusterId: 65,
                    properties: [{name: 'prop2'}],
                    superClass: 'Ontology'
                }, {});
            }).to.throw('failed to find the property');
        });
        it('error on wrong property type', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    name: 'Pathway',
                    shortName: null,
                    defaultClusterId: 65,
                    properties: [{name: 'prop1', type: OJS_TYPES.integer}],
                    superClass: 'Ontology'
                }, {});
            }).to.throw('does not match the type');
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
    describe('queryProperties', () => {
        const child = new ClassModel({
            name: 'child',
            properties: {childProp: {name: 'childProp'}}
        });
        const parent = new ClassModel({name: 'parent', subclasses: [child], properties: {}});
        const grandparent = new ClassModel({
            name: 'grandparent',
            subclasses: [parent],
            properties: {grandProp: {name: 'grandProp'}}
        });
        it('fetches grandfathered properties', () => {
            const queryProp = grandparent.queryProperties;
            expect(queryProp).to.have.property('childProp');
            expect(queryProp).to.have.property('grandProp');
        });
        it('ok when no subclasses', () => {
            const queryProp = child.queryProperties;
            expect(Object.keys(queryProp)).to.eql(['childProp']);
        });
    });
    describe('inheritance', () => {
        const person = new ClassModel({
            name: 'person',
            properties: {
                gender: {name: 'gender', default: 'not specified'},
                name: {name: 'name', mandatory: true}
            }
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
                    req1: new Property({
                        name: 'req1', mandatory: true, nonEmpty: true, type: 'string'
                    }),
                    req2: new Property({
                        name: 'req2', mandatory: true, default: 1, type: 'integer'
                    }),
                    opt1: new Property({name: 'opt1'}),
                    opt2: new Property({
                        name: 'opt2', choices: [2, 3], nullable: true, default: 2, type: 'integer'
                    })
                }
            });
        });
        it('error on empty string', () => {
            expect(() => {
                model.formatRecord({
                    req1: ''
                }, {dropExtra: false, addDefaults: true});
            }).to.throw();
        });
        it('errors on un-cast-able input', () => {
            expect(() => {
                model.formatRecord({
                    req1: 2,
                    req2: 'f45'
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
                    thing: new Property({
                        name: 'thing',
                        type: 'embeddedset',
                        cast: x => x.toLowerCase().trim()
                    })
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
                    thing: new Property({
                        name: 'thing',
                        type: 'embeddedset',
                        cast: x => x.toLowerCase().trim()
                    })
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
                req1: 'term1', req2: '4'
            }, {dropExtra: false, addDefaults: false});
            expect(record).to.have.property('req1', 'term1');
            expect(record).to.have.property('req2', 4);
            expect(record).to.not.have.property('opt2');
            expect(record).to.not.have.property('opt1');
        });
        it('allows optional parameters', () => {
            const record = model.formatRecord({
                req1: 'term1', req2: '2', opt1: '2'
            }, {dropExtra: false, addDefaults: false});
            expect(record).to.have.property('req1', 'term1');
            expect(record).to.have.property('req2', 2);
            expect(record).to.have.property('opt1', '2');
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
