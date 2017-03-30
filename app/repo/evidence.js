const Base = require('./base');


class Evidence extends Base {
    constructor(dbClass) { super(dbClass); }
    
    static createClass(db){
        return new Promise((resolve, reject) => {
            db.class.create(this.clsname, 'V', null, true) //extends='V', cluster=null, abstract=true
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
    constructor(dbClass) { super(dbClass); }
    
    static createClass(db){
        return new Promise((resolve, reject) => {
            db.class.create(this.clsname, Evidence.clsname) //publication inherits evidence
                .then((publication) => {
                    // now add properties
                    publication.property.create({name: "journal", type: "string"})
                        .then(() => {
                            return publication.property.create({name: "year", type: "integer"});
                        }).then(() => {
                            return publication.property.create({name: "title", type: "string", mandatory: true, notNull: true});
                        }).then(() => {
                            return publication.property.create({name: "pubmed_id", type: "integer"});
                        }).then(() => {
                            // create the index
                            return db.index.create({
                                name: publication.name + '.index_pubmed',
                                type: 'unique',
                                metadata: {ignoreNullValues: true},
                                properties: 'pubmed_id',
                                'class':  publication.name
                            });
                        }).then(() => {
                            return this.loadClass(db);
                        }).then((cls) => {
                            resolve(cls);
                        }).catch((error) => {
                            reject(error);
                        });
                }).catch((error) => {
                    reject(error);
                });
        });
    }
};


class Study extends Base { /* TODO */ }


class ExternalDB extends Base { /* TODO */ }


module.exports = {Publication, Evidence, Study, ExternalDB};
