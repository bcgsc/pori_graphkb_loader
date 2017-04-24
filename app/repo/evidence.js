"use strict";
const {Base, KBVertex} = require('./base');

/**
 * @class
 * @extends Base
 */
class Evidence extends Base {

    static createClass(db){
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true})
                .then((result) => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
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
class Publication extends Base {

    static createClass(db){
        return new Promise((resolve, reject) => {
            const props = [
                {name: "journal", type: "string"},
                {name: "year", type: "integer"},
                {name: "title", type: "string", mandatory: true, notNull: true},
                {name: "pubmed_id", type: "integer"}
            ];
            const idxs = [{
                name: this.clsname + '.index_pubmed',
                type: 'unique',
                metadata: {ignoreNullValues: true},
                properties: 'pubmed_id',
                'class':  this.clsname
            }];
            super.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, indices: idxs})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
};

/**
 * @class
 * @extends Base
 */
class Study extends Base {

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: "year", type: "integer"},
                {name: "name", type: "string"},
                {name: "sample_population", type: "string", mandatory: true, notNull: true},
                {name: "sample_population_size", type: "integer", mandatory: true},
                {name: "method", type: "string", mandatory: true}
            ];
            super.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props})
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

/**
 * @class
 * @extends Base
 */

/*
class ExternalDB extends Base {

    static createClass(db) {
        const prop = [
                {};
                {};
                {};
                {};
                {};
            ];

    const idxs = [{
                ,
                ,
                type: 'unique',
                metadata: {ignoreNullValues: true},
            }];
    super.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props})
        .then( () => {}).catch( () => {} )
    }
}

*/

module.exports = {Publication, Evidence, Study} //, ExternalDB};
