'use strict';
const {AttributeError, ControlledVocabularyError, MultipleResultsFoundError, NoResultFoundError, PermissionError, AuthenticationError} = require('./error');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');
const moment = require('moment');
const cache = require('./cached/data');
const Promise = require('bluebird');

const errorJSON = function(error) {
    return {type: error.type, message: error.message};
};

const RULES = {
    BINF: [{disease: ['read']}, {ontology: ['write']}],
};

/**
 * @returns {Promise} if resolved, returns {orientjs.Property[]} array of properties from the current class and inherited classes
 * otherwise returns an {Error}
 */
const getAllProperties = (cls) => {
    return new Promise((resolve, reject) => {
        let result = {properties: cls.properties, superClasses: []};
        if (cls.superClass !== null) {
            result.superClasses.push(cls.superClass);
            cls.db.class.get(cls.superClass)
                .then((superClass) => {
                    return getAllProperties(superClass);
                }).then((props) => {
                    result.properties = _.concat(result.properties, props.properties);
                    result.superClasses = _.concat(result.superClasses, props.superClasses);
                    resolve(result);
                }).catch((error) => {
                    reject(error);
                });
        } else {
            resolve(result);
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

const dec2bin = (dec) => {
    // convert decimal to binary
    let bin = (dec >>> 0).toString(2);
    // pad the generated binary result with zeros  
    return bin.length >= 4 ? bin : new Array(4 - bin.length + 1).join(0) + bin;
}

class Record {

    constructor(content, parentClass) {
        this.content = content;
        this.generator = parentClass;
        this.content['@class'] = parentClass.constructor.clsname;
    }
}


/**
 * @class
 */
class Base {
    /**
     * @param {orientjs.Class} dbClass the class loaded from the database
     * @param {orientjs.Property[]} properties array of properties associated with this class (including inherited)
     */
    constructor(db, conn, properties=[], superClasses=[]) {
        this.db = db;
        this.conn = conn;
        this.properties = properties;
        this.superClasses = superClasses;
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
        if (_.isEqual(this.conn.clusterIds, [-1])) {
            return true;
        } else {
            return false;
        }
    }

    isOrHasAncestor(ancestor) {
        if (ancestor === this.constructor.clsname || this.superClasses.includes(ancestor)) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * @returns {boolean} if the provided user is permitted to execute the provided db function
     **/
    isPermitted(userRecord, dbFunction) {
        return new Promise((resolve, reject) => {
            const CRUD = ['delete', 'update', 'read', 'create'];
            let permissible = false;
            if (userRecord.content.status === 'ACTIVE') {
                this.db.conn.record.get(userRecord.content.role.toString())
                    .then((roleRecord) => {
                        if (_.has(roleRecord.rules, this.conn.superClass.toString())) {
                            if (dec2bin(roleRecord.rules[this.conn.superClass.toString()])[_.indexOf(CRUD, dbFunction)] == 1) {
                                permissible = true;
                                resolve(permissible)
                            } else {
                                resolve(permissible)
                            }
                        } else {
                            resolve(permissible)
                        }
                    }).catch((error) => {
                        throw new NoResultFoundError;
                });
            } else {
                 throw new AuthenticationError(`requested function cannot be executed as the user: ${userRecord.content.username} is suspended`);
            }
        }); 
    }
    

    getAllowedTermsList(propertyName) {
        const terms = [];
        for (let cls of Object.keys(cache.vocab)) {
            if (cache.vocab[cls][propertyName] != undefined && this.isOrHasAncestor(cls)) {
                for (let term of cache.vocab[cls][propertyName]) {
                    terms.push(term);
                }
            }
        }
        return terms;
    }


    validateContent(content) {
        const args = {};
        for (let key of Object.keys(content)) {
            if (content[key] === undefined) {
                delete content[key];
                continue;
            }
            if (this.constructor.createType == 'edge' && (key == 'in' || key == 'out')) {
                // ignore edges reserved properties
            } else if (! _.includes(this.propertyNames, key)) {
                throw new AttributeError(`invalid attribute ${key}`);
            }
            let value = content[key];
            const allowedValues = [];
            for (let term of this.getAllowedTermsList(key)) {
                if (term.conditional === null || term.conditional === content.type) {
                    allowedValues.push(term.term);
                }
            }
            if (allowedValues.length > 0 && ! allowedValues.includes(value)) {
                throw new ControlledVocabularyError(
                    `'${value}' is not an allowed term for ${this.constructor.clsname}:${key}(type=${content.type}). Valid terms include: ${allowedValues.toString()}`);
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
            this.conn.create(args)
                .then((result) => {
                    resolve(new Record(result, this));
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
        if (where instanceof Record) {
            where = where.content;
        }
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
            const query = this.db.conn.select().from(clsname).where(selectionWhere);
            let stat = query.buildStatement();
            for (let key of Object.keys(query._state.params)) {
                stat = stat.replace(':' + key, `"${query._state.params[key]}"`);
            }
            query.all()
                .then((rl) => {
                    const reclist = [];
                    for (let r of rl) {
                        reclist.push(new Record(r, this));
                    }
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
        if (where instanceof Record) {
            where = where.content;
        }
        return new Promise((resolve, reject) => {
            where.deleted_at = null;
            this.selectExactlyOne(where)
                .then((record) => {
                    record.content.deleted_at = moment().valueOf();
                    return this.db.conn.record.update(record.content);
                }).then((updatedRecord) => {
                    resolve(new Record(updatedRecord, this));
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
            db.conn.class.get(this.clsname)
                .then((cls) => {
                    getAllProperties(cls)
                        .then((result) => {
                            let c = new this(db, cls, result.properties, result.superClasses);
                            db.models[this.name] = c;
                            db.models[this.clsname] = c;
                            resolve(c);
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
                opt.db.conn.class.create(opt.clsname, opt.superClasses, null, opt.isAbstract) // create the class first
                    .then((cls) => {
                        // add the properties
                        Promise.all(Array.from(opt.properties, (prop) => cls.property.create(prop)))
                            .then(() => {
                                // create the indices
                                return Promise.all(Array.from(opt.indices, (i) => opt.db.conn.index.create(i)));
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
    
    validateContent(content) {
        const args = Object.assign({ // default arguments
            uuid : uuidV4(),
            version: 0,
            created_at: moment().valueOf(),
            deleted_at: null
        }, content);
        return super.validateContent(args);
    }

    static get createType() {
        return 'vertex';
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
                {name: 'version', type: 'integer', mandatory: true, notNull: true},
                {name: 'created_at', type: 'long', mandatory: true, notNull: true},
                {name: 'deleted_at', type: 'long', mandatory: true, notNull: false},
                {name: 'user', type: 'link', mandatory: true, notNull: true,  linkedClass: KBUser.clsname}
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

    createRecord(opt={}) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(opt);
            this.db.models.KBUser.selectExactlyOne({username: args.user}).then((userRecord) => {
                args.user = userRecord.content['@rid'];
                this.isPermitted(userRecord, 'create').then((permission) => {
                    if (permission) {
                        this.conn.create(args).then((record) => {
                            this.db.conn.record.get(args.user).then((userRecord) => {
                                record.user = userRecord;
                                resolve(new Record(record, this));
                            }).catch((error) => {
                                reject(error);
                            });
                        }).catch((error) => {
                            reject(error);
                        });
                    } else {
                        reject(new PermissionError("CREATE FUNCTION IS NOT PERMITTED"));    
                    }
                }).catch((error) => {
                    reject(error);
                });
            }).catch((error) => {
                reject(new AuthenticationError(`the provided username (i.e. ${args.user}) does not exist`));
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
                    if (where[m] !== undefined && where[m] !== record.content[m]) {
                        throw new Error(`Concurrency error. Updating an out-of-date record. Property ${m}: ${where[m]} and ${record.content[m]}`);
                    }
                }
                this.db.models.KBUser.selectExactlyOne({username: where.user.username}).then((userRecord) => {
                    this.isPermitted(userRecord, 'update').then((permission) => {
                        if (permission) {                          
                            const duplicate = {};
                            const timestamp = moment().valueOf();
                            const updates = {
                                version: record.content.version + 1,
                                created_at: timestamp
                            };
                            // create a copy of the current record
                            for (let key of Object.keys(record.content)) {
                                if (! key.startsWith('@')) {
                                    duplicate[key] = record.content[key];
                                }
                            }
                            for (let key of Object.keys(where)) {
                                if (! key.startsWith('@') && key !== 'version') {
                                    updates[key] = where[key];
                                }
                            }
                            duplicate['deleted_at'] = timestamp; // set the deletion time
                            // start the transaction
                            var commit = this.db.conn
                                .let('updatedRID', (tx) => {
                                    // update the existing node
                                    return tx.update(`${record.content['@rid'].toString()}`).set(updates).return('AFTER @rid');
                                }).let('duplicate', (tx) => {
                                    //duplicate the old node
                                    return tx.create(this.constructor.createType, this.constructor.clsname)
                                        .set(duplicate);
                                }).let('historyEdge', (tx) => {
                                    //connect the nodes
                                    return tx.create(History.createType, History.clsname)
                                        .from('$updatedRID')
                                        .to('$duplicate')
                                }).commit();
                            commit.return('$updatedRID').one() 
                                .then((rid) => {
                                    return this.db.conn.record.get(rid);
                                }).then((record) => {
                                    resolve(new Record(record, this));
                                }).catch((error) => {
                                    reject(error);
                                });
                        } else {
                            reject(new PermissionError("UPDATE FUNCTION IS NOT PERMITTED"));
                        }
                    }).catch((error) => {
                        reject(error);
                    });
                });
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
                {name: 'deleted_at', type: 'long', mandatory: true, notNull: false},
                {name: 'user', type: 'link', mandatory: true, notNull: true,  linkedClass: KBUser.clsname}
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

    validateContent(content) {
        const args = Object.assign({ // default arguments
            uuid : uuidV4(),
            version: 0,
            created_at: moment().valueOf(),
            deleted_at: null
        }, content);
        const tgt = args.in.args || args.in;
        const src = args.out.args || args.out;
        src['@class'] = src['@class'] || KBVertex.clsname;
        tgt['@class'] = tgt['@class'] || KBVertex.clsname;
        return super.validateContent(args);
    }
    
    /**
     *
     */
    createRecord(data={}) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(data);
            const tgtIn = data.in.content || data.in;
            const srcIn = data.out.content || data.out;
            // select both records from the db
            Promise.all([
                this.selectExactlyOne(srcIn),
                this.selectExactlyOne(tgtIn)
            ]).then((recList) => {
                let [src, tgt] = recList;
                for (let key of Object.keys(src.content)) {
                    if (srcIn[key] === undefined || key === '@class') {
                        continue;
                    } else {
                        if (key === '@rid') {
                            if (srcIn[key].toString() === src.content[key].toString()) {
                                continue;
                            }
                        } else if (srcIn[key] === src.content[key]) {
                            continue;
                        } else if (key === 'user') {
                            if (src.content.user.toString() === srcIn.user['@rid'].toString()) {
                                continue;
                            }
                        } else if (key === 'role') {
                            if (src.content.role.toString() === srcIn.role['@rid'].toString()) {
                                continue;
                            }
                        }
                    }
                    throw new Error(`Record pulled from DB differs from input on attr ${key}: ${src[key]} vs ${srcIn[key]}`);
                }
                for (let key of Object.keys(tgt.content)) {
                    if (tgtIn[key] === undefined || key === '@class') {
                        continue;
                    } else {
                        if (key === '@rid') {
                            if (tgtIn[key].toString() === tgt.content[key].toString()) {
                                continue;
                            }
                        } else if (tgtIn[key] === tgt.content[key]) {
                            continue;
                        } else if (key === 'user') {
                            if (tgtIn.user['@rid'].toString() === tgt.content.user.toString()) {
                                continue;
                            }
                        } else if (key === 'role') {
                            if (tgt.content.role.toString() === tgtIn.role['@rid'].toString()) {
                                continue;
                            }
                        }
                    }
                    throw new Error(`Record pulled from DB differs from input on attr ${key}: ${tgt[key]} vs ${tgtIn[key]}`);
                }
                delete args.in;
                delete args.out;
                // now create the edge
                this.db.models.KBUser.selectExactlyOne({username: args.user})
                .then((userRecord) => {
                    args.user = userRecord.content['@rid'];
                    this.isPermitted(userRecord, 'create').then((permission) => {
                        if (permission) {
                            this.db.conn.create(this.constructor.createType, this.constructor.clsname)
                                .from(src.content['@rid'].toString()).to(tgt.content['@rid'].toString()).set(args).one()
                                .then((record) => {
                                    this.db.conn.record.get(args.user).then((userRecord) => {
                                        record.user = userRecord;
                                        resolve(new Record(record, this));
                                    }).catch((error) => {
                                        reject(error);
                                    });
                            }).catch((error) => {
                                reject(error);
                            });
                        } else {
                            reject(new PermissionError("CREATE FUNCTION IS NOT PERMITTED"));    
                        }
                    }).catch((error) => {
                        reject(error);
                    });
                }).catch((error) => {
                    reject(new AuthenticationError(`the provided username (i.e. ${args.user}) does not exist`));
                });
            }).catch((error) => {
                reject(error);
            });
        });
    }
}

/**
 * @class
 * @extends Base
 */
class KBUser extends Base {

    validateContent(content) {
        content.role = content.role || {name: 'BINF'};
        content.status = content.status || 'ACTIVE'; 
        const args = super.validateContent(content);
        return args;
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {

            const props = [
                {name: 'username', type: 'string', mandatory: true, notNull: false},
                {name: 'status', type: 'string', mandatory: true, notNull: false},
                {name: 'role', type: 'link', mandatory: true, notNull: true,  linkedClass: KBRole.clsname} //readOnly: true,
            ];

            const idxs = [{
                name: this.clsname + '.index_username',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['username'],
                'class':  this.clsname
            }];

            Base.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: false, properties: props, indices: idxs})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    createRecord(opt) {            
        return new Promise((resolve, reject) => {
            const args = this.validateContent(opt);
            this.db.models.KBRole.selectExactlyOne({name: args.role})
                .then((record) => {
                    args.role = record.content['@rid'];
                    return this.conn.create(args).then((userRecord) => {
                        this.db.conn.record.get(args.role).then((roleRecord) => {
                            userRecord.role = roleRecord;
                            resolve(new Record(userRecord, this));
                        }).catch((error) => {
                            reject(error);
                        });
                    }).catch((error) => {
                        reject(error);
                    });
                })
        });
    }
}

/**
 * @class
 * @extends Base
 */
class KBRole extends Base {

    validateContent(content) {
        const args = super.validateContent(content);
        return args;
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {

            const props = [
                {name: 'name', type: 'string', mandatory: true, notNull: false},
                {name: 'rules', type: 'embedded', mandatory: true, notNull: false},
                {name: 'mode', type: 'integer', mandatory: true, notNull: false}
            ];

            const idxs = [{
                name: this.clsname + '.index_name',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name'],
                'class':  this.clsname
            }];

            Base.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: false, properties: props, indices: idxs})
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
                {name: 'comment', type: 'string', mandatory: false, notNull: true, readOnly: true},
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

module.exports = {Base, History, KBVertex, KBEdge, softGetRID, Record, errorJSON, KBUser, KBRole};
