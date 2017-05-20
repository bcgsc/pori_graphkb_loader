'use strict';
const {Base, KBVertex, KBEdge, Record} = require('./base');
const Promise = require('bluebird');
const {Feature} = require('./feature');
const {AttributeError} = require('./error');
const _ = require('lodash');


const EVENT_TYPE = {
    STV: 'structural variant',
    CNV: 'copy number variant',
    MUT: 'mutation',
    RNA: 'RNA expression level variant',
    PROT: 'protein expression level variant',
    EPI: 'epigenetic variant'
};


const EVENT_SUBTYPE = {
    INS: 'insertion', 
    DEL: 'deletion', 
    SUB: 'substitution', 
    INV: 'inversion', 
    INDEL: 'indel', 
    GAIN: 'gain', 
    LOSS: 'loss', 
    TRANS: 'translocation', 
    ITRANS: 'inverted_translocation', 
    EXT: 'extension', 
    FS: 'frameshift',
    FUSION: 'fusion',
    DUP: 'duplication',
    ME: 'methylation',
    AC: 'acetylation',
    UB: 'ubiquitination'
    SPL: 'splice-site mutation'
}


const NOTATION_TO_SUBTYPE = new Map([
    ['ub', EVENT_SUBTYPE.UB],
    ['me', EVENT_SUBTYPE.ME],
    ['ac', EVENT_SUBTYPE.AC],
    ['fs', EVENT_SUBTYPE.FS],
    ['>', EVENT_SUBTYPE.SUB],
    ['delins', EVENT_SUBTYPE.INDEL],
    ['inv', EVENT_SUBTYPE.INV],
    ['ext', EVENT_SUBTYPE.EXT],
    ['del', EVENT_SUBTYPE.DEL],
    ['dup', EVENT_SUBTYPE.DUP],
    ['ins', EVENT_SUBTYPE.INS],
    ['copygain', EVENT_SUBTYPE.GAIN],
    ['copyloss', EVENT_SUBTYPE.LOSS],
    ['t', EVENT_SUBTYPE.TRANS]
    ['spl', EVENT_SUBTYPE.SPL]
]);


const ZYGOSITY = {
    HET: 'heterozygous',
    HOM: 'homozygous',
    SUB: 'subclonal'
}


class Event extends Base {
    
    static createClass(db) {
        const props = [
            {name: 'zygosity', type: 'string', mandatory: true, notNull: false},
            {name: 'germline', type: 'boolean', mandatory: true, notNull: false},
            {name: 'type', type: 'string', mandatory: true, notNull: true},
            {name: 'primary_feature', type: 'link', linkedClass: Feature.clsname, mandatory: true, notNull: true},
            {name: 'secondary_feature', type: 'link', linkedClass: Feature.clsname, mandatory: false, notNull: true}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    /**
     * checks validation that is shared between the two event classes and is not db dependant
     */
    static validateContent(content) {
        const args = Object.assign({germline: null, zygosity: null}, content); 
        if (! _.values(EVENT_TYPE).includes(args.type)) {
            throw new ControlledVocabularyError(`invalid/unsupported event type '${args.type}' expected one of ${_.values(EVENT_TYPE)}`);
        }
        if (args.type !== EVENT_TYPE.STV && args.secondary_feature) {
            throw new AttributeError('secondary features are only allowed for structural variant type events');
        }
        if (args.zygosity != null && ! _.values(ZYGOSITY).includes(args.zygosity)) {
            throw new ControlledVocabularyError(`invalid value for zygosity: ${args.zygosity}. Expected null or ${_.values(ZYGOSITY)}`);
        }
        if (args.zygosity === ZYGOSITY.SUB && args.germline === true) {
            throw new AttributeError('subclonal && germline cannot be specified together');
        }
        return args;
    }
}


class CategoryEvent extends Base {
    
    validateContent(content) {
        const args = Event.validateContent(content);
        return super.validateContent(args);
    }

    static createClass(db) {
        const props = [
            {name: 'term', type: 'string', mandatory: true, notNull: true}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Event.clsname, isAbstract: false, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    
    /**
     * assumes the linked objects already exists. If the linked objects @rid is not given they are selected from the db
     * this will throw an error if the selection is not unique
     */ 
    createRecord(where={}) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(where);
            args.primary_feature = args.primary_feature.content || args.primary_feature;
            if (args.secondary_feature) {
                args.secondary_feature = args.secondary_feature.content || args.secondary_feature;
            }
            let primary_feature, secondary_feature;
            Promise.all([
                args.primary_feature['@rid'] ? Promise.resolve(args.primary_feature) : this.selectExactlyOne(args.primary_feature),
                (args.secondary_feature == undefined || args.secondary_feature['@rid']) ? Promise.resolve(args.secondary_feature) : this.selectExactlyOne(args.secondary_feature)
            ]).then((pList) => {
                [primary_feature, secondary_feature] = pList;
                args.primary_feature = primary_feature['@rid'].toString();
                if (args.secondary_feature) {
                    args.secondary_feature = secondary_feature['@rid'].toString();
                }
                return this.dbClass.create(args);
            }).then((rec) => {
                rec.primary_feature = primary_feature.content || primary_feature;
                if (secondary_feature) {
                    rec.secondary_feature = secondary_feature.content || secondary_feature;
                }
                resolve(new Record(rec, this));
            }).catch((error) => {
                reject(error);
            });
        });
    }
}


class PositionalEvent extends Base {
    
    validateContent(content) {
        const args = Event.validateContent(content);
        this.constructor.subtypeValidation(args.prefix, args.subtype);
        return super.validateContent(args);
    }

    static createClass(db) {
        const props = [
            {name: 'prefix', type: 'string', mandatory: true, notNull: true},
            {name: 'start', type: 'link', mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: 'end', type: 'link', mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: 'untemplated_seq', type: 'string', mandatory: false, notNull: true},
            {name: 'reference_seq', type: 'string', mandatory: false, notNull: true},
            {name: 'subtype', type: 'string', mandatory: true, notNull: true},
            {name: 'terminating_aa', type: 'int', mandatory: false}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Event.clsname, isAbstract: false, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    createRecord(where={}) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(where);

            Promise.all([
                args.start['@rid'] ? Promise.resolve(args.start) : this.selectExactlyOne(args.start),
                args.end['@rid'] ? Promise.resolve(args.end) : this.selectExactlyOne(args.end),
                args.primary_feature['@rid'] ? Promise.resolve(args.primary_feature) : this.selectExactlyOne(args.primary_feature),
                args.secondary_feature == undefined || args.secondary_feature['@rid'] ? Promise.resolve(args.secondary_feature) : this.selectExactlyOne(args.secondary_feature)
            ]).then((pList) => {
                [args.start, args.end, args.primary_feature, args.secondary_feature] = pList;
                return this.dbClass.create(args);
            }).then((rec) => {
                resolve(new Record(rec, this));
            }).catch((error) => {
                reject(error);
            });
        });
    }
    
    /**
     * ensures that the subtype is one of the expected values for a given prefix.
     * some subtypes do not make sense with some prefixes. for example 'e' and 'insertion'
     */ 
    static subtypeValidation(prefix, subtype) {
        const validTypes = [];
        switch(prefix) {
            case 'p': {
                Array.prototype.push.apply(validTypes, [
                    EVENT_SUBTYPE.FS, 
                    EVENT_SUBTYPE.EXT, 
                    EVENT_SUBTYPE.ME, 
                    EVENT_SUBTYPE.AC, 
                    EVENT_SUBTYPE.UB,
                    EVENT_SUBTYPE.SPL
                ]);
            }
            case 'g':
            case 'c': {
                Array.prototype.push.apply(validTypes, [
                    EVENT_SUBTYPE.INS, 
                    EVENT_SUBTYPE.SUB, 
                    EVENT_SUBTYPE.INDEL, 
                    EVENT_SUBTYPE.LOSS, 
                    EVENT_SUBTYPE.GAIN
                ]);
            }
            case 'y': 
            case 'e': {
                Array.prototype.push.apply(validTypes, [
                    EVENT_SUBTYPE.DEL, 
                    EVENT_SUBTYPE.DUP, 
                    EVENT_SUBTYPE.FUSION, 
                    EVENT_SUBTYPE.TRANS, 
                    EVENT_SUBTYPE.ITRANS, 
                    EVENT_SUBTYPE.INV
                ]);
                break;
            }
            default: {
                throw new AttributeError(`invalid/unsupported prefix '${prefix}'`);
            }
        }
        if (! validTypes.includes(subtype)) {
            throw new AttributeError(`invalid value '${subtype}' for subtype. Prefix '${prefix}' allows subtypes: ${validTypes}`);
        }
    }
}



module.exports = {CategoryEvent, Event, PositionalEvent, EVENT_TYPE, EVENT_SUBTYPE, ZYGOSITY, NOTATION_TO_SUBTYPE};
