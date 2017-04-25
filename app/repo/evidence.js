"use strict";
const {Base, KBVertex} = require('./base');
const {AttributeError} = require('./error');

/**
@todo Complete the documentaiton 
@todo Complete the externalDB class
@todo versioning ... 
*/

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

    validateContent(content) {
        const args = Object.assign({idType: "pmid"}, content)
        if ([content.title, content.id].some(x => x == undefined)) {
            throw new AttributeError('violated null constraint');
        }
        args.title = args.title.toLowerCase();
        args.idType = args.idType.toLowerCase();
        args.id = args.id.toLowerCase();
        return super.validateContent(args)
    }
    
    static createClass(db){
        return new Promise((resolve, reject) => {
            const props = [
                {name: "journal", type: "string"},
                {name: "year", type: "integer"},
                {name: "title", type: "string", mandatory: true, notNull: true},
                {name: "idType", type: "string", mandatory: true, notNull: true},
                {name: "id", type: "string", mandatory: true, notNull: true},
            ];
            const idxs = [{
                name: this.clsname + '.index_id',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['idType', 'id'],
                'class':  this.clsname
            }, 
            /*
            {
                name: this.clsname + '.index_vesrion',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['version', 'id'],
                'class':  this.clsname
            }
            */
            ];
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
                {name: "name", type: "string"};
                {name: "url", type: "string"};
                {};
                {};
                {};
            ];
    super.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props})
        .then( () => {}).catch( () => {} )
    }
}
*/

module.exports = {Publication, Evidence, Study} //, ExternalDB};
