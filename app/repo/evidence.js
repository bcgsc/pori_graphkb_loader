const Base = require('./base');


class Evidence extends Base {
    constructor(dbClass, props) { super(dbClass, props); }
    
    static createClass(db){
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: 'V', is_abstract: true})
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


class Publication extends Base {
    constructor(dbClass, props) { super(dbClass, props); }
    
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


class Study extends Base { 
    constructor(dbClass, props) { super(dbClass, props); }

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


class ExternalDB extends Base { /* TODO */ }


module.exports = {Publication, Evidence, Study, ExternalDB};
