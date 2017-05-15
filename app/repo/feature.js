'use strict';
const {Base, KBVertex, KBEdge} = require('./base');
const {AttributeError} = require('./error');
const vocab = require('./cached/data').vocab;
const Promise = require('bluebird');

const BIOTYPE = {
    PROTEIN: 'protein',
    GENE: 'gene',
    EXON: 'exon',
    TRANSCRIPT: 'transcript',
    DOMAIN: 'domain',
    TEMPLATE: 'template'
};

const SOURCE = {
    HGNC: 'hgnc',
    ENSEMBL: 'ensembl',
    REFSEQ: 'refseq',
    LRG: 'lrg',
    GRC: 'genome reference consortium (human)'
};

class Feature extends KBVertex {

    validateContent(content) {

        const args = Object.assign({source_version: null}, content);
        let namePattern = /\S+/;

        switch (args.source) {
            case SOURCE.HGNC:
                namePattern = /^[A-Z]([A-Z]|-|\d|orf)*$/;
                if (args.biotype !== BIOTYPE.GENE) {
                    throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case SOURCE.ENSEMBL:
                switch (args.biotype) {
                    case BIOTYPE.PROTEIN:
                        namePattern = /^ENSP\d+$/;
                        break;
                    case BIOTYPE.TRANSCRIPT:
                        namePattern = /^ENST\d+$/;
                        break;
                    case BIOTYPE.GENE:
                        namePattern = /^ENSG\d+$/;
                        break;
                    case BIOTYPE.EXON:
                        namePattern = /^ENSE\d+$/;
                        break;
                    default:
                        throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case SOURCE.REFSEQ:
                switch (args.biotype) {
                    case BIOTYPE.PROTEIN:
                        namePattern = /^NP_\d+$/;
                        break;
                    case BIOTYPE.TRANSCRIPT:
                        namePattern = /^NM_\d+$/;
                        break;
                    case BIOTYPE.GENE:
                        namePattern = /^NG_\d+$/;
                        break;
                    default:
                        throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case SOURCE.LRG:
                switch (args.biotype) {
                    case BIOTYPE.PROTEIN:
                        namePattern = /^LRG_\d+p\d+$/;
                        break;
                    case BIOTYPE.TRANSCRIPT:
                        namePattern = /^LRG_\d+t\d+$/;
                        break;
                    case BIOTYPE.GENE:
                        namePattern = /^LRG_\d+$/;
                        break;
                    default:
                        throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case SOURCE.GRC:
                if (args.biotype !== BIOTYPE.TEMPLATE) {
                    throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            default:
                throw new AttributeError(`unexpected feature source ${args.source} is not configured for validation`);
        }
        if (namePattern.exec(args.name) === null) {
            throw new AttributeError(`feature name '${args.name}' did not match the expected pattern '${namePattern}'`);
        }
        return super.validateContent(args);
    }

    static createClass(db) {
        const props = [
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'source', type: 'string', mandatory: true, notNull: true},
            {name: 'source_version', type: 'integer', mandatory: true, notNull: false},
            {name: 'source_id', type: 'string', mandatory: false},
            {name: 'biotype', type: 'string', mandatory: true, notNull: true}
        ];

        const idxs = [
            {
                name: `${this.clsname}_active_source_source_version_name`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['source', 'source_version', 'name', 'deleted_at'],
                'class':  this.clsname
            }
        ];

        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: false, properties: props, indices: idxs})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}

/**
 * edges responsible for tracking deprecation in external sources
 */
class FeatureDeprecatedBy extends KBEdge {

    validateContent(content) {
        const args = super.validateContent(content);
        for (let key of ['source', 'biotype']) {
            if (args.in[key] !== args.out[key]) {
                throw new AttributeError(`cannot deprecate a feature using a different ${key}`);
            }
        }
        if (args.in.source_version !== null && args.in.source_version >= args.out.source_version) {
            throw new AttributeError('source_version must increase in order to deprecate a feature node');
        }
        args.in['@class'] = args.in['@class'] != undefined ? args.in['@class'] : Feature.clsname;
        args.out['@class'] = args.out['@class'] != undefined ? args.out['@class'] : Feature.clsname;
        return args;
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {

            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: []})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

}


class FeatureAliasOf extends KBEdge {
    
    validateContent(content) {
        const args = super.validateContent(content);
        if (args.in.biotype !== args.out.biotype) {
            throw new AttributeError(`cannot alias a feature with a different biotype`);
        }
        args.in['@class'] = args.in['@class'] != undefined ? args.in['@class'] : Feature.clsname;
        args.out['@class'] = args.out['@class'] != undefined ? args.out['@class'] : Feature.clsname;
        return args;
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {

            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: []})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}

module.exports = {Feature, FeatureDeprecatedBy, FeatureAliasOf, SOURCE, BIOTYPE};
