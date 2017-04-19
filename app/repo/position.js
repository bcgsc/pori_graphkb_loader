"use strict";
const {Base, KBVertex} = require('./base');


/**
 * @class
 * @extends Base
 */
class Position extends Base {

    static createClass(db) {
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true})
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
class Range extends Base {

    static createClass(db) {
        const props = [
            {name: "start", type: "link", mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: "end", type: "link", mandatory: true, notNull: true, linkedClass: Position.clsname}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Position.clsname, isAbstract: false})
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
class GenomicPosition extends Base {
    
    static createClass(db) {
        const props = [
            {name: "pos", type: "integer", mandatory: true, notNull: true}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
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
class ExonicPosition extends Base {

    static createClass(db) {
        const props = [
            {name: "pos", type: "integer", mandatory: true, notNull: true}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
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
class CodingSequencePosition extends Base {

    static createClass(db) {
        const props = [
            {name: "pos", type: "integer", mandatory: true, notNull: true},
            {name: "offset", type: "integer", mandatory: true, notNull: true}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
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
class ProteinPosition extends Base {
    
    createRecord(opt) {
        if (opt.ref_aa != undefined) {
            if (opt.ref_aa.length != 1) {
                throw AttributeError(`ref_aa must be a single character: ${opt.ref_aa}`);
            }
            opt.ref_aa = opt.ref_aa.toUpperCase();
        }
        return super.createRecord(opt);
    }

    static createClass(db) {
        const props = [
            {name: "pos", type: "integer", mandatory: true, notNull: true},
            {name: "ref_aa", type: "string", mandatory: true, notNull: false}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
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
class CytobandPosition extends Base {

    static createClass(db) {
        const props = [
            {name: "arm", type: "string", mandatory: true, notNull: true},
            {name: "major_band", type: "integer", mandatory: true, notNull: false},
            {name: "minor_band", type: "integer", mandatory: true, notNull: false}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
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


module.exports = {Position, Range, ProteinPosition, GenomicPosition, ExonicPosition, CodingSequencePosition, ProteinPosition, CytobandPosition};
