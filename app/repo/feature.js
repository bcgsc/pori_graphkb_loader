'use strict';
const {Base, KBVertex, KBEdge} = require('./base');
const {AttributeError} = require('./error');
const {Context} = require('./context');
const vocab = require('./cached/data').vocab;
const Promise = require('bluebird');

const FEATURE_BIOTYPE = {
    PROTEIN: 'protein',
    GENE: 'gene',
    EXON: 'exon',
    TRANSCRIPT: 'transcript',
    DOMAIN: 'domain',
    TEMPLATE: 'template'
};

const FEATURE_SOURCE = {
    HGNC: 'hgnc',
    ENSEMBL: 'ensembl',
    REFSEQ: 'refseq',
    LRG: 'lrg',
    GRC: 'genome reference consortium (human)',
    HUGO: 'hugo'
};

/**
 * @swagger
 * definitions:
 *  Feature:
 *      type: object
 *      properties:
 *          name:
 *              type: string
 *          biotype:
 *              type: string
 *          source:
 *              type: string
 *          source_id:
 *              type: string
 *          source_version:
 *              type: integer
 */
class Feature extends KBVertex {

    validateContent(content) {

        const args = Object.assign({source_version: null}, content);
        let namePattern = /\S+/;

        switch (args.source) {
            case FEATURE_SOURCE.HGNC:
                namePattern = /^[A-Z]([A-Z]|-|\d|orf)*$/;
                if (args.biotype !== FEATURE_BIOTYPE.GENE) {
                    throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case FEATURE_SOURCE.ENSEMBL:
                switch (args.biotype) {
                    case FEATURE_BIOTYPE.PROTEIN:
                        namePattern = /^ENSP\d+$/;
                        break;
                    case FEATURE_BIOTYPE.TRANSCRIPT:
                        namePattern = /^ENST\d+$/;
                        break;
                    case FEATURE_BIOTYPE.GENE:
                        namePattern = /^ENSG\d+$/;
                        break;
                    case FEATURE_BIOTYPE.EXON:
                        namePattern = /^ENSE\d+$/;
                        break;
                    default:
                        throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case FEATURE_SOURCE.REFSEQ:
                switch (args.biotype) {
                    case FEATURE_BIOTYPE.PROTEIN:
                        namePattern = /^NP_\d+$/;
                        break;
                    case FEATURE_BIOTYPE.TRANSCRIPT:
                        namePattern = /^NM_\d+$/;
                        break;
                    case FEATURE_BIOTYPE.GENE:
                        namePattern = /^NG_\d+$/;
                        break;
                    case FEATURE_BIOTYPE.TEMPLATE:
                        namePattern = /^NC_\d+$/;
                        break;
                    default:
                        throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case FEATURE_SOURCE.LRG:
                switch (args.biotype) {
                    case FEATURE_BIOTYPE.PROTEIN:
                        namePattern = /^LRG_\d+p\d+$/;
                        break;
                    case FEATURE_BIOTYPE.TRANSCRIPT:
                        namePattern = /^LRG_\d+t\d+$/;
                        break;
                    case FEATURE_BIOTYPE.GENE:
                        namePattern = /^LRG_\d+$/;
                        break;
                    default:
                        throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case FEATURE_SOURCE.GRC:
                if (args.biotype !== FEATURE_BIOTYPE.TEMPLATE) {
                    throw new AttributeError(`${args.source} type found unsupported biotype ${args.biotype}`);
                }
                break;
            case FEATURE_SOURCE.HUGO:
                if (args.biotype !== FEATURE_BIOTYPE.GENE) {
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
            Base.createClass({db, clsname: this.clsname, superClasses: Context.clsname, isAbstract: false, properties: props, indices: idxs})
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
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        for (let node of [tgt, src]) {
            if (node['@class'] === undefined) {
                node['@class'] = Feature.clsname;
            } else if (node['@class'] !== Feature.clsname && ! this.db.models[node['@class']].superClasses.includes(Feature.clsname)) {
                throw new AttributeError(`edge endpoint must be a descendant of ${Feature.clsname}. Found '${node['@class']}'`);
            }
        }
        if (src.biotype != tgt.biotype) {
            throw new AttributeError('cannot alias between features with unequal biotype');
        }
        if (src.source != tgt.source) {
            throw new AttributeError('cannot alias between features with unequal source');
        }
        if (src.source_version !== null && src.source_version >= tgt.source_version) {
            throw new AttributeError('source_version must increase in order to deprecate a feature node');
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        
        const props = [
            {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Feature.clsname},
            {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Feature.clsname},
        ];

        return new Promise((resolve, reject) => {

            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        for (let node of [tgt, src]) {
            if (node['@class'] === undefined) {
                node['@class'] = Feature.clsname;
            } else if (node['@class'] !== Feature.clsname && ! this.db.models[node['@class']].superClasses.includes(Feature.clsname)) {
                throw new AttributeError(`edge endpoint must be a descendant of ${Feature.clsname}. Found '${node['@class']}'`);
            }
        }
        if (src.biotype != tgt.biotype) {
            throw new AttributeError('cannot alias between features with unequal biotype');
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Feature.clsname},
                {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Feature.clsname},
            ];
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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

module.exports = {Feature, FeatureDeprecatedBy, FeatureAliasOf, FEATURE_SOURCE, FEATURE_BIOTYPE};
