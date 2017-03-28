/*
 * models here are responsible for the api level parameter validation
 */
const Base = require('./base');

class Evidence extends Base {
    constructor(db) {
        super(db, 'evidence');
    }
    create(){
        return this.db.class.create(this.clsname, 'V', null, true); //extends='V', cluster=null, abstract=true
    }
}

class Publication extends Base { 
    constructor(db) {
        const parameters = ['title', 'pubmed_id', 'journal', 'year'];
        super(db, 'publication', parameters);
    }
    create(){
        return new Promise((resolve, reject) => {
            this.db.class.create(this.clsname, 'evidence') //publication inherits evidence
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
                    }).catch((error) => {
                        reject(error);
                    });
                resolve(publication);
            }).catch((error) => {
                reject(error);
            });
        });
    }
};

class Context extends Base {
    constructor(db) {
        super(db, 'context');
    }
    create() {
        return this.db.class.create(this.clsname, 'V', null, true); //extends='V', cluster=null, abstract=true
    }
}

class Feature extends Base {
    constructor(db){
        super(db, 'feature', ['name', 'source', 'source_version', 'biotype']);
    }
    create() {
        return new Promise((resolve, reject) => {
            this.db.class.create(this.clsname, 'context')
                .then((feature) => {
                    feature.property.create({name: "name", type: "string", mandatory: true, notNull: true})
                        .then(() => {
                            return feature.property.create({name: "source", type: "string", mandatory: true, notNull: true});
                        }).then(() => {
                            // allow version to be null since we won't always know this info
                            return feature.property.create({name: "source_version", type: "string", mandatory: true, notNull: false});
                        }).then(() => {
                            return feature.property.create({name: "biotype", type: "string", mandatory: true, notNull: true})
                        }).catch((error) => {
                            reject(error);
                        });
                    resolve(feature);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}

class Disease extends Base {
    constructor(db) {
        super(db, 'disease', ['name']);
    }
    create() {
        // create the disease class
        return new Promise((resolve, reject) => {
            this.db.create(this.clsname, 'context')
                .then((disease) => {
                    disease.property.create({name: "name", type: "string", mandatory: true, notNull: true})
                        .then(() => {
                            // build the index to ensure no duplicate disease names
                            return db.index.create({
                                name: disease.name + '.index_name',
                                type: 'unique',
                                metadata: {ignoreNullValues: false},
                                properties: 'name',
                                'class':  disease.name
                            });
                        }).catch((error) => { 
                            reject(error); 
                        });
                    resolve(disease);
                }).catch((error) => { 
                    reject(error); 
                });
        });
    }
}


module.exports = (db) => {
    return {
        publication: new Publication(db), 
        evidence: new Evidence(db),
        context: new Context(db),
        feature: new Feature(db)
    };
};
