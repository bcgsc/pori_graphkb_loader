"use strict";
const {Base, KBVertex, softGetRID} = require('./base');
const {AttributeError} = require('./error');


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
    
    createRecord(opt={}) {
        return new Promise((resolve, reject) => {
            const descClasses = new Set();
            const descUUID = new Set();
            opt.start = softGetRID(opt.start);
            opt.end = softGetRID(opt.end);
            
            Promise.all([
                this.dbClass.db.record.get(opt.start),
                this.dbClass.db.record.get(opt.end)
            ]).then((plist) => {
                // check that the start and end are the same type of nodes or ranges
                const new_promises = [];
                for (let record of plist) {
                    if (record['@class'] == this.constructor.clsname) {
                        new_promises.push(this.dbClass.db.record.get(record.start));
                        new_promises.push(this.dbClass.db.record.get(record.end));
                    } else {
                        descClasses.add(record['@class']);
                        if (descUUID.has(record.uuid)) {
                            throw new AttributeError('duplicate uuid');
                        } else {
                            descUUID.add(record.uuid);
                        }
                    }
                }
                return Promise.all(new_promises);
            }).then((plist) => {
                // check that the start and end are the same type of nodes or ranges
                for (let record of plist) {
                    descClasses.add(record['@class']);
                    if (descUUID.has(record.uuid)) {
                        throw new AttributeError('duplicate uuid');
                    } else {
                        descUUID.add(record.uuid);
                    }
                }
                if (descClasses.size != 1) {
                    throw new AttributeError(`incompatible types in range: ${descClasses}`);
                }

                return super.createRecord(opt);
            }).then((record) => {
                resolve(record);
            }).catch((error) => {
                reject(error);
            });
        });
    }

    static createClass(db) {
        const props = [
            {name: "start", type: "link", mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: "end", type: "link", mandatory: true, notNull: true, linkedClass: Position.clsname}
        ];
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: Position.clsname, isAbstract: false, properties: props})
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
    
    createRecord(opt={}) {
        return new Promise((resolve, reject) => {
            opt = Object.assign({offset: 0}, opt);
            super.createRecord(opt)
                .then((result) => {
                    resolve(result);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

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
    
    createRecord(opt={}) {
        return new Promise((resolve, reject) => {
            opt = Object.assign({ref_aa: null}, opt);
            if (opt.ref_aa != null) {
                if (opt.ref_aa.length != 1) {
                    throw new AttributeError(`ref_aa must be a single character: ${opt.ref_aa}`);
                }
                opt.ref_aa = opt.ref_aa.toUpperCase();
            }
            super.createRecord(opt)
                .then((result) => {
                    resolve(result);
                }).catch((error) => {
                    reject(error);
                });
        });
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
    
    createRecord(opt={}) {
        return new Promise((resolve, reject) => {
            opt = Object.assign({major_band: null, minor_band: null}, opt); // set defaults
            if (opt.major_band === null && opt.minor_band !== null) {
                throw new AttributeError(`major band must be specified in order to specify the minor band`);
            }
            if (! ['p', 'q', 'P', 'Q'].includes(opt.arm)) {
                throw new AttributeError(`invalid value for arm, must be p or q found: ${opt.arm}`);
            }
            opt.arm = opt.arm.toLowerCase();
            super.createRecord(opt)
                .then((result) => {
                    resolve(result);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

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
