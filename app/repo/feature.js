'use strict';
const {Base, KBVertex} = require('./base');
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
    GRC: 'genome reference consortium'
};

class Feature extends Base {
    
    validateContent(content) {
        
        const args = Object.assign({source_version: null}, content);
        let namePattern = /\S+/;
        let versionPattern = /^\d+$/;

        switch (args.source) {
            case SOURCE.HGNC:
                namePattern = /^[A-Z]([A-Z]|-|\d|orf)*$/;
                versionPattern = /^\d\d\d\d-\d\d-\d\d$/;
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
                versionPattern = /^(GRCh\d+|hg18)$/;
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
        if (args.source_version !== null && versionPattern.exec(args.source_version) === null) {
            throw new AttributeError(`feature source version '${args.source_version}' did not match the expected pattern '${versionPattern}'`);
        }
        return super.validateContent(args);
    }

    static createClass(db) {
        const props = [
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'source', type: 'string', mandatory: true, notNull: true},
            {name: 'source_version', type: 'string', mandatory: true, notNull: false},
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
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: false, properties: props})
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


module.exports = {Feature, SOURCE, BIOTYPE};
