'use strict';
const {Base, Record} = require('./base');
const {Feature} = require('./feature');
const {AttributeError} = require('./error');

class Position extends Base {

    static createClass(db) {
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: 'V', isAbstract: true})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    static compare(curr, other) {
        if (curr.prefix !== other.prefix) {
            throw new TypeError(`cannot compare positions using different coordinate systems: ${curr.prefix}, ${other.prefix}`);
        } else if (curr.pos == null || other.pos == null) {
            throw new TypeError('cannot compare objects where pos is not defined');
        } else if (curr.pos < other.pos) {
            return -1;
        } else if (curr.pos > other.pos) {
            return 1;
        } else {
            return 0;
        }
    }
}


/**
 * @class
 * @extends KBVertex
 */
class Range extends Base {
    validateContent(content, positionClassName) {
        if (content.start == undefined || content.end == undefined) {
            throw new AttributeError('both start and end must be specified and not null');
        }
        let positionClass = this.db.models[positionClassName];
        if (positionClass.isAbstract) {
            throw new AttributeError('cannot embed an abstract class');
        }
        content.start = positionClass.validateContent(content.start);
        content.start['@class'] = positionClassName;
        content.end = positionClass.validateContent(content.end);
        content.end['@class'] = positionClassName;
        try {
            if (positionClass.constructor.compare(content.start, content.end) >= 0) {
                throw new AttributeError(`cannot create a range if the start position is not less than the end position`);
            }
        } catch (e) {
            if (! (e instanceof TypeError)) {
                throw e;
            }
        }
        return super.validateContent(content);
    }
    
    createRecord(where, positionClassname) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(where, positionClassname);
            this.conn.create(args)
                .then((result) => {
                    resolve(new Record(result, this));
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    /*createRecord(opt, positionClassName) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(opt, positionClassName);
            const pClass = this.db.models[positionClassName];
            // start the transaction
            var commit = this.db.conn
                .let('startPos', (tx) => {
                    // create the start position
                    return tx.create(pClass.constructor.createType, pClass.constructor.clsname)
                        .set(args.start);
                }).let('endPos', (tx) => {
                    // create the end position
                    return tx.create(pClass.constructor.createType, pClass.constructor.clsname)
                        .set(args.end);
                }).let('range', (tx) => {
                    //connect the nodes
                    const sub = Object.assign({}, args);
                    delete sub.end;
                    delete sub.start;
                    return tx.create(this.constructor.createType, this.constructor.clsname).set(sub).set('start = $startPos, end = $endPos');
                }).commit();
            //console.log("Statement: " + commit.buildStatement());
            commit.return('$range').one()
                .then((record) => {
                    Promise.all([
                        this.db.conn.record.get(record.start),
                        this.db.conn.record.get(record.end)
                    ]).then((positions) => {
                        record.start = positions[0];
                        record.end = positions[1];
                        resolve(new Record(record, this));
                    }).catch((error) => {
                        reject(error);
                    });
                }).catch((error) => {
                    reject(error);
                });
        });
    }*/

    static createClass(db, positionClass) {
        const props = [
            {name: 'start', type: 'embedded', mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: 'end', type: 'embedded', mandatory: true, notNull: true, linkedClass: Position.clsname}
        ];
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: Position.clsname, isAbstract: false, properties: props})
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
 * @extends KBVertex
 */
class GenomicPosition extends Base {

    static createClass(db) {
        const props = [
            {name: 'pos', type: 'integer', mandatory: true, notNull: true, min: 1}
        ];
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    static compare(curr, other) {
        return Position.compare(curr, other);
    }

    static get prefix() {
        return 'g';
    }
}

/**
 * @class
 * @extends KBVertex
 */
class ExonicPosition extends Base {

    static createClass(db) {
        const props = [
            {name: 'pos', type: 'integer', mandatory: true, notNull: true, min: 1}
        ];
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    
    static compare(curr, other) {
        return Position.compare(curr, other);
    }

    static get prefix() {
        return 'e';
    }
}

/**
 * @class
 * @extends KBVertex
 */
class CodingSequencePosition extends Base {

    validateContent(content) {
        const args = Object.assign({offset: 0}, content);
        return super.validateContent(args);
    }

    static createClass(db) {
        const props = [
            {name: 'pos', type: 'integer', mandatory: true, notNull: true,  min: 1},
            {name: 'offset', type: 'integer', mandatory: true, notNull: true}
        ];
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    
    static compare(curr, other) {
        const comp = Position.compare(curr, other);
        if (comp === 0) {
            if (curr.offset == null || other.offset == null) {
                throw new TypeError('cannot compare non-specific cds positions. Offset must be given');
            }
            if (curr.offset < other.offset) {
                return -1;
            } else if (curr.offset > other.offset) {
                return 1;
            } else {
                return 0;
            }
        } else {
            return comp;
        }
    }
    
    static get prefix() {
        return 'c';
    }
}

/**
 * @class
 * @extends KBVertex
 */
class ProteinPosition extends Base {

    validateContent(content) {
        const args = Object.assign({ref_aa: null}, content);
        if (args.ref_aa != null) {
            if (args.ref_aa.length != 1) {
                throw new AttributeError(`ref_aa must be a single character: ${args.ref_aa}`);
            }
            args.ref_aa = args.ref_aa.toUpperCase();
        }
        return super.validateContent(args);
    }

    static createClass(db) {
        const props = [
            {name: 'pos', type: 'integer', mandatory: true, notNull: true,  min: 1},
            {name: 'ref_aa', type: 'string', mandatory: true, notNull: false}
        ];
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    
    static compare(curr, other) {
        return Position.compare(curr, other);
    }

    static get prefix() {
        return 'p';
    }
}

/**
 * @class
 * @extends KBVertex
 */
class CytobandPosition extends Base {

    validateContent(content) {
        const args = Object.assign({major_band: null, minor_band: null}, content); // set defaults
        if (args.major_band === null && args.minor_band !== null) {
            throw new AttributeError('major band must be specified in order to specify the minor band');
        }
        if (! ['p', 'q', 'P', 'Q'].includes(args.arm)) {
            throw new AttributeError(`invalid value for arm, must be p or q found: ${args.arm}`);
        }
        args.arm = args.arm.toLowerCase();
        return super.validateContent(args);
    }

    static createClass(db) {
        const props = [
            {name: 'arm', type: 'string', mandatory: true, notNull: true},
            {name: 'major_band', type: 'integer', mandatory: true, notNull: false,  min: 1},
            {name: 'minor_band', type: 'integer', mandatory: true, notNull: false}
        ];
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: Position.clsname, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    
    static compare(curr, other) {
        if (curr.prefix !== other.prefix) {
            throw new TypeError(`cannot compare positions using different coordinate systems: ${curr.prefix}, ${other.prefix}`);
        } else if (curr.arm == null || other.arm == null) {
            throw new TypeError(`cannot compare positions when the arm is not defined: ${curr.arm}, ${other.arm}`);
        } else if (curr.arm === other.arm) {
            if (curr.major_band == null || other.major_band == null) {
                throw new TypeError('cannot compare otherwise equivalent positions when the major_band is not specified');
            } else if (curr.major_band < other.major_band) {
                return -1;
            } else if (curr.major_band > other.major_band) {
                return 1;
            } else if (curr.minor_band == null || other.minor_band == null) {
                throw new TypeError('cannot compare otherwise equivalent positions when the minor_band is not specified')
            } else if (curr.minor_band < other.minor_band) {
                return -1;
            } else if (curr.minor_band > other.minor_band) {
                return 1;
            } else {
                return 0;
            }
        } else if (curr.arm < other.arm) {
            return -1;
        } else {
            return 1;
        }
    }

    static get prefix() {
        return 'y';
    }
}



module.exports = {Position, Range, ProteinPosition, GenomicPosition, ExonicPosition, CodingSequencePosition, CytobandPosition};
