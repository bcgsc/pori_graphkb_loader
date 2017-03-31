const {AttributeError} = require('./error');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');


const errorJSON = function(error) {
    return {type: error.type, message: error.message};
}

/**
 * @returns {Promise<Array,Error>} array of properties from the current class and inherited classes
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


class Base {
    constructor(dbClass, properties=[]) {
        this.dbClass = dbClass;
        this.properties = properties;
    }

    get propertyNames() {
        return Array.from(this.properties, ({name}) => name);
    }
    create_record(opt) { 
        // TODO 
    }
    get_by_id(id){
        console.log('get_by_id', id);
        return this.db.record.get(`#${id}`);
    }
    get is_abstract() {
        if (_.isEqual(this.dbClass.clusterIds, [-1])) {
            return true;
        } else {
            return false;
        }
    }
    get(opt){
        return new Promise((resolve, reject) => {
            const queryArgs = [];
            for (let key of Object.keys(opt)) {
                if (this.parameters.includes(key)) {
                    queryArgs.push(`${key}=:${key}`);
                } else {
                    reject(new AttributeError(`invalid parameter ${key}`));
                }
            }
            if (queryArgs.length > 0){
                console.log(`select * from ${this.clsname} where ${queryArgs.join(' AND ')}`, opt);
                this.db.select().from(this.clsname).where(opt).all()
                    .then((result) => {
                        resolve(result);
                    }).catch((error) => {
                        reject(error);
                    });
            } else {
                console.log(`select * from ${this.clsname}`);
                this.db.select().from(this.clsname).all()
                    .then((result) => {
                        resolve(result);
                    }).catch((error) => {
                        reject(error);
                    });
            }
        });
    }
    static get clsname() {
        var clsname = this.name;
        clsname = clsname.replace(/([a-z])([A-Z])/, '$1_$2');
        return clsname.toLowerCase();
    }
    static loadClass(db) {
        return new Promise((resolve, reject) => {
            db.class.get(this.clsname)
                .then((cls) => {
                    console.log('got cls from db', cls.name);
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

    static createClass(opt) {
        return new Promise((resolve, reject) => {
            // preliminary error checking and defaults
            opt.properties = opt.properties || [];
            opt.indices = opt.indices || [];
            opt.is_abstract = opt.is_abstract || false;
            
            if (opt.clsname === undefined || opt.superClasses === undefined || opt.db === undefined) {
                reject(new AttributeError(
                    `required attribute was not defined: clsname=${opt.clsname}, superClasses=${opt.superClasses}, db=${opt.db}`));
            } else {
                opt.db.class.create(opt.clsname, opt.superClasses, null, opt.is_abstract) // create the class first
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
