'use strict';
const {KBVertex, Base, Record, KBEdge} = require('./base');
const {Feature} = require('./feature');
const {AttributeError} = require('./error');


/**
 * @class
 * @extends KBVertex
 */
class Position extends KBVertex {

    static createClass(db) {
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true})
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
        if (curr.pos == null || other.pos == null) {
            throw new TypeError('cannot compare objects where pos is not defined');
        }
        if (curr.pos < other.pos) {
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
class Range extends KBVertex {
    validateContent(content, positionClass) {
        if (content.start == undefined || content.end == undefined) {
            throw new AttributeError('both start and end must be specified and not null');
        }
        content.start = positionClass.validateContent(content.start);
        content.end = positionClass.validateContent(content.end);
        if (content.start.uuid == content.end.uuid) {
            throw new AttributeError(`range start and end cannot point to the same node: ${content.start.uuid}`);
        }
        return super.validateContent(content);
    }

    createRecord(opt, positionClass) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(opt, positionClass);
            // start the transaction
            var commit = this.db.conn
                .let('startPos', (tx) => {
                    // create the start position
                    return tx.create(positionClass.constructor.createType, positionClass.constructor.clsname)
                        .set(args.start);
                }).let('endPos', (tx) => {
                    // create the end position
                    return tx.create(positionClass.constructor.createType, positionClass.constructor.clsname)
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
    }

    static createClass(db, positionClass) {
        const props = [
            {name: 'start', type: 'link', mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: 'end', type: 'link', mandatory: true, notNull: true, linkedClass: Position.clsname}
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
class GenomicPosition extends KBVertex {

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
}

/**
 * @class
 * @extends KBVertex
 */
class ExonicPosition extends KBVertex {

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
}

/**
 * @class
 * @extends KBVertex
 */
class CodingSequencePosition extends KBVertex {

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

}

/**
 * @class
 * @extends KBVertex
 */
class ProteinPosition extends KBVertex {

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
}

/**
 * @class
 * @extends KBVertex
 */
class CytobandPosition extends KBVertex {

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
        if (curr.arm === other.arm) {
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
}



module.exports = {Position, Range, ProteinPosition, GenomicPosition, ExonicPosition, CodingSequencePosition, CytobandPosition};
