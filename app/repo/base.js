"use strict";
const {AttributeError} = require('./error');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');


const errorJSON = function(error) {
    return {type: error.type, message: error.message};
}

/**
 * @returns {Promise} if resolved, returns {orientjs.Property[]} array of properties from the current class and inherited classes
 * otherwise returns an {Error}
 */
const getAllProperties = (cls) => {
    return new Promise((resolve, reject) => {
        var properties = cls.properties;
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
    
    /**
     * create new record
     * @param  {object} opt record content
     * @return {Promise}  if resolved returns ? otherwise returns the db error
     */
    createRecord(opt={}) {
        return new Promise((resolve, reject) => {
            const args = {
                uuid : this.dbClass.db.rawExpression("uuid()"),
                edit_version: 0,
                created_at: this.dbClass.db.rawExpression("sysdate()"),
                deleted_at: null
            };
            for (let key of Object.keys(opt)) {
                if (! _.includes(this.propertyNames, key)) {
                    throw new AttributeError(`invalid attribute ${key}`);
                }
                args[key] = opt[key];
            }
            
            this.dbClass.create(args)
                .then((result) => {
                    resolve(result);
                }).catch((error) => {
                    reject(error);
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
        var clsname = this.name;
        clsname = clsname.replace(/([a-z])([A-Z])/, '$1_$2');
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
                        // now add properties
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

module.exports = Base;
