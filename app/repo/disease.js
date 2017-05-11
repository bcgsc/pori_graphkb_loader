const {Base, KBVertex, KBEdge} = require('./base');
const {AttributeError} = require('./error');
const {Context} = require('./context');

/**
 * @class
 * @extends Base
 */
class Disease extends Base {

    validateContent(content) {

        if (content.doid != undefined || content.name != undefined) {
            if (! content.doid % 1 === 0) {
                // if doid is not an integer
                throw new AttributeError('DOID must be an integer');
            } else {
                content.name = content.doi.toLowerCase();
            }
        } else {
            throw new AttributeError('violated null constraint');
        }

        return super.validateContent(content);
    }

    getParents(opt) {
        
    }

    getRelatives(opt) {

    }

    getSynonyms(opt) {

    }

    deprecator(opt) {

    }

    static createClass(db) {
        // create the disease class
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'name', type: 'string', mandatory: true, notNull: true},
                {name: 'doid', type: 'integer', mandatory: true, notNull: true}
            ];

            const idxs = [{
                name: this.clsname + '.index_doid',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name' , 'deleted_at'],
                'class':  this.clsname
            }];

            super.createClass({db, clsname: this.clsname, superClasses: Context.clsname, properties: props, indices: idxs})
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

module.exports = {Disease};
