'use strict';
const {Base, KBVertex} = require('./base');

/**
 * @class
 * @extends Base
 */
class Context extends Base {

    static createClass(db){
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true})
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


module.exports = {Context};
