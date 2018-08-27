const {expect} = require('chai');
const qs = require('qs'); // to simulate express query parameter pparsing for tests

const {parseQueryLanguage, MAX_JUMPS} = require('./../../app/routes/util');
const {
    Clause, Comparison
} = require('./../../app/repo/query');
const {QUERY_LIMIT} = require('./../../app/repo/base');


describe('parseQueryLanguage', () => {
    it('not operator', () => {
        const result = parseQueryLanguage(qs.parse('thing=!0'));
        expect(result).to.eql({thing: new Comparison('0', '=', true)});
    });
    it('OR operator', () => {
        const result = parseQueryLanguage(qs.parse('thing=2|3'));
        expect(result).to.eql({thing: new Clause('OR', ['2', '3'])});
    });
    it('minimum word size', () => {
        expect(() => {
            parseQueryLanguage(qs.parse('name=~th'));
        }).to.throw('Word is too short');
    });
    it('split minimum word size', () => {
        expect(() => {
            parseQueryLanguage(qs.parse('name=~th andt'));
        }).to.throw('Word is too short');
    });
    it('splits words with spaces', () => {
        const result = parseQueryLanguage(qs.parse('name=~other thing'));
        expect(result).to.eql({
            name: new Clause('AND', [
                new Comparison('other', 'CONTAINSTEXT'), new Comparison('thing', 'CONTAINSTEXT')
            ])
        });
    });
    describe('query immediate edges', () => {
        it('edge target v', () => {
            expect(parseQueryLanguage(qs.parse('supportedby[v]=44:3'))).to.eql({
                supportedby: {v: new Comparison('44:3')}
            });
        });
        it('edge direction', () => {
            expect(parseQueryLanguage(qs.parse('supportedby[direction]=out'))).to.eql({
                supportedby: {direction: 'out'}
            });
        });
        it('edge direction bad input error', () => {
            expect(() => {
                parseQueryLanguage(qs.parse('supportedby[direction]=blargh'));
            }).to.throw('direction must be');
        });
        it('edge multiplicity', () => {
            expect(parseQueryLanguage(qs.parse('supportedby[size]=3'))).to.eql({
                supportedby: {size: 3}
            });
        });
        it('edge target set of nodes', () => {
            expect(parseQueryLanguage(qs.parse('supportedby[v][0]=44:3&supportedby[v][1]=44:4'))).to.eql({
                supportedby: {
                    v: new Clause('AND', [
                        new Comparison('44:3'),
                        new Comparison('44:4')
                    ])
                }
            });
        });
        it('error when size is not a positive integer', () => {
            expect(() => parseQueryLanguage(qs.parse('supportedby[size]=-1'))).to.throw('must be a positive integer');
        });
    });
    it('parses null string', () => {
        const result = parseQueryLanguage(qs.parse('name=null'));
        expect(result).to.eql({name: new Comparison(null)});
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
            const result = parseQueryLanguage(qs.parse('limit=1'));
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
            const result = parseQueryLanguage(qs.parse('skip=1'));
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
        expect(result).to.eql({thing: new Comparison('other', 'CONTAINSTEXT')});
    });
    it('array', () => {
        const result = parseQueryLanguage(qs.parse('thing=1&thing=2'));
        expect(result).to.eql({
            thing: new Clause(
                'AND',
                [new Comparison('1'), new Comparison('2')]
            )
        });
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
