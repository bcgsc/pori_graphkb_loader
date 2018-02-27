'use strict';
const {Base, KBVertex, Record, KBUser, getAttribute} = require('./base');
const Promise = require('bluebird');
const {Feature} = require('./feature');
const {Range, Position} = require('./position');
const {Context} = require('./context');
const {AttributeError, ControlledVocabularyError} = require('./error');
const _ = require('lodash');


const EVENT_TYPE = {
    STV: 'structural variant',
    CNV: 'copy number variant',
    MUT: 'mutation',
    RNA: 'rna expression level variant',
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
    ITRANS: 'inverted translocation', 
    EXT: 'extension', 
    FS: 'frameshift',
    FUSION: 'fusion',
    DUP: 'duplication',
    ME: 'methylation',
    AC: 'acetylation',
    UB: 'ubiquitination',
    SPL: 'splice-site'
};


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
    ['t', EVENT_SUBTYPE.TRANS],
    ['spl', EVENT_SUBTYPE.SPL],
    ['fusion', EVENT_SUBTYPE.FUSION]
]);


const ZYGOSITY = {
    HET: 'heterozygous',
    HOM: 'homozygous',
    SUB: 'subclonal'
};


class Event extends KBVertex {
    
    static createClass(db) {
        const props = [
            {name: 'zygosity', type: 'string', mandatory: true, notNull: false},
            {name: 'germline', type: 'boolean', mandatory: true, notNull: false},
            {name: 'type', type: 'string', mandatory: true, notNull: true},
            {name: 'absence_of', type: 'boolean', mandatory: true, notNull: true},
            {name: 'collection_method', type: 'string', mandatory: false},
            {name: 'primary_feature', type: 'link', linkedClass: Feature.clsname, mandatory: true, notNull: true},
            {name: 'secondary_feature', type: 'link', linkedClass: Feature.clsname, mandatory: false, notNull: true}
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: Context.clsname, isAbstract: true, properties: props})
            .then(() => {
                return this.loadClass(db);
            });
    }

    /**
     * checks validation that is shared between the two event classes and is not db dependant
     */
    static validateContent(content) {
        const args = Object.assign({germline: null, zygosity: null, absence_of: false}, content); 
        if (! _.values(EVENT_TYPE).includes(args.type)) {
            return Promise.reject(new ControlledVocabularyError(`invalid/unsupported event type '${args.type}' expected one of ${_.values(EVENT_TYPE)}`));
        }
        if (args.type !== EVENT_TYPE.STV && args.secondary_feature) {
            return Promise.reject(new AttributeError('secondary features are only allowed for structural variant type events'));
        }
        if (args.zygosity != null && ! _.values(ZYGOSITY).includes(args.zygosity)) {
            return Promise.reject(new ControlledVocabularyError(`invalid value for zygosity: ${args.zygosity}. Expected null or ${_.values(ZYGOSITY)}`));
        }
        if (args.zygosity === ZYGOSITY.SUB && args.germline === true) {
            return Promise.reject(new AttributeError('subclonal && germline cannot be specified together'));
        }
        return Promise.resolve(args);
    }
}


class CategoryEvent extends KBVertex {
    
    validateContent(content) {
        return Event.validateContent(content)
            .then((args) => {
                return super.validateContent(args);
            });
    }

    static createClass(db) {
        const props = [
            {name: 'term', type: 'string', mandatory: true, notNull: true}
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: Event.clsname, isAbstract: false, properties: props})
            .then(() => {
                return this.loadClass(db);
            });
        
    }
    
    /**
     * assumes the linked objects already exists. If the linked objects @rid is not given they are selected from the db
     * this will throw an error if the selection is not unique
     */ 
    createRecord(where={}, user) {
        where.created_by = true;
        return this.validateContent(where)
            .then((args) => {
                let pfeature = new Record(args.primary_feature, Feature.clsname); 
                let sfeature = args.secondary_feature ? new Record(args.secondary_feature, Feature.clsname) : null;
                const feat = this.db.models.Feature;
                
                // if selecting the positions fail then create them
                return Promise.all([
                    pfeature.hasRID ? Promise.resolve(pfeature) : feat.selectExactlyOne(pfeature.content),
                    sfeature == null || sfeature.hasRID ? Promise.resolve(sfeature) : feat.selectExactlyOne(sfeature.content),
                    user.rid != null ? Promise.resolve(user) : this.selectExactlyOne({username: user, '@class': KBUser.clsname})
                ]).then((pList) => {
                    [pfeature, sfeature, user] = pList;
                    args.primary_feature = pfeature.rid;
                    if (sfeature == null) {
                        delete args.secondary_feature;
                    } else {
                        args.secondary_feature = sfeature.rid;
                    }
                    args.created_by = user.rid;
                    return this.conn.create(args);
                }).then((rec) => {
                    rec.primary_feature = pfeature.content;
                    rec.secondary_feature = sfeature ? sfeature.content : sfeature;
                    rec.created_by = user.content;
                    return new Record(rec, this.constructor.clsname);
                });
            });
    }
}


class PositionalEvent extends KBVertex {
    
    validateContent(content, positionClassName) {
        const pClass = this.db.models[positionClassName];
        const range = this.db.models[Range.clsname];
        return Event.validateContent(content)
            .then((args) => {
                // ensure the subtype is appropriate for this coordinate system
                try {
                    this.constructor.subtypeValidation(pClass.constructor.prefix, args.subtype);
                } catch (error) {
                    throw error;
                }
                // validate the start/end positions
                let startPromise, endPromise;
                if (args.start.start !== undefined) {  // start is a range
                    startPromise = range.validateContent(args.start, positionClassName);
                } else {
                    startPromise = pClass.validateContent(args.start);
                }
                if (args.end != undefined) {
                    if ([EVENT_SUBTYPE.SUB, EVENT_SUBTYPE.FS, EVENT_SUBTYPE.EXT, EVENT_SUBTYPE.SPL].includes(args.subtype)) {
                        throw new AttributeError(`a range is inappropriate for the given subtype: ${args.subtype}`);
                    }
                    if (args.end.start !== undefined) {  // end is a range
                        endPromise = range.validateContent(args.end);
                    } else {
                        endPromise = pClass.validateContent(args.end);
                    }
                    
                } else {
                    if (args.subtype == EVENT_SUBTYPE.INS) {
                        throw new AttributeError('insertions must be specified with a range');
                    }
                    delete args.end;
                    endPromise = Promise.resolve(undefined);
                }
                
                return Promise.all([startPromise, endPromise])
                    .then(([start, end]) => {
                        // compare the positions to ensure that the start <= end position
                        if (end != undefined) {
                            try {
                                const comp = pClass.constructor.compare(start.start || start, end.end || end);
                                if (comp >= 0 && args.secondary_feature == null){
                                    throw new AttributeError('start position cannot be greater than end position');
                                }
                            } catch (e) {
                                if (! (e instanceof TypeError)) {
                                    throw e;
                                }
                            }
                            args.end = end;
                        }
                        args.start = start;

                        if (args.untemplated_seq != undefined) {
                            if (args.subtype === EVENT_SUBTYPE.SUB && args.untemplated_seq.length !== 1) {
                                throw new AttributeError('substitution untemplated_seq must be a single character');
                            }
                            if (args.subtype == EVENT_SUBTYPE.DEL) {
                                throw new AttributeError('deletions cannot have untemplated sequence');
                            }
                        }
                        if (args.reference_seq != undefined) {
                            if (args.subtype === EVENT_SUBTYPE.SUB && args.reference_seq.length !== 1) {
                                throw new AttributeError('substitution reference_seq must be a single character');
                            }
                            if (args.subtype == EVENT_SUBTYPE.INS) {
                                throw new AttributeError('insertions cannot have reference sequence');
                            }
                        }
                        if (args.termination_aa != undefined && args.subtype !== EVENT_SUBTYPE.FS) {
                            throw new AttributeError('only frameshift mutations may have termination_aa specified');
                        }

                        return super.validateContent(args);
                    });
            });
    }

    static createClass(db) {
        const props = [
            {name: 'start', type: 'embedded', mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: 'end', type: 'embedded', mandatory: false, notNull: true, linkedClass: Position.clsname},
            {name: 'untemplated_seq', type: 'string', mandatory: false, notNull: true},
            {name: 'reference_seq', type: 'string', mandatory: false, notNull: true},
            {name: 'subtype', type: 'string', mandatory: true, notNull: true},
            {name: 'termination_aa', type: 'integer', mandatory: false}
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: Event.clsname, isAbstract: false, properties: props})
            .then(() => {
                return this.loadClass(db);
            });
    }


    createRecord(where={}, user, positionClassName) {
        if (positionClassName == null) {
            positionClassName = getAttribute({'start': where.start, 'end': where.end}, '@class', 4);
        }
        if (positionClassName == null) {
            return Promise.reject(new Error('positionClassName was not given and could not be parsed'));
        }
        where.created_by = true;
        return this.validateContent(where, positionClassName)
            .then((args) => {
                let pfeature = new Record(args.primary_feature, Feature.clsname); 
                let sfeature = args.secondary_feature ? new Record(args.secondary_feature, Feature.clsname) : null;
                const feat = this.db.models.Feature;
                // if selecting the positions fail then create them
                return Promise.all([
                    pfeature.hasRID ? Promise.resolve(pfeature) : feat.selectExactlyOne(pfeature.content),
                    sfeature == null || sfeature.hasRID ? Promise.resolve(sfeature) : feat.selectExactlyOne(sfeature.content),
                    user.rid != null ? Promise.resolve(user) : this.selectExactlyOne({username: user, '@class': KBUser.clsname})
                ]).then(([pfeature, sfeature, user]) => {
                    args.primary_feature = pfeature.rid;
                    if (sfeature == null) {
                        delete args.secondary_feature;
                    } else {
                        args.secondary_feature = sfeature.rid;
                    }
                    args.created_by = user.rid;
                    return this.conn.create(args);
                }).then((rec) => {
                    rec.primary_feature = pfeature.content;
                    rec.secondary_feature = sfeature ? sfeature.content : sfeature;
                    rec.created_by = user.content;
                    return new Record(rec, this.constructor.clsname);
                });
            });
        
    }
    
    /**
     * ensures that the subtype is one of the expected values for a given prefix.
     * some subtypes do not make sense with some prefixes. for example 'e' and 'insertion'
     */ 
    static subtypeValidation(prefix, subtype, continuous=true) {
        const validTypes = [];
        if (continuous) {
            switch(prefix) {
                case 'p': 
                    Array.prototype.push.apply(validTypes, [
                        EVENT_SUBTYPE.FS, 
                        EVENT_SUBTYPE.EXT, 
                        EVENT_SUBTYPE.ME, 
                        EVENT_SUBTYPE.AC, 
                        EVENT_SUBTYPE.UB,
                        EVENT_SUBTYPE.SPL
                    ]);
                    // fall through
                
                case 'g':
                    // fall through
                case 'c': 
                    Array.prototype.push.apply(validTypes, [
                        EVENT_SUBTYPE.INS, 
                        EVENT_SUBTYPE.SUB, 
                        EVENT_SUBTYPE.INDEL 
                    ]);
                    // fall through
                case 'y': 
                    Array.prototype.push.apply(validTypes, [
                        EVENT_SUBTYPE.LOSS, 
                        EVENT_SUBTYPE.GAIN
                    ]);
                    // fall through
                case 'e': 
                    break;
                
                default: 
                    throw new AttributeError(`invalid/unsupported prefix '${prefix}'`);
                
            }
        }
        Array.prototype.push.apply(validTypes, [
            EVENT_SUBTYPE.DEL, 
            EVENT_SUBTYPE.DUP, 
            EVENT_SUBTYPE.FUSION, 
            EVENT_SUBTYPE.TRANS, 
            EVENT_SUBTYPE.ITRANS, 
            EVENT_SUBTYPE.INV
        ]);
        if (! validTypes.includes(subtype)) {
            throw new AttributeError(`invalid value '${subtype}' for subtype. Prefix '${prefix}' allows subtypes: ${validTypes}`);
        }
    }
}



module.exports = {CategoryEvent, Event, PositionalEvent, EVENT_TYPE, EVENT_SUBTYPE, ZYGOSITY, NOTATION_TO_SUBTYPE};
