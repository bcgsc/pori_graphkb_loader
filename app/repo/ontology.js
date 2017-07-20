'use strict';

const {Base, KBVertex, KBEdge, Record} = require('./base');
const {AttributeError} = require('./error');
const {Context} = require('./context');
const Promise = require('bluebird');

/**
 * @class
 * @extends Base
 */
class Ontology extends KBVertex {

    static createClass(db){
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: Context.clsname, isAbstract: true})
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

class Disease extends KBVertex {

    validateContent(content) {
        const args = Object.assign({doid: null}, content);
        if (args.doid != null) {
            args.doid = parseInt(args.doid);
        }
        args.name = args.name.toLowerCase();
        return super.validateContent(content);
    }

    static createClass(db) {
        // create the disease class
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'name', type: 'string', mandatory: true, notNull: true},
                {name: 'doid', type: 'integer', mandatory: true, notNull: false},
                {name: 'url', type: 'string', mandatory: false, notNull: false},
                {name: 'definition', type: 'string', mandatory: false, notNull: false},
                {name: 'xref', type: 'string', mandatory: false, notNull: false}
            ];

            const idxs = [{
                name: this.clsname + '.index_name',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name' ,'deleted_at'],
                'class':  this.clsname
            }];

            Base.createClass({db, clsname: this.clsname, superClasses: Ontology.clsname, properties: props, indices: idxs})
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

class Therapy extends KBVertex {

    validateContent(content) {
        const args = Object.assign({id: null}, content);
        if (args.name != undefined) {
            // more verifications to be added after an appropriate drug ontology is found 
            args.name = args.name.toLowerCase();
        }
        return super.validateContent(args);
    }

    static createClass(db) {
        // create the therapy class
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'name', type: 'string', mandatory: true, notNull: true},
                {name: 'id', type: 'integer', mandatory: true, notNull: false},
                // more properties to be added after an appropriate drug ontology is found 
            ];

            const idxs = [{
                name: this.clsname + '.index_name',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name' ,'deleted_at'],
                'class':  this.clsname
            }];

            Base.createClass({db, clsname: this.clsname, superClasses: Ontology.clsname, properties: props, indices: idxs})
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

/**
 * edges responsible for tracking relationship and deprecation
 */

class OntologySubClassOf extends KBEdge {

    validateContent(content, ontology) {
        const args = super.validateContent(content);
        if (args.in.content.doid == args.out.content.doid || args.in.content.id == args.out.content.id) {
            throw new AttributeError('These two nodes are aliases of each other. No other relationship can be defined.');
        }
        args.in.content['@class'] = args.in.content['@class'] != undefined ? args.in.content['@class'] : Ontology.clsname;
        args.out.content['@class'] = args.out.content['@class'] != undefined ? args.out.content['@class'] : Ontology.clsname;

        return args;
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: [] })
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

class OntologyRelatedTo extends KBEdge {

    validateContent(content, ontology) {
        const args = super.validateContent(content);
        if (args.in.content.doid == args.out.content.doid || args.in.content.id == args.out.content.id) {
            throw new AttributeError('These two nodes are aliases of each other. No other relationship can be defined.');
        }
        args.in.content['@class'] = args.in.content['@class'] != undefined ? args.in.content['@class'] : Ontology.clsname;
        args.out.content['@class'] = args.out.content['@class'] != undefined ? args.out.content['@class'] : Ontology.clsname;

        return args;
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: [] })
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

class OntologyAliasOf extends KBEdge {

    validateContent(content, ontology) {
        const args = super.validateContent(content);
        if (args.in.content.doid !== args.out.content.doid || args.in.content.id !== args.out.content.id) {
            throw new AttributeError('cannot connect diseases with different DOID');
        } 
        args.in.content['@class'] = args.in.content['@class'] != undefined ? args.in.content['@class'] : Ontology.clsname;
        args.out.content['@class'] = args.out.content['@class'] != undefined ? args.out.content['@class'] : Ontology.clsname;

        return args;
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: [] })
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

class OntologyDeprecatedBy extends KBEdge {

    validateContent(content, ontology) {
        const args = super.validateContent(content);
        args.in.content['@class'] = args.in.content['@class'] != undefined ? args.in.content['@class'] : Ontology.clsname;
        args.out.content['@class'] = args.out.content['@class'] != undefined ? args.out.content['@class'] : Ontology.clsname;

        return args;
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {

            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: [] })
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

module.exports = {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDeprecatedBy};
