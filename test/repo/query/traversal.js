const {expect} = require('chai');

const {
    util: {
        castDecimalInteger, castToRID
    }, schema: SCHEMA_DEFN
} = require('@bcgsc/knowledgebase-schema');

const {Traversal, constants: {TRAVERSAL_TYPE}} = require('./../../../app/repo/query');

const DISEASE_PROPS = SCHEMA_DEFN.Disease.queryProperties;
const ALL_PROPS = Object.assign(SCHEMA_DEFN.E.queryProperties, SCHEMA_DEFN.V.queryProperties);
const EVIDENCE_LEVEL = SCHEMA_DEFN.EvidenceLevel.queryProperties;


describe('Traversal', () => {
    describe('parse & toString', () => {
        it('direct', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, 'name');
            const exp = new Traversal({attr: 'name', property: DISEASE_PROPS.name});
            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('name');
        });
        it('link', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.LINK,
                attr: 'name'
            });
            const exp = new Traversal({type: TRAVERSAL_TYPE.DIRECT, attr: 'name', property: DISEASE_PROPS.name});
            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('name');
        });
        it('edge', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE
            });
            const exp = new Traversal({type: TRAVERSAL_TYPE.EDGE, cast: castToRID});
            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('bothE()');
        });
        it('edge with classes', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                edges: ['ImpliedBy', 'SupportedBy']
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                cast: castToRID,
                edges: ['ImpliedBy', 'SupportedBy']
            });
            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('bothE(\'ImpliedBy\', \'SupportedBy\')');
        });
        it('edge with classes and direction', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                edges: ['ImpliedBy', 'SupportedBy'],
                direction: 'out'
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                cast: castToRID,
                edges: ['ImpliedBy', 'SupportedBy'],
                direction: 'out'
            });
            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('outE(\'ImpliedBy\', \'SupportedBy\')');
        });
        it('edge with direction', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in'
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                cast: castToRID,
                direction: 'in'
            });
            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('inE()');
        });
        it('edge.direct', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: 'name'
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: new Traversal({attr: 'name', property: ALL_PROPS.name})
            });
            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('inE().name');
        });
        it('edge.link.direct', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: {
                    type: TRAVERSAL_TYPE.LINK,
                    attr: 'level',
                    child: 'name'
                }
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                cast: castToRID,
                child: new Traversal({
                    attr: 'level',
                    type: TRAVERSAL_TYPE.LINK,
                    property: ALL_PROPS.level,
                    child: new Traversal({attr: 'name', property: EVIDENCE_LEVEL.name})
                })
            });
            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('inE().level.name');
        });
        it('edge.outV.direct', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: {
                    type: TRAVERSAL_TYPE.LINK,
                    attr: 'outV',
                    child: 'name'
                }
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: new Traversal({
                    attr: 'outV()',
                    type: TRAVERSAL_TYPE.LINK,
                    cast: castToRID,
                    child: new Traversal({attr: 'name', property: ALL_PROPS.name})
                })
            });

            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('inE().outV().name');
        });
        it('edge.size()', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: 'size()'
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: new Traversal({
                    attr: 'size()',
                    cast: castDecimalInteger
                })
            });

            expect(parsed).to.eql(exp);
            expect(parsed.toString()).to.equal('inE().size()');
        });
        it('attributes post edges', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                edges: ['ImpliedBy'],
                direction: 'out',
                child: {
                    attr: 'inV',
                    child: {
                        attr: 'reference1',
                        child: 'name'
                    }
                }
            });
            const exp = new Traversal({
                type: 'EDGE',
                edges: ['ImpliedBy'],
                direction: 'out',
                child: new Traversal({
                    attr: 'inV()',
                    cast: castToRID,
                    child: new Traversal({
                        attr: 'reference1',
                        child: 'name'
                    })
                })
            });
            expect(parsed.toString()).to.eql(exp.toString());
            expect(parsed.toString()).to.equal('outE(\'ImpliedBy\').inV().reference1.name');
        });
        it('error on attr for edge', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, null, {attr: 'edge', type: TRAVERSAL_TYPE.EDGE, child: null});
            }).to.throw('do not require the attr');
        });
        it('error on invalid edge name', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, null, {type: TRAVERSAL_TYPE.EDGE, edges: ['blarghHasMonkey']});
            }).to.throw('Invalid Edge');
        });
        it('error on invalid direction', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, null, {type: TRAVERSAL_TYPE.EDGE, direction: 'blargh'});
            }).to.throw('Invalid direction');
        });
        it('error on link missing attr', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {type: TRAVERSAL_TYPE.LINK, child: {}});
            }).to.throw('attr is a required property');
        });
        it('error on link bad traversal', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {type: TRAVERSAL_TYPE.LINK, attr: 'name', child: {}});
            }).to.throw('does not have a linkedClass');
        });
        it('bad property link', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {type: TRAVERSAL_TYPE.LINK, attr: 'blargh', child: {}});
            }).to.throw('has no definition');
        });
        it('bad direct property', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {attr: 'blargh'});
            }).to.throw('has no property');
        });
    });
    describe('terminalProperty', () => {
        it('returns the current property for barren traversal', () => {
            const traversal = new Traversal({attr: 'name', property: 'thing'});
            expect(traversal.terminalProperty()).to.equal('thing');
        });
        it('returns the nested property', () => {
            const traversal = new Traversal({attr: 'name', property: 'thing', child: new Traversal({property: 'thing2', child: 'thing3'})});
            expect(traversal.terminalProperty()).to.equal(null);
        });
    });
    describe('terminalCast', () => {
        it('returns the current property for barren traversal', () => {
            const traversal = new Traversal({attr: 'name', cast: 'thing'});
            expect(traversal.terminalCast()).to.equal('thing');
        });
        it('returns the nested property', () => {
            const traversal = new Traversal({attr: 'name', cast: 'thing', child: new Traversal({cast: 'thing2', child: 'thing3'})});
            expect(traversal.terminalCast()).to.equal(null);
        });
    });
});
