'use strict';

const {Base, KBVertex, KBEdge} = require('./base');
const {AttributeError} = require('./error');
const Promise = require('bluebird');


/**
 * @class
 * @extends Base
 */
class Disease extends Base {

    validateContent(content) {
        if (content.doid != undefined && content.name != undefined) {
            if (! content.doid === parseInt(content.doid, 10)) {
                // if doid is not an integer
                throw new AttributeError('DOID must be an integer');
            } else {
                content.name = content.name.toLowerCase();
            }
        } else {
            throw new AttributeError('violated null constraint');
        }
        return super.validateContent(content);
    }

    //placeholder for what comes ne
    createRecord(content={}) {
    	const args = this.validateContent(content);
        return new Promise((resolve, reject) => {
            super.createRecord(args)
                .then((record) => {
                    resolve(record);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    linkToParent(parentName, childName) {
    	return new Promise((resolve, reject) => {
    		const parent = {};
    		const child = {};

            this.selectExactlyOne({
                name: parentName,
                deleted_at: null
                }).then((record) => {
                    parent = record;
                }).catch((NoResultFoundError) => {
               	    reject(NoResultFoundError)
                });

            this.selectExactlyOne({
                name: childName,
                deleted_at: null
                }).then((record) => {
                    child = record;
                }).catch((NoResultFoundError) => {
               	    reject(NoResultFoundError)
                });

            console.log(parent)
            console.log(child)
  			console.log(Disease.clsname)
    		console.log(parentName)
    		console.log(childName)
    	});
    }

    // getRelatives(args) {

    // }

    // getSynonyms(args) {

    // }

    // deprecator(args) {

    // }

    static createClass(db) {
        // create the disease class
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'name', type: 'string', mandatory: true, notNull: true},
                {name: 'doid', type: 'integer', mandatory: true, notNull: true},
                {name: 'url', type: 'string', mandatory: false, notNull: false},
                {name: 'definition', type: 'string', mandatory: false, notNull: false},
                {name: 'xref', type: 'string', mandatory: false, notNull: false}
            ];

            const idxs = [{
                name: this.clsname + '.index_name',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name' , 'deleted_at'],
                'class':  this.clsname
            }];

            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, properties: props, indices: idxs})
                .then(() => {
                    return this.loadClass(db);
                }).then((result) => {
                    resolve(result);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}


class SubClassOf extends Base {

    static get createType() {
        return 'edge';
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'comment', type: 'string', mandatory: false, notNull: true, readOnly: true}
            ];

            super.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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

class RelatedTo extends Base {

    static get createType() {
        return 'edge';
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'comment', type: 'string', mandatory: false, notNull: true, readOnly: true}
            ];

            super.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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

class SynonymFor extends Base {

    static get createType() {
        return 'edge';
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'comment', type: 'string', mandatory: false, notNull: true, readOnly: true}
            ];

            super.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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

class DepricatedBy extends Base {

    static get createType() {
        return 'edge';
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'comment', type: 'string', mandatory: false, notNull: true, readOnly: true}
            ];

            super.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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

module.exports = {Disease, SubClassOf, RelatedTo, SynonymFor, DepricatedBy};