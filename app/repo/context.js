'use strict';
const {Base, KBVertex} = require('./base');

/**
 * @class
 * @extends Base
 */
class Context extends Base {

    static createClass(db){
        return super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true})
            .then(() => {
                return this.loadClass(db);
            });
    }

}


module.exports = {Context};
