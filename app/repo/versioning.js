"use strict";

const Base = require('./base');

/**
 * creates the abstract super class "versioning" and adds it as the super class for V and E
 *
 * @param {orientjs.Db} db the database instance
 * @returns {Promise} returns a promise which returns nothing on resolve and an error on reject
 */ 
const augmentWithVersioning = (db) => {
    return new Promise((resolve, reject) => {
        const props = [
            {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
            {name: 'edit_version', type: 'integer', mandatory: true, notNull: true},
            {name: 'created_at', type: 'Date', mandatory: true, notNull: true},
            {name: 'deleted_at', type: 'Date', mandatory: true, notNull: false}
        ];
        const idxs = [
            {
                name: 'versioning_edit_version',
                type: 'unique',
                properties: ['uuid', 'edit_version'],
                'class':  'versioning'
            },
            {
                name: 'versioning_single_null_deleted_at',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['uuid', 'deleted_at'],
                'class':  'versioning'
            }
        ];
        Base.createClass({db, clsname: 'versioning', superClasses: null, properties: props, indices: idxs, isAbstract: true})
            .then(() => { // class created successfully
                // try adding this as a superclass of E and V
                return db.class.update({name: 'V', superClass: 'versioning'});
            }).then(() => {
                return db.class.update({name: 'E', superClass: 'versioning'});
            }).then(() => {
                resolve();
            }).catch((error) => {
                reject(error);
            });
        });
}

module.exports = {augmentWithVersioning};
