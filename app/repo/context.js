const Base = require('./base');


class Context extends Base {
    constructor(dbClass) { super(dbClass); }
    
    static createClass(db){
        return new Promise((resolve, reject) => {
            db.class.create(this.clsname, 'V', null, true) //extends='V', cluster=null, abstract=true
                .then((result) => {
                    return this.loadClass(db);
                }).then((result) => {
                    resolve(result);
                }).catch((error) => {
                    reject(error);
                }); 
        });
    }

}

class Feature extends Base {
    constructor(dbClass) { super(dbClass); }
    
    static createClass(db) {
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
                            return feature.property.create({name: "biotype", type: "string", mandatory: true, notNull: true});
                        }).then(() => {
                            return this.loadClass(db);
                        }).then((result) => {
                            resolve(result);
                        }).catch((error) => {
                            reject(error);
                        });
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}

class Disease extends Base {
    constructor(dbClass) { super(dbClass); }

   static createClass(db) {
        // create the disease class
        return new Promise((resolve, reject) => {
            db.class.create(this.clsname, Context.clsname)
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
                }).then(() => {
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
 * db model for the Therapy class
 * @class 
 */ 
class Therapy extends Base {
    constructor(dbClass) { super(dbClass); }

    static createClass(db) {
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
                }).then(() => {
                    return this.loadClass(db);
                }).then((result) => {
                    resolve(result);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}


class Evaluation extends Base { /* TODO */ }


class Comparison extends Base { /* TODO */ }


class Event extends Base { /* TODO */ }


class SpecificEvent extends Base { /* TODO */ }


class VocabEvent extends Base { /* TODO */ }


module.exports = {Context, Evaluation, Comparison, Event, SpecificEvent, VocabEvent, Feature, Therapy, Disease};
