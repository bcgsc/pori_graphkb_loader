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
            if (! _.includes(this.propertyNames, key)) {
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
     * @param  {object} opt record content
     * @return {Promise}  if resolved returns ? otherwise returns the db error
     */
    createRecord(opt={}) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(opt);
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
            const query = this.dbClass.db.select().from(this.constructor.clsname).where(where);
            const stat = query.buildStatement();
            query.all()
                .then((reclist) => {
                    if (reclist.length == 0) {
                        reject(new NoResultFoundError(stat));
                    } else if (reclist.length > 1) {
                        reject(new MultipleResultsFoundError(stat));
                    } else {
                        resolve(reclist[0]);
                    }
                }, (error) => {
                    reject(error);
                });
        });
    }

    /**
     * update an existing record. This will be based on the uuid or the record and
     * will create a copy of the current record, a history edge, and then will edit the
     * current record. This will be wrapped in a transaction. Will need to ensure the
     *
     * @param  {object} opt record content
     * @return {Promise}  if resolved returns ? otherwise returns the db error
     */
    updateRecord(opt={}, user, drop_invalid_attr=true) {
        return new Promise((resolve, reject) => {
            if (opt.uuid === undefined) {
                throw new AttributeError('uuid');
            }

            // get the record from the db
            this.selectExactlyOne({uuid: opt.uuid, deleted_at: null})
                .then((record) => {
                    const required_matches = ['uuid', 'deleted_at','version', 'created_at'];
                    for (let m of required_matches) {
                        if (opt[m] !== undefined && opt[m] !== record[m]) {
                            throw new Error('Concurrency error. Updating an out-of-date record');
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
                    for (let key of Object.keys(opt)) {
                        if (! key.startsWith('@') && key !== 'version') {
                            updates[key] = opt[key];
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
    get_by_id(id) {
        return this.db.record.get(`#${id}`);
    }
    /**
     * @returns {boolean} if the current class is an abstract class
     */
    get isAbstract() {
        if (_.isEqual(this.dbClass.clusterIds, [-1])) {
            return true;
        } else {
            return false;
        }
    }

     /**
      *  gets a class record using the input parameters as key value pairs to filter using the where clause
      * If no filter parameters are given then all records of this class are returned
      *
      * @param  {object} whereFilters key value pairs for filtering the selection clause
      * @param  {int} limit the number of records to return
      * @return {Promise} if resolved, returns Array of orientjs.Record else returns and Error
      */
    get(whereFilters, limit) {
        return new Promise((resolve, reject) => {
            const queryArgs = [];
            for (let key of Object.keys(whereFilters)) {
                if (this.parameterNames.includes(key)) {
                    queryArgs.push(`${key}=:${key}`);
                } else {
                    reject(new AttributeError(`invalid parameter ${key}`));
                }
            }
            if (queryArgs.length > 0) {
                // no arguments, return all records of this class
                console.log(`select * from ${this.constructor.clsname} where ${queryArgs.join(' AND ')}`, whereFilters);
                if (limit !== undefined) {
                    this.db.select().from(this.constructor.clsname).where(whereFilters).all()
                        .then((result) => {
                            resolve(result);
                        }).catch((error) => {
                            reject(error);
                        });
                } else {
                    this.db.select().from(this.constructor.clsname).where(whereFilters).fetch({limit: limit}).all()
                        .then((result) => {
                            resolve(result);
                        }).catch((error) => {
                            reject(error);
                        });
                }
            } else {
                console.log(`select * from ${this.constructor.clsname}`);
                if (limit !== undefined) {
                    this.db.select().from(this.constructor.clsname).all()
                        .then((result) => {
                            resolve(result);
                        }).catch((error) => {
                            reject(error);
                        });
                } else {
                    this.db.select().from(this.constructor.clsname).fetch({limit: limit}).all()
                        .then((result) => {
                            resolve(result);
                        }).catch((error) => {
                            reject(error);
                        });
                }
            }
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
                this.selectExactlyOne(data.from),
                this.selectExactlyOne(data.to)
            ]).then((recList) => {
                let [src, tgt] = recList;
                for (let key of data.from) {
                    if (data.from[key] !== src[key]) {
                        throw new Error(`Record pulled from DB differs from input on attr ${key}: ${src[key]} vs ${data.from[key]}`);
                    }
                }
                for (let key of data.to) {
                    if (data.to[key] !== tgt[key]) {
                        throw new Error(`Record pulled from DB differs from input on attr ${key}: ${tgt[key]} vs ${data.to[key]}`);
                    }
                }
                delete args.to;
                delete args.from;
                // now create the edge
                this.dbClass.create(args).from(src['@rid']).to(tgt['@rid']).set(args)
                    .then((result) => {
                        console.log(result);
                        resolve(result);
                    }).catch((error) => {
                        reject(error);
                    });
            }).catch((error) => {
                reject(error);
            });
            

            var commit = this.dbClass.db
                .let('src', (tx) => {
                    return tx.select().from(KBVertex.clsname).where(src);
                }).let('tgt', (tx) => {
                    return tx.select().from(KBVertex.clsname).where(tgt);
                }).let('edge', (tx) => {
                    //connect the nodes
                    return tx.create(this.createType, this.clsname)
                        .from('$src')
                        .to('$tgt');
                }).commit();
            commit.return('[$edge, $src, $tgt]').all()
                .then((recList) => {
                    console.log(recList);
                    resolve(recList);
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
