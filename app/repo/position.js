'use strict';
const {Base, KBVertex} = require('./base');
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
            var commit = this.dbClass.db
                .let('startPos', (tx) => {
                    // create the start position
                    return tx.create(positionClass.constructor.createType, positionClass.constructor.clsname)
                        .set(args.start);
                }).let('endPos', (tx) => {
                    // create the end position
                    // return tx.insert().into(positionClass.constructor.clsname).set(args.end).return("@rid.convert(\'string\')");
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
                        this.dbClass.db.record.get(record.start),
                        this.dbClass.db.record.get(record.end)
                    ]).then((positions) => {
                        record.start = positions[0];
                        record.end = positions[1];
                        resolve(record);
                    }).catch((error) => {
                        reject(error);
                    });
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    static createClass(db) {
        const props = [
            {name: 'start', type: 'link', mandatory: true, notNull: true, linkedClass: Position.clsname},
            {name: 'end', type: 'link', mandatory: true, notNull: true, linkedClass: Position.clsname}
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
            {name: 'pos', type: 'integer', mandatory: true, notNull: true, min: 1}
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
            {name: 'pos', type: 'integer', mandatory: true, notNull: true, min: 1}
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


module.exports = {Position, Range, ProteinPosition, GenomicPosition, ExonicPosition, CodingSequencePosition, CytobandPosition};
