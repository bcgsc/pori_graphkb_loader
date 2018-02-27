'use strict';
const {expect} = require('chai');
const {Base, isObject, getAttribute} = require('./../../app/repo/base');


describe('isObject', () => {
    it('false on null', () => {
        expect(isObject(null)).to.be.false;
    });
    it('false on undefined', () => {
        expect(isObject(undefined)).to.be.false;
    });
    it('true on object', () => {
        expect(isObject({'name': 'bob'})).to.be.true;
    });
    it('false on integer', () => {
        expect(isObject(1)).to.be.false;
    });
    it('false on string', () => {
        expect(isObject('string')).to.be.false;
    });
    it('false on float', () => {
        expect(isObject(1.0)).to.be.false;
    });
    it('false on boolean', () => {
        expect(isObject(false)).to.be.false;
        expect(isObject(true)).to.be.false;
    });
});


describe('parseSelectWhere', () => {
    const base = new Base();
    it('error if not object', () => {
        expect(() => { base.parseSelectWhere(1); }).to.throw(Error);
    });
    it('ok for simple non-nested case', () => {
        const obj = {'name': 'bob', 'age': 22};
        expect(base.parseSelectWhere(obj)).to.eql(obj);
    });
    it('ok for 1 level of nesting', () => {
        const obj = {'name': 'bob', 'parent': {'name': 'kate'}};
        const result = {'name': 'bob', 'parent.name': 'kate'};
        expect(base.parseSelectWhere(obj)).to.eql(result);
    });
    it('ok for 2 levels of nesting', () => {
        const obj = {'name': 'bob', 'parent': {'name': 'kate', 'parent': {'name': 'george'}}};
        const result = {'name': 'bob', 'parent.name': 'kate', 'parent.parent.name': 'george'};
        expect(base.parseSelectWhere(obj)).to.eql(result);
    });
    it('drops @type attributes from select clause', () => {
        const obj = {'name': 'bob', 'age': 22, '@type': 'd', '@class': 'person'};
        const result = {'name': 'bob', 'age': 22, '@class': 'person'};
        expect(base.parseSelectWhere(obj)).to.eql(result);
    });
    it('replaces nested objects with @rid if provided', () => {
        const obj = {'name': 'bob', 'parent': {'name': 'kate', '@rid': '#1:3', 'parent': {'name': 'george'}}};
        const result = {'name': 'bob', 'parent': '#1:3'};
        expect(base.parseSelectWhere(obj)).to.eql(result);
    });
    it('ok for empty input', () => {
        expect(base.parseSelectWhere({})).to.eql({});
    });
});


describe('getAttribute', () => {
    it('ok for attr in first level', () => {
        const obj = {'name': 'bob', 'other': 'other'};
        expect(getAttribute(obj, 'name')).to.equal('bob');
    });
    it('does not recurse on maxDepth 0', () => {
        const obj = {'parent': {'name': 'kate'}};
        expect(getAttribute(obj, 'name')).to.be.null;
    });
    it('does recurse on maxDepth 1', () => {
        const obj = {'parent': {'name': 'kate'}};
        expect(getAttribute(obj, 'name', 1)).to.equal('kate');
    });
});
