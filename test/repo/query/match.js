const {expect} = require('chai');

const {match: {neighborhood, descendants}, Comparison} = require('./../../../app/repo/query');

const {stripSQL} = require('./util');


describe('treeQuery', () => {
    it('custom edges', () => {
        const {query, params} = descendants({
            whereClause: new Comparison('name', 'blargh'),
            modelName: 'Disease',
            edges: ['AliasOf']
        });
        expect(stripSQL(query)).to.equal('MATCH {class: Disease, WHERE: (name = :param0)}.out(\'AliasOf\'){WHILE: (out(\'AliasOf\').size() > 0 AND $depth < 50)} RETURN $pathElements');
        expect(params).to.eql({param0: 'blargh'});
    });
});


describe('neighborhood', () => {
    it('custom edges and depth', () => {
        const {query, params} = neighborhood({
            whereClause: new Comparison('name', 'blargh'),
            modelName: 'Disease',
            edges: ['AliasOf'],
            direction: 'both',
            depth: 10
        });
        expect(stripSQL(query)).to.equal('MATCH {class: Disease, WHERE: (name = :param0)}.both(\'AliasOf\'){WHILE: ($depth < 10)} RETURN $pathElements');
        expect(params).to.eql({param0: 'blargh'});
    });
});
