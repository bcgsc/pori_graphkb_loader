const Base = require('./base');

/**
 * @class
 * @extends Base
 */
class Context extends Base {

    static createClass(db){
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: 'V', is_abstract: true})
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
 * @class
 * @extends Base
 */
class Feature extends Base {

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: "name", type: "string", mandatory: true, notNull: true},
                {name: "source", type: "string", mandatory: true, notNull: true},
                {name: "source_version", type: "string", mandatory: true, notNull: false},
                {name: "biotype", type: "string", mandatory: true, notNull: true}
            ];
            super.createClass({db, clsname: this.clsname, superClasses: Context.clsname, properties: props})
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
 * @class
 * @extends Base
 */
class Disease extends Base {

    static createClass(db) {
        // create the disease class
        return new Promise((resolve, reject) => {
            const props = [
                {name: "name", type: "string", mandatory: true, notNull: true}
            ];
            const idxs = [{
                name: this.clsname + '.index_name',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: 'name',
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

/**
 * @class
 * @extends Base
 */
class Therapy extends Base {

    static createClass(db) {
        // create the therapy class
        return new Promise((resolve, reject) => {
            const props = [
                {name: "name", type: "string", mandatory: true, notNull: true}
            ];
            const idxs = [{
                name: this.clsname + '.index_name',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: 'name',
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

/**
 * @class
 * @extends Base
 */
class Evaluation extends Base {

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: "consequence", type: "string", mandatory: true, notNull: true}
            ];
            super.createClass({db, clsname: this.clsname, superClasses: Context.clsname, properties: props})
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
 * @class
 * @extends Base
 */
class Comparison extends Base {

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [];
            super.createClass({db, clsname: this.clsname, superClasses: Evaluation.clsname, properties: props})
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
 * @class
 * @extends Base
 */
class Event extends Base { /* TODO */ }

/**
 * @class
 * @extends Base
 */
class SpecificEvent extends Base { /* TODO */ }

/**
 * @class
 * @extends Base
 */
class VocabEvent extends Base { /* TODO */ }


module.exports = {Context, Evaluation, Comparison, Event, SpecificEvent, VocabEvent, Feature, Therapy, Disease};
