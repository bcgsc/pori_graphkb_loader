'use strict';
const {Base, KBVertex} = require('./base');
const vocab = require('./cached/data').vocab;
const Promise = require('bluebird');



class Feature extends Base {
    
    validateContent(content) {
        const args = Object.assign({source_version: null}, content);
        return super.validateContent(args);
    }

    static createClass(db) {
        const props = [
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'source', type: 'string', mandatory: true, notNull: true},
            {name: 'source_version', type: 'string', mandatory: true},
            {name: 'biotype', type: 'string', mandatory: false}
        ];

        const idxs = [
            {
                name: `${this.clsname}_active_source_source_version_name`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['source', 'source_version', 'name', 'deleted_at'],
                'class':  this.clsname
            }
        ];

        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: false, properties: props})
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


module.exports = {Feature};
