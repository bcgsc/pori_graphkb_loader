"use strict";
const {AttributeError} = require('./error');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');
const moment = require('moment');
const MOMENT_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSSZZ'


const errorJSON = function(error) {
    return {type: error.type, message: error.message};
}

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
}

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

    static get createType() {
        return 'vertex';
    }

    /**
     * create new record
     * @param  {object} opt record content
     * @return {Promise}  if resolved returns ? otherwise returns the db error
     */
    createRecord(opt={}) {
        return new Promise((resolve, reject) => {
            const args = { // default arguments
                uuid : uuidV4(),
                edit_version: 0,
                created_at: moment().unix(),
                deleted_at: null
            };
            console.log('createRecord', args.created_at);
            for (let key of Object.keys(opt)) {
                if (! _.includes(this.propertyNames, key)) {
                    throw new AttributeError(`invalid attribute ${key}`);
                }
                args[key] = opt[key]; // overrides the defaults if given
            }
            this.dbClass.create(args)
                .then((result) => {
                    resolve(result);
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
     * @param  {object} opt record content
     * @return {Promise}  if resolved returns ? otherwise returns the db error
     */
    updateRecord(opt={}, user, drop_invalid_attr=true) {
        return new Promise((resolve, reject) => {
            if (opt.uuid === undefined) {
                throw new AttributeError('uuid');
            }
            for (let key of Object.keys(opt)) {
                if (key.startsWith('@') || key === 'edit_version') {
                    if (drop_invalid_attr == true) {
                        delete opt[key];
                    } else {
                        throw new AttributeError(`reserved attribute ${key} cannot be given`);
                    }
                }
            }

            // get the record from the db
            this.dbClass.db.select().from(this.constructor.clsname).where({uuid: opt.uuid}).one()
                .then((record) => {
                    const duplicate = {};
                    const timestamp = moment().unix() + 1;
                    const updates = {
                        edit_version: record.edit_version + 1,
                        created_at: timestamp
                    };
                    
                    // create a copy of the current record
                    for (let key of Object.keys(record)) {
                        if (! key.startsWith('@')) {
                            duplicate[key] = record[key];
                        }
                    }
                    for (let key of Object.keys(opt)) {
                        if (! key.startsWith('@')) {
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
                    console.log("Statement: " + commit.buildStatement());
                    commit.return('$updatedRID').one()
                        .then((rid) => {
                            return this.dbClass.db.record.get(rid);
                        }).then((record) => {
                            console.log('result', record);
                        }).catch((error) => {
                            console.log('error', error);
                        });
                    // update the original with the new values
                    // add a history edge
                }).catch((error) => {
                    console.log('error', error);
                });
        });
    }
    get_by_id(id) {
        console.log('get_by_id', id);
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
                })
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

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
                {name: 'edit_version', type: 'integer', mandatory: true, notNull: true},
                {name: 'created_at', type: 'long', mandatory: true, notNull: true},
                {name: 'deleted_at', type: 'long', mandatory: true, notNull: false}
            ];
            const idxs = [
                {
                    name: `${this.clsname}_edit_version`,
                    type: 'unique',
                    properties: ['uuid', 'edit_version'],
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

            super.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: true, properties: props, indices: []})
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
                {name: 'edit_version', type: 'integer', mandatory: true, notNull: true},
                {name: 'created_at', type: 'long', mandatory: true, notNull: true},
                {name: 'deleted_at', type: 'long', mandatory: true, notNull: false}
            ];
            const idxs = [
                {
                    name: `${this.clsname}_edit_version`,
                    type: 'unique',
                    properties: ['uuid', 'edit_version'],
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

            super.createClass({db, clsname: this.clsname, superClasses: 'E', isAbstract: true, properties: props, indices: []})
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

            super.createClass({db, clsname: this.clsname, superClasses: 'E', isAbstract: false, properties: props})
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

module.exports = {Base, History, KBVertex, KBEdge};
