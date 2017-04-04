"use strict";
const Base = require('./base');

/**
 * @class
 * @extends Base
 */
class Range extends Base {

    /* TODO */

}

/**
 * @class
 * @extends Base
 */
class Position extends Base {

    static createClass(db) {
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: 'V', is_abstract: true})
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

    /* TODO */

}

/**
 * @class
 * @extends Base
 */
class CodingSequencePosition extends Base {

    /* TODO */

}

/**
 * @class
 * @extends Base
 */
class ProteinPosition extends Base {

    /* TODO */

}

/**
 * @class
 * @extends Base
 */
class CytobandPosition extends Base {

    /* TODO */

}


module.exports = {Range, ProteinPosition, GenomicPosition, ExonicPosition, CodingSequencePosition, ProteinPosition, CytobandPosition};
