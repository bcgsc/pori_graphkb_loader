'use strict';
const {AttributeError, ControlledVocabularyError, MultipleResultsFoundError, NoResultFoundError, PermissionError, AuthenticationError} = require('./error');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');
const moment = require('moment');
const cache = require('./cached/data');
const {PERMISSIONS} = require('./constants');
const Promise = require('bluebird');


const errorJSON = function(error) {
    return {type: error.type, message: error.message};
};


const isObject = (obj) => {
    if (obj !== null && typeof obj === 'object') {
        return true;
    } else {
        return false;
    }
};


/**
 * get the value of a key in an object. If maxDepth is > 0 will check nested object to a given level of nesting
 */
const getAttribute = (obj, attr, maxDepth=0) => {
    for (let key of Object.keys(obj)) {
        if (key == attr) {
            return obj[key];
        }
        if (isObject(obj[key])) {
            if (maxDepth > 0) {
                let result = getAttribute(obj[key], attr, maxDepth - 1);
                if (result != null) {
                    return result;
                }
            }
        }
    }
    return null;
};

/**
 * @returns {Promise} if resolved, returns {orientjs.Property[]} array of properties from the current class and inherited classes
 * otherwise returns an {Error}
 */
const getAllProperties = (cls) => {
    let result = {properties: cls.properties, superClasses: []};
    if (cls.superClass !== null) {
        result.superClasses.push(cls.superClass);
        return cls.db.class.get(cls.superClass)
            .then((superClass) => {
                return getAllProperties(superClass);
            }).then((props) => {
                result.properties = _.concat(result.properties, props.properties);
                result.superClasses = _.concat(result.superClasses, props.superClasses);
                return result;
            });
    } else {
        return Promise.resolve(result);
    }
};

const regexCleanKeys = (obj, patterns) => {
    const newObj = {};
    for (let key of Object.keys(obj)) {
        let excludeFlag = false;
        for (let patt of patterns) {
            if (patt.exec(key)) {
                excludeFlag = true;
                break;
            }
        }
        if (! excludeFlag) {
            newObj[key] = obj[key];
        }
    }
    return newObj;
};


class Record {

    constructor(content, parentClassName) {
        this.content = content || {};
        if (parentClassName && ! this.content['@class']) {
            this.content['@class'] = parentClassName;
        }
    }

    get rid() {
        return this.content['@rid'].toString();
    }

    get hasRID() {
        if (this.content['@rid'] != null) {
            return true;
        } else {
            return false;
        }
    }

    get dbJSON() {
        const content = {};
        for (let param of Object.keys(this.content)) {
            if (this.content[param] && this.content[param]['@rid']) {
                content[param] = this.content[param]['@rid'].toString();
            } else {
                content[param] = this.content[param];
            }
        }
        return content;
    }

    mutableAttributes() {
        const result = this.dbJSON;
        for (let param of Object.keys(result)) {
            if (param == 'uuid' || param.startsWith('@')) {
                delete result[param];
            }
        }
        return result;
    }
    staticAttributes() {
        const result = this.dbJSON;
        for (let param of Object.keys(result)) {
            if (param != 'uuid' && ! param.startsWith('@')) {
                delete result[param];
            }
        }
        if (result['@type']) {
            delete result['@type'];
        }
        return result;
    }

    toJSON() {
        const json = {};
        for (let key of Object.keys(this.content)) {
            if (key.startsWith('out_')) {
                let arr = [];
                for (let item of this.content[key].all()) {
                    arr.push(regexCleanKeys(item.in, [/^_/, /^(out|in)_/]));
                }
                json[key] = arr;
            } else if (key.startsWith('in_')) {
                let arr = [];
                for (let item of this.content[key].all()) {
                    arr.push(regexCleanKeys(item.out, [/^_/, /^(out|in)_/]));
                }
                json[key] = arr;
            } else {
                json[key] = this.content[key];
            }
        }
        return json;
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
    isPermitted(userRecord, operationPermissions) {
        userRecord = userRecord.content || userRecord;
        if (userRecord.active) {
            const roleSelect = userRecord.role.rules ? Promise.resolve(userRecord.role) : this.db.conn.record.get(userRecord.role.toString());
            return roleSelect
                .then((roleRecord) => {
                    let clsList = _.concat([this.constructor.clsname], this.superClasses);
                    for (let cls of clsList) {
                        if (roleRecord.rules[cls] !== undefined) {
                            if (roleRecord.rules[cls] & operationPermissions) {
                                return true;
                            } else {
                                throw new PermissionError('insufficient permissions');
                            }
                        }
                    }
                    throw new PermissionError(`insufficient permission to ${operationPermissions} a record`);
                });
        } else {
            return Promise.reject(new AuthenticationError(`requested function cannot be executed as the user: ${userRecord.username} is suspended`));
        }
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

    selectOrCreate(obj, user, retry=true, retryTimeOut=10) {
        return this.selectExactlyOne(obj)
            .catch(() => {
                return this.createRecord(obj, user);
            }).then((rec) => {
                return rec;
            }).catch((err) => {
                if (retry && err.type === 'com.orientechnologies.orient.core.storage.ORecordDuplicatedException') {
                    return this.selectExactlyOne(obj).delay(retryTimeOut)
                        .then((rec) => {
                            return rec;
                        });
                } else {
                    throw err;
                }
            });
    }

    validateContent(content) {
        const args = {};
        for (let key of Object.keys(content)) {
            if (content[key] === undefined) {
                delete content[key];
                continue;
            }
            if (key === '@class') {
                args[key] = content[key];
                continue;
            } else if (key.startsWith('@')) {
                continue;
            } else if (this.constructor.createType === 'edge' && (key === 'in' || key === 'out')) {
                // ignore edges reserved properties
            } else if (! _.includes(this.propertyNames, key)) {
                return Promise.reject(new AttributeError(`invalid attribute ${key} from object ${JSON.stringify(content)}`));
            }
            let value = content[key];
            const allowedValues = [];
            for (let term of this.getAllowedTermsList(key)) {
                if (term.conditional === null || term.conditional === content.type) {
                    allowedValues.push(term.term);
                }
            }
            if (key !== 'uuid' && (typeof content[key] === 'string' || content[key] instanceof String)) {
                content[key] = content[key].toLowerCase();
            }
            if (allowedValues.length > 0 && ! allowedValues.includes(value)) {
                return Promise.reject(new ControlledVocabularyError(`'${value}' is not an allowed term for ${this.constructor.clsname}:${key}(type=${content.type}). Valid terms include: ${allowedValues.toString()}`));
            }
            args[key] = content[key]; // overrides the defaults if given
        }
        for (let prop of this.properties) {
            if (prop.mandatory) {
                if (args[prop.name] === undefined) {
                    if (! prop.notNull) {
                        // if not given but can be null, default to null
                        args[prop.name] = null;
                    } else {
                        return Promise.reject(new AttributeError(`mandatory property ${prop.name} was not specified`));
                    }
                }
            }
            if (args[prop.name] !== undefined) {
                if (prop.notNull && args[prop.name] === null) {
                    return Promise.reject(new AttributeError(`violated notNull constraint of ${prop.name} property`));
                }
                if (prop.min && args[prop.name] != null && args[prop.name] < prop.min) {
                    return Promise.reject(new AttributeError(`${args[prop.name]} is below the allowed minimum: ${prop.min}`));
                }
            }
        }
        return Promise.resolve(args);
    }

    /**
     * create new record
     * @param  {object} where record content
     * @return {Promise}  if resolved returns ? otherwise returns the db error
     */
    createRecord(where={}) {
        return this.validateContent(where)
            .then((args) => {
                return this.conn.create(args);
            }).then((result) => {
                return new Record(result, this.constructor.clsname);
            });
    }
    /**
     * recursive function which builds a selection query that accesses parameters from nested objects
     * @example
     *     >>> record = {
     *     >>>     'name': 'bob',
     *     >>>     'parent': {'@rid': '#1:3', 'name': 'susan'},
     *     >>>     'partner': {'name': 'george'}
     *     >>> };
     *     >>> Base.parseSelectWhere(record);
     *     {'name': 'bob', 'parent': '#1:3', 'partner.name': 'george'}
     */
    parseSelectWhere(record) {
        // nested object as selection parameter
        const where = {};
        record = record.content || record;

        if (isObject(record)) {
            for (let key of Object.keys(record)) {
                if (key.startsWith('in_') || key.startsWith('out_') || key === '@type') {
                    continue; // ignore edge bags and record type
                } else if (key === '@rid') {
                    where[key] = record[key].toString();
                } else if (isObject(record[key])) {
                    if (record[key]['@rid'] !== undefined) {
                        where[key] = record[key]['@rid'];
                    } else {
                        for (let [subkey, value] of _.entries(this.parseSelectWhere(record[key]))) {  // recurse
                            where[key + '.' + subkey] = value;
                        }
                    }
                } else if (key !== 'uuid' && (typeof record[key] === 'string' || record[key] instanceof String)) {
                    where[key] = record[key].toLowerCase();
                } else {
                    where[key] = record[key];
                }
            }
        } else {
            throw new Error('cannot call parseSelectWhere not on an object');
        }
        return where;
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
        return this.select(where, false, 1, false)
            .then((recList) => {
                return recList[0];
            });
    }

    select(where={}, activeOnly=false, exactlyN=null, ignoreAtPrefixed=false, fetchPlan={'*': 1}) {
        where = where.content || where;
        const clsname = where['@class'] || this.constructor.clsname;
        let selectionWhere;
        try {
            selectionWhere = this.parseSelectWhere(where);
        } catch (error) {
            return Promise.reject(error);
        }
        if (activeOnly) {
            selectionWhere.deleted_at = null;
        }
        let query = this.db.conn.select().from(clsname).where(selectionWhere);
        if (Object.keys(selectionWhere).length == 0) {
            query = this.db.conn.select().from(clsname);
        }
        let stat = query.buildStatement();
        for (let key of Object.keys(query._state.params)) {
            let value = query._state.params[key];
            if (typeof value === 'string') {
                value = `'${value}'`;
            }
            stat = stat.replace(':' + key, `${value}`);
        }

        return query.fetch(fetchPlan).all()
            .then((rl) => {
                const reclist = [];
                for (let r of rl) {
                    reclist.push(new Record(r, clsname));
                }
                if (exactlyN !== null) {
                    if (reclist.length === 0) {
                        if (exactlyN === 0) {
                            return [];
                        } else {
                            throw new NoResultFoundError(`query returned an empty list: ${stat}`);
                        }
                    } else if (exactlyN !== reclist.length) {
                        throw new MultipleResultsFoundError(`query returned unexpected number of results. Found ${reclist.length} results but expected ${exactlyN} results: ${stat}`);
                    } else {
                        return reclist;
                    }
                } else {
                    return reclist;
                }
            });

    }

    deleteRecord(currRecord, user) {
        const userSelect = user.hasRID ? Promise.resolve(user) : this.selectExactlyOne({username: user, '@class': KBUser.clsname});
        let toDeleteSelect;
        return userSelect
            .then((userRecord) => {
                user = userRecord;
                return this.isPermitted(user, PERMISSIONS.DELETE);
            }).then(() => {
                if (currRecord.rid) { // don't select if we already have the rid
                    return Promise.resolve(currRecord);
                } else {
                    return this.selectExactlyOne(currRecord);
                }
            }).then((record) => {
                const update = {};
                update.deleted_at = moment().valueOf();
                update.deleted_by = user.rid;
                toDeleteSelect = record.staticAttributes();
                toDeleteSelect.deleted_at = null;
                toDeleteSelect.deleted_by = null;
                return this.db.conn.update(record.rid).set(update).where(toDeleteSelect).return('AFTER').one();
            }).then((updatedRecord) => {
                if (updatedRecord === undefined) {
                    throw new NoResultFoundError(`Could not update record. Record not found:  ${toDeleteSelect}`);
                }
                return new Record(updatedRecord, this.constructor.clsname);
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
        return db.conn.class.get(this.clsname)
            .then((cls) => {
                return getAllProperties(cls)
                    .then((result) => {
                        let c = new this(db, cls, result.properties, result.superClasses);
                        db.models[this.name] = c;
                        db.models[this.clsname] = c;
                        return c;
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
        // preliminary error checking and defaults
        opt.properties = opt.properties || [];
        opt.indices = opt.indices || [];
        opt.isAbstract = opt.isAbstract || false;

        if (opt.clsname === undefined || opt.superClasses === undefined || opt.db === undefined) {
            return Promise.reject(new AttributeError(
                `required attribute was not defined: clsname=${opt.clsname}, superClasses=${opt.superClasses}, db=${opt.db}`));
        } else {
            return opt.db.conn.class.create(opt.clsname, opt.superClasses, null, opt.isAbstract) // create the class first
                .then((cls) => {
                    // add the properties
                    return Promise.all(Array.from(opt.properties, (prop) => cls.property.create(prop)))
                        .then(() => {
                            // create the indices
                            return Promise.all(Array.from(opt.indices, (i) => opt.db.conn.index.create(i)));
                        });

                });
        }
    }
}

/**
 * @swagger
 * definitions:
 *   KBVertex:
 *     type: object
 *     properties:
 *       uuid:
 *         $ref: '#/definitions/uuid'
 *       created_by:
 *         $ref: '#/definitions/KBUser'
 *       deleted_by:
 *         $ref: '#/definitions/KBUser'
 *       created_at:
 *         type: integer
 *       deleted_at:
 *         type: integer
 *       version:
 *         type: integer
 *   uuid:
 *     type: string
 *     format: 'UUIDv4'
 */
class KBVertex extends Base {

    validateContent(content) {
        const args = Object.assign({ // default arguments
            uuid : uuidV4(),
            version: 0,
            created_at: moment().valueOf(),
            deleted_at: null,
            deleted_by: null
        }, content);
        return super.validateContent(args);
    }

    static get createType() {
        return 'vertex';
    }

    static createClass(db) {
        const props = [
            {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
            {name: 'version', type: 'integer', mandatory: true, notNull: true},
            {name: 'created_at', type: 'long', mandatory: true, notNull: true},
            {name: 'deleted_at', type: 'long', mandatory: true, notNull: false},
            {name: 'created_by', type: 'link', mandatory: true, notNull: true,  linkedClass: KBUser.clsname},
            {name: 'deleted_by', type: 'link', mandatory: true, notNull: false,  linkedClass: KBUser.clsname}
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

        return Base.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: true, properties: props, indices: idxs})
                .then(() => {
                    return this.loadClass(db);
                });
    }

    createRecord(opt={}, user) {
        if (user == undefined) {
            return Promise.reject(new AttributeError('expected a user'));
        }
        const content = Object.assign({created_by: true}, opt);
        return this.validateContent(content)
            .then((args) => {
                for (let key of Object.keys(args)) {
                    if (key.startsWith('@')) {
                        delete args[key];
                    }
                }
                const userSelect = user.hasRID ? Promise.resolve(user) : this.selectExactlyOne({username: user, '@class': KBUser.clsname});
                return userSelect.then((userRecord) => {
                        user = userRecord;
                        args.created_by = user.rid;
                        return this.isPermitted(user, PERMISSIONS.CREATE);
                    }).then(() => {
                        // use db.create vs conn.create b/c it is compatible across node 6.10 and node 8.6
                        return this.conn.db.create(this.constructor.createType, this.constructor.clsname).set(args).one();
                    }).then((record) => {
                        record.created_by = user.content;
                        return new Record(record, this.constructor.clsname);
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
    updateRecord(record, currentUser) {
       // get the record from the db
       let where = record.staticAttributes();
       let currentRecord;
       const recordSelect = where['@rid'] ? this.db.getRecord(where['@rid']) : this.selectExactlyOne(where);
       return recordSelect
            .then((selectedRecord) => {
                currentRecord = selectedRecord;
                return currentUser.hasRID ? Promise.resolve(currentUser) : this.selectExactlyOne({username: currentUser, '@class': KBUser.clsname});
            }).then((userRecord) => {
                currentUser = userRecord;
                return this.isPermitted(currentUser, PERMISSIONS.UPDATE);
            }).then(() => {
                const duplicate = currentRecord.mutableAttributes();
                const timestamp = moment().valueOf();
                let updates = record.mutableAttributes();
                duplicate.deleted_at = timestamp; // set the deletion time
                duplicate.deleted_by = currentUser.rid;
                duplicate.uuid = currentRecord.content.uuid;

                updates.version += 1;
                updates.created_at = timestamp;
                updates.created_by = currentUser.rid;
                updates.deleted_by = null;

                // start the transaction
                var commit = this.db.conn
                    .let('updatedRID', (tx) => {
                        // update the existing node
                        return tx.update(`${currentRecord.rid}`).set(updates).return('AFTER @rid').where(currentRecord.staticAttributes());
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
                // const stat = commit.buildStatement();
                return commit.return('$updatedRID').one()
                    .then((rid) => {
                        return this.db.conn.record.get(rid);
                    }).then((record) => {
                        return new Record(record, this.constructor.clsname);
                    });
            });
    }
}

class KBEdge extends Base {

    static get createType() {
        return 'edge';
    }

    static createClass(db) {
        const props = [
            {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
            {name: 'version', type: 'integer', mandatory: true, notNull: true},
            {name: 'created_at', type: 'long', mandatory: true, notNull: true},
            {name: 'deleted_at', type: 'long', mandatory: true, notNull: false},
            {name: 'created_by', type: 'link', mandatory: true, notNull: true,  linkedClass: KBUser.clsname},
            {name: 'deleted_by', type: 'link', mandatory: true, notNull: false,  linkedClass: KBUser.clsname}
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

        return Base.createClass({db, clsname: this.clsname, superClasses: 'E', isAbstract: true, properties: props, indices: idxs})
            .then(() => {
                return this.loadClass(db);
            });
    }

    validateContent(content) {
        const args = Object.assign({ // default arguments
            uuid : uuidV4(),
            version: 0,
            created_at: moment().valueOf(),
            deleted_at: null
        }, content);
        args.deleted_by = args.deleted_by || null;
        const tgt = args.in.content || args.in;
        const src = args.out.content || args.out;
        src['@class'] = src['@class'] || KBVertex.clsname;
        tgt['@class'] = tgt['@class'] || KBVertex.clsname;
        if (src.uuid && src.uuid === tgt.uuid) {
            return Promise.reject(new AttributeError('These two nodes are the same (same uuid). No other relationship can be defined.'));
        }
        return super.validateContent(args);
    }

    /**
     *
     */
    createRecord(data={}, user) {
        const content = Object.assign({created_by: true}, data);
        const tgtIn = data.in;
        const srcIn = data.out;
        // select both records from the db
        return this.validateContent(content)
            .then((args) => {
                return Promise.all([
                    srcIn.hasRID ? Promise.resolve(srcIn) : this.selectExactlyOne(srcIn),
                    tgtIn.hasRID ? Promise.resolve(tgtIn) : this.selectExactlyOne(tgtIn),
                    user.hasRID ? Promise.resolve(user) : this.selectExactlyOne({username: user, '@class': KBUser.clsname})
                ]).then((recList) => {
                    let [src, tgt, user] = recList;
                    delete args.in;
                    delete args.out;
                    // now create the edge
                    args.created_by = user.rid;
                    return this.isPermitted(user, PERMISSIONS.CREATE)
                        .then(() => {
                            return this.db.conn.create(this.constructor.createType, this.constructor.clsname)
                                .from(src.rid).to(tgt.rid).set(args).one()
                                .then((record) => {
                                    record.created_by = user.content;
                                    record.out = src.content;
                                    record.in = tgt.content;
                                    return new Record(record, this.constructor.clsname);
                                });
                        });
                });
            });

    }
}

/**
 * @class
 * @extends Base
 *
 * @swagger
 * definitions:
 *  KBUser:
 *      type: object
 *      properties:
 *          active:
 *              type: boolean
 *          role:
 *              type: object
 *          username:
 *              type: string
 */
class KBUser extends Base {

    validateContent(content) {
        content.role = content.role || {name: 'BINF'};
        content.active = content.active || true;
        const args = super.validateContent(content);
        return args;
    }

    static createClass(db) {
        const props = [
            {name: 'username', type: 'string', mandatory: true, notNull: false},
            {name: 'active', type: 'boolean', mandatory: true, notNull: false},
            {name: 'role', type: 'link', mandatory: true, notNull: true,  linkedClass: KBRole.clsname} //readOnly: true,
        ];

        const idxs = [{
            name: this.clsname + '.index_username',
            type: 'unique',
            metadata: {ignoreNullValues: false},
            properties: ['username'],
            'class':  this.clsname
        }];

        return Base.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: false, properties: props, indices: idxs})
            .then(() => {
                return this.loadClass(db);
            });

    }

    createRecord(opt) {
        return this.validateContent(opt)
            .then((args) => {
                return this.db.models.KBRole.selectExactlyOne({name: args.role})
                    .then((record) => {
                        args.role = record.content['@rid'];
                        return this.conn.create(args);
                    }).then((userRecord) => {
                        return this.db.conn.record.get(args.role)
                            .then((roleRecord) => {
                                userRecord.role = roleRecord;
                                return new Record(userRecord, this.constructor.clsname);
                            });
                    });
            });
    }
}

/**
 * @class
 * @extends Base
 */
class KBRole extends Base {

    static createClass(db) {
        const props = [
            {name: 'name', type: 'string', mandatory: true, notNull: false},
            {name: 'rules', type: 'embedded', mandatory: true, notNull: false, linkedClass: 'permissions'},
            {name: 'mode', type: 'integer', mandatory: false, notNull: false}
        ];

        const idxs = [{
            name: this.clsname + '.index_name',
            type: 'unique',
            metadata: {ignoreNullValues: false},
            properties: ['name'],
            'class':  this.clsname
        }];

        return Base.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: false, properties: props, indices: idxs})
            .then(() => {
                return this.loadClass(db);
            });

    }
}

class History extends Base {

    static get createType() {
        return 'edge';
    }

    static createClass(db) {
        const props = [
            {name: 'comment', type: 'string', mandatory: false, notNull: true, readOnly: true},
        ];

        return Base.createClass({db, clsname: this.clsname, superClasses: 'E', isAbstract: false, properties: props})
            .then(() => {
                return this.loadClass(db);
            });

    }
}

module.exports = {Base, History, KBVertex, KBEdge, Record, errorJSON, KBUser, KBRole, isObject, getAttribute};
