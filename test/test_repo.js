'use strict';
const {expect} = require('chai');
const {castUUID} = require('./../app/repo/util');
const cache = require('./../app/repo/cache');
const {ClassModel} = require('./../app/repo/schema');
const {checkAccess} = require('./../app/repo/base');
const {PERMISSIONS} = require('./../app/repo/constants');


describe('util.castUUID', () => {

    it('returns valid uuid', () => {
        const uuid = '933fd4de-5bd6-471c-9869-a7601294ea6e';
        expect(castUUID(uuid)).to.equal(uuid);
    });
    it('errors on bad uuid', () => {
        const uuid = '933fd4de-5bd6-471c-4ea6e';
        expect(() => { castUUID(uuid) } ).to.throw();
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
                properties: [{name: 'prop1', mandatory: true}],
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
                properties: [{name: 'prop1', mandatory: false}],
                superClass: null
            });
            expect(parsed.optional).to.eql(['prop1']);
        });
        it('parses default values', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                properties: [{name: 'prop1', mandatory: false, defaultValue: 1, type: '1'}],  // orientjs types integer
                superClass: null
            });
            expect(parsed.defaults).to.have.property('prop1');
        });
        it('parses integer cast', () => {
            const parsed = ClassModel.parseOClass({
                name: 'name',
                shortName: null,
                properties: [{name: 'prop1', mandatory: false, defaultValue: 1, type: '7'}],  // orientjs String type
                superClass: null
            });
            expect(parsed.cast).to.have.property('prop1');
        });
    });
    describe('inheritance', () => {
        const person = new ClassModel({name: 'person', required: ['name'], optional: ['gender'], defaults: {'gender': () => 'not specified'}})
        const child = new ClassModel({name: 'child', required: ['mom'], optional: ['age'], cast: {'mom': (x) => x.toLowerCase() }, inherits: [person], edgeRestrictions: []});

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
        })
    })
    describe('formatRecord', () => {
        let model;
        before(() => {
             model = new ClassModel({
                 name: 'example',
                 required: ['req1', 'req2'],
                 optional: ['opt1', 'opt2'],
                 defaults: {req2: () => 1, opt2: () => 2},
                 cast: {req1: (x) => x.toLowerCase() }
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
        })
    });

});
