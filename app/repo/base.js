'use strict';
const {AttributeError, ControlledVocabularyError, MultipleResultsFoundError, NoResultFoundError} = require('./error');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');
const moment = require('moment');
const cache = require('./cached/data');
const Promise = require('bluebird');



const errorJSON = function(error) {
    return {type: error.type, message: error.message};
};

/**
 * @returns {Promise} if resolved, returns {orientjs.Property[]} array of properties from the current class and inherited classes
 * otherwise returns an {Error}
 */
const getAllProperties = (cls) => {
    return new Promise((resolve, reject) => {
        let properties = cls.properties;
        if (cls.superClass !== null) {
            cls.db.class.get(cls.superClass)
                .then((result) => {
                    return getAllProperties(result);
                }).then((props) => {
                    resolve(_.concat(properties, props));
                }).catch((error) => {
                    reject(error);
                });
        } else {
            resolve(properties);
        }
    });
};

const softGetRID = (record) => {
    if (record['@rid'] !== undefined) {
        return `#${record['@rid'].cluster}:${record['@rid'].position}`;
    } else {
        return record;
    }
};

/**
 * @class
 */
class Base {
    /**
     * @param {orientjs.Class} dbClass the class loaded from the database
     * @param {orientjs.Property[]} properties array of properties associated with this class (including inherited)
     */
    constructor(dbClass, properties=[]) {
        this.dbClass = dbClass;
        this.properties = properties;
    }
    /**
     * computed property, convenience method to get the names of the properties for this class
     * @returns {string[]} property names
     */
    get propertyNames() {
        return Array.from(this.properties, ({name}) => name);
    }

    /**
     * @returns {boolean} if the current class is an abstract class
     **/
    get isAbstract() {
        if (_.isEqual(this.dbClass.clusterIds, [-1])) {
            return true;
        } else {
            return false;
        }
    }

    validateContent(content) {
        const args = { // default arguments
            uuid : uuidV4(),
            version: 0,
            created_at: moment().valueOf(),
            deleted_at: null
        };
        let subcache = cache.vocab[this.constructor.clsname];
        for (let key of Object.keys(content)) {
            if (content[key] === undefined) {
                delete content[key];
                continue;
            }
            if (this.constructor.createType == 'edge' && (key == 'in' || key == 'out')) {
            } else if (! _.includes(this.propertyNames, key)) {
                throw new AttributeError(`invalid attribute ${key}`);
            }
            let value = content[key];
            if (subcache !== undefined && subcache[key] !== undefined && subcache[key][value] === undefined) {
                throw new ControlledVocabularyError(
                    `controlled term ${key} in class ${this.constructor.clsname} is not an allowed value: ${subcache[key][content[key]]}`);
            }
            args[key] = content[key]; // overrides the defaults if given
        }
        for (let prop of this.properties) {
            if (prop.mandatory) {
                if (args[prop.name] === undefined) {
                    throw new AttributeError(`mandatory property ${prop.name} was not specified`);
                }
            }
            if (args[prop.name] !== undefined) {
                if (prop.notNull && args[prop.name] === null) {
                    throw new AttributeError(`violated notNull constraint of ${prop.name} property`);
                }
                if (prop.min != undefined && args[prop.name] != null && args[prop.name] < prop.min) {
                    throw new AttributeError(`${args[prop.name]} is below the allowed minimum: ${prop.min}`);
                }
            }
        }
        return args;
    }

    /**
     * create new record
     * @param  {object} where record content
     * @return {Promise}  if resolved returns ? otherwise returns the db error
     */
    createRecord(where={}) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(where);
            this.dbClass.create(args)
                .then((result) => {
                    resolve(result);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    
    /**
     * select from the current class given the where filters
     *
     * @param {object} where filters for the select
     * @throws MultipleResultsFoundError if more than one record is selected
     * @throws NoResultFoundError if no records are selected
     * @returns {Promise}
     */
    selectExactlyOne(where={}) {
        return new Promise((resolve, reject) => {
            this.select(where, false, 1, true)
                .then((recList) => {
                    resolve(recList[0]);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    select(where={}, activeOnly=false, exactlyN=null, ignoreAtPrefixed=true) {
        return new Promise((resolve, reject) => {
            const clsname = where['@class'] == undefined ? this.constructor.clsname : where['@class'];
            const selectionWhere = Object.assign({}, where);
            if (ignoreAtPrefixed) {
                for (let key of Object.keys(selectionWhere)) {
                    if (key.startsWith('@')) {
                        delete selectionWhere[key];
                    }
                }
            }
            if (activeOnly) {
                selectionWhere.deleted_at = null;
            }
            const query = this.dbClass.db.select().from(clsname).where(selectionWhere);
            let stat = query.buildStatement();
            for (let key of Object.keys(query._state.params)) {
                stat = stat.replace(':' + key, `"${query._state.params[key]}"`);
            }
            query.all()
                .then((reclist) => {
                    if (exactlyN !== null) {
                        if (reclist.length == 0) {
                            if (exactlyN === 0) {
                                resolve([]);
                            } else {
                                reject(new NoResultFoundError(stat));
                            }
                        } else if (exactlyN != reclist.length) {
                            reject(new MultipleResultsFoundError(stat + `returned ${reclist.length} results but expected ${exactlyN} results`));
                        } else {
                            resolve(reclist);
                        }
                    } else {
                        resolve(reclist);
                    }
                }, (error) => {
                    reject(error);
                });
        });
    }

    deleteRecord(where) {
        return new Promise((resolve, reject) => {
            this.selectExactlyOne(where)
                .then((record) => {
                    record.deleted_at = null;
                    return this.dbClass.db.record.update(record);
                }).then((updatedRecord) => {
                    resolve(updatedRecord);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    /**
     * update an existing record. This will be based on the uuid or the record and
     * will create a copy of the current record, a history edge, and then will edit the
     * current record. This will be wrapped in a transaction. Will need to ensure the
     *
     * @param  {object} where record content
     * @return {Promise}  if resolved returns ? otherwise returns the db error
     */
    updateRecord(where={}) {
        return new Promise((resolve, reject) => {
            // get the record from the db
            if (where.uuid == undefined) {
                throw new AttributeError('uuid is a required parameter');
            }
            this.selectExactlyOne({uuid: where.uuid})
                .then((record) => {
                    const required_matches = ['uuid', 'deleted_at','version', 'created_at'];
                    for (let m of required_matches) {
                        if (where[m] !== undefined && where[m] !== record[m]) {
                            throw new Error(`Concurrency error. Updating an out-of-date record. Property ${m}: ${where[m]} and ${record[m]}`);
                        }
                    }
                    const duplicate = {};
                    const timestamp = moment().valueOf();
                    const updates = {
                        version: record.version + 1,
                        created_at: timestamp
                    };

                    // create a copy of the current record
                    for (let key of Object.keys(record)) {
                        if (! key.startsWith('@')) {
                            duplicate[key] = record[key];
                        }
                    }
                    for (let key of Object.keys(where)) {
                        if (! key.startsWith('@') && key !== 'version') {
                            updates[key] = where[key];
                        }
                    }

                    duplicate['deleted_at'] = timestamp; // set the deletion time
                    // start the transaction
                    var commit = this.dbClass.db
                        .let('updatedRID', (tx) => {
                            // update the existing node
                            return tx.update(`${record['@rid'].toString()}`).set(updates).return('AFTER @rid');
                        }).let('duplicate', (tx) => {
                            //duplicate the old node
                            return tx.create(this.constructor.createType, this.constructor.clsname)
                                .set(duplicate);
                        }).let('historyEdge', (tx) => {
                            //connect the nodes
                            return tx.create(History.createType, History.clsname)
                                .from('$updatedRID')
                                .to('$duplicate');
                        }).commit();
                    commit.return('$updatedRID').one()
                        .then((rid) => {
                            return this.dbClass.db.record.get(rid);
                        }).then((record) => {
                            resolve(record);
                        }).catch((error) => {
                            reject(error);
                        });
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    /**
     * the name of the class
     * @type {string}
     */
    static get clsname() {
        let clsname = this.name;
        clsname = clsname.replace(/([a-z])([A-Z])/g, '$1_$2');
        return clsname.toLowerCase();
    }
    /**
     * load class from the database
     *
     * @param {orientjs.Db} db the database object
     * @returns {Promise} a new class instance or an error
     */
    static loadClass(db) {
        return new Promise((resolve, reject) => {
            db.class.get(this.clsname)
                .then((cls) => {
                    getAllProperties(cls)
                        .then((props) => {
                            resolve(new this(cls, props));
                        }).catch((error) => {
                            reject(error);
                        });
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    /**
     * create a new class in the database
     *
     * @param {Object} opt the input options
     * @param {orientjs.Db} opt.db the database object
     * @param {Object[]} opt.properties property specifications
     * @param {Object[]} opt.indices indices to create
     * @param {boolean} opt.isAbstract true if the class to be created an abstract class
     * @param {string} opt.clsname name of the class
     * @param {string} opt.superClass class(es) to inherit
     *
     * @returns {Promise} on resolve returns a instance of Base (or subclass) otherwise Error
     */
    static createClass(opt) {
        // extend versioning if not versioning
        return new Promise((resolve, reject) => {
            // preliminary error checking and defaults
            opt.properties = opt.properties || [];
            opt.indices = opt.indices || [];
            opt.isAbstract = opt.isAbstract || false;

            if (opt.clsname === undefined || opt.superClasses === undefined || opt.db === undefined) {
                reject(new AttributeError(
                    `required attribute was not defined: clsname=${opt.clsname}, superClasses=${opt.superClasses}, db=${opt.db}`));
            } else {
                opt.db.class.create(opt.clsname, opt.superClasses, null, opt.isAbstract) // create the class first
                    .then((cls) => {
                        // add the properties
                        Promise.all(Array.from(opt.properties, (prop) => cls.property.create(prop)))
                            .then(() => {
                                // create the indices
                                return Promise.all(Array.from(opt.indices, (i) => opt.db.index.create(i)));
                            }).then(() => {
                                resolve();
                            }).catch((error) => {
                                reject(error);
                            });

                    }).catch((error) => {
                        reject(error);
                    });
            }
        });
    }
}

/**
 * creates the abstract super class "versioning" and adds it as the super class for V and E
 *
 * @param {orientjs.Db} db the database instance
 * @returns {Promise} returns a promise which returns nothing on resolve and an error on reject
 */
class KBVertex extends Base {
    
    static get createType() {
        return 'vertex';
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
                {name: 'version', type: 'integer', mandatory: true, notNull: true},
                {name: 'created_at', type: 'long', mandatory: true, notNull: true},
                {name: 'deleted_at', type: 'long', mandatory: true, notNull: false}
            ];
            const idxs = [
                {
                    name: `${this.clsname}_version`,
                    type: 'unique',
                    properties: ['uuid', 'version'],
                    'class':  this.clsname
                },
                {
                    name: `${this.clsname}_single_null_deleted_at`,
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['uuid', 'deleted_at'],
                    'class':  this.clsname
                }
            ];

            Base.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: true, properties: props, indices: idxs})
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

class KBEdge extends Base {

    static get createType() {
        return 'edge';
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
                {name: 'version', type: 'integer', mandatory: true, notNull: true},
                {name: 'created_at', type: 'long', mandatory: true, notNull: true},
                {name: 'deleted_at', type: 'long', mandatory: true, notNull: false}
            ];
            const idxs = [
                {
                    name: `${this.clsname}_version`,
                    type: 'unique',
                    properties: ['uuid', 'version'],
                    'class':  this.clsname
                },
                {
                    name: `${this.clsname}_single_null_deleted_at`,
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['uuid', 'deleted_at'],
                    'class':  this.clsname
                }
            ];

            Base.createClass({db, clsname: this.clsname, superClasses: 'E', isAbstract: true, properties: props, indices: idxs})
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
     *
     */
    createRecord(data={}) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(data);
            // select both records from the db
            Promise.all([
                this.selectExactlyOne(data.in),
                this.selectExactlyOne(data.out)
            ]).then((recList) => {
                let [src, tgt] = recList;
                for (let key of Object.keys(data.in)) {
                    if (key === '@rid' && data.in[key].toString() !== src[key].toString() || key !== '@rid' && data.in[key] !== src[key]) {
                        throw new Error(`Record pulled from DB differs from input on attr ${key}: ${src[key]} vs ${data.in[key]}`);
                    }
                }
                for (let key of Object.keys(data.out)) {
                    if (key === '@rid' && data.out[key].toString() !== tgt[key].toString() || key !== '@rid' && data.out[key] !== tgt[key]) {
                        throw new Error(`Record pulled from DB differs from input on attr ${key}: ${tgt[key]} vs ${data.out[key]}`);
                    }
                }
                delete args.out;
                delete args.in;
                // now create the edge
                this.dbClass.db.create(this.constructor.createType, this.constructor.clsname)
                    .from(src['@rid'].toString()).to(tgt['@rid'].toString()).set(args).one()
                    .then((result) => {
                        return this.selectExactlyOne(result);
                    }).then((result) => {
                        resolve(result);
                    }).catch((error) => {
                        console.log(error);
                        reject(error);
                    });
            }).catch((error) => {
                reject(error);
            });
        });
    }
}

class History extends Base {

    static get createType() {
        return 'edge';
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                //{name: 'user', type: 'link', mandatory: true, notNull: true, readOnly: true, linkedClass: 'user'},
                {name: 'comment', type: 'string', mandatory: false, notNull: true, readOnly: true}
            ];

            Base.createClass({db, clsname: this.clsname, superClasses: 'E', isAbstract: false, properties: props})
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

module.exports = {Base, History, KBVertex, KBEdge, softGetRID, errorJSON};
