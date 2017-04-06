"use strict";

const Base = require('./base');

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
                {name: 'created_at', type: 'datetime', mandatory: true, notNull: true},
                {name: 'deleted_at', type: 'Date', mandatory: true, notNull: false}
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

            super.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: true, properties: props, indices: idxs})
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
    
    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
                {name: 'edit_version', type: 'integer', mandatory: true, notNull: true},
                {name: 'created_at', type: 'datetime', mandatory: true, notNull: true},
                {name: 'deleted_at', type: 'Date', mandatory: true, notNull: false}
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

            super.createClass({db, clsname: this.clsname, superClasses: 'E', isAbstract: true, properties: props, indices: idxs})
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

module.exports = {KBVertex, KBEdge};
