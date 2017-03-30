/*
 * models here are responsible for the api level parameter validation
 */
const Base = require('./base');

class Evidence extends Base {
    constructor(dbClass) { super(dbClass); }
    
    static createClass(db){
        return new Promise((resolve, reject) => {
            db.class.create(this.clsname, 'V', null, true) //extends='V', cluster=null, abstract=true
                .then((cls) => {
                    resolve(new this(cls));
                }).catch((error) => {
                    reject(error);
                }); 
        });
    }
}

class Publication extends Base {
    constructor(dbClass) { super(dbClass); }
    
    createClass(db){
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
                        }).catch((error) => {
                            reject(error);
                        });
                    const pub = new this(publication);
                    resolve(pub);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
};

class Context extends Base {
    constructor(dbClass) { super(dbClass); }
    
    static createClass(db){
        return new Promise((resolve, reject) => {
            db.class.create(this.clsname, 'V', null, true) //extends='V', cluster=null, abstract=true
                .then((cls) => {
                    resolve(new this(db));
                }).catch((error) => {
                    reject(error);
                }); 
        });
    }

}

class Feature extends Base {
    constructor(dbClass) { super(dbClass); }
    
    createClass(db) {
        return new Promise((resolve, reject) => {
            db.class.create(this.clsname, Context.clsname)
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
    constructor(dbClass) { super(dbClass); }

    createClass(db) {
        // create the disease class
        return new Promise((resolve, reject) => {
            const disease = db.class.create(this.clsname, Context.clsname)
                .then((disease) => {
                    return disease.property.create({name: "name", type: "string", mandatory: true, notNull: true})
                }).then(() => {
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
            resolve(new Disease(db));
        });
    }
}

/**
 * db model for the Therapy class
 * @class 
 */ 
class Therapy extends Base {
    constructor(dbClass) { super(dbClass); }

    createClass(db) {
        // create the therapy class
        return new Promise((resolve, reject) => {
            const therapy = db.class.create(this.clsname, 'context')
                .then((therapy) => {
                    return therapy.property.create({name: "name", type: "string", mandatory: true, notNull: true})
                }).then(() => {
                    // build the index to ensure no duplicate therapy names
                    return db.index.create({
                        name: therapy.name + '.index_name',
                        type: 'unique',
                        metadata: {ignoreNullValues: false},
                        properties: 'name',
                        'class':  therapy.name
                    });
                }).catch((error) => {
                    reject(error);
                });
            resolve(therapy);
        });
    }
}

const loadSchema = (db) => {
    /**
     * loads the db models from the db connection
     * @returns {Promise} if all models were loaded successfully
     */
    return new Promise((resolve, reject) => {
        const promises = Array.from([Evidence, Publication, Therapy, Context, Feature, Disease], (cls) => cls.loadClass(db));
        Promise.all(promises)
            .then((classes) => {
                const result = {};
                for (let cls of classes) {
                    result[cls.clsname] = cls;
                }
                resolve(result);
            }).catch((error) => {
                reject(error);
            });
    });
}

const createSchema = (db) => {
    /**
     * builds the schema from the models. Assumes an empty db
     * @returns {Promise}
     */
    // creates the schema and returns promise
    // if the promise succeeds it will return {classname: clsobject, classname: clsobject}
    // if the promise fails it will return the first error it encountered
    const p1 = new Promise((resolve, reject) => {
        // build the abstract classes and then their dependencies
        Evidence.createClass(db)
            .then((evidence) => {
                // TODO: create subclasses
                
            }).catch((error) => {
                reject(error);
            })
    });
    const p2 = new Promise((resolve, reject) => {
        Context.createClass(db)
            .then((context) => {
                // TODO: create subclasses
            }).catch((error) => {
                reject(error);
            })
    })
    return new Promise((resolve, reject) => {
        Promise.all([p1, p2])
            .then(() => {
                console.log('load the schema');
                return loadSchema(db);
            }).then((models) => {
                resolve(models);
            }).catch((error) => {
                reject(error);
            });
    });
}


module.exports = {models: [Publication, Evidence], loadSchema, createSchema};
