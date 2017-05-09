const {Base, KBVertex} = require('./base');
const {AttributeError} = require('./error');
const {Context} = require('./context');

/**
 * @class
 * @extends Base
 */
class Disease extends Base {

    validateContent(content) {

        if (content.doid != undefined || content.name != undefined) {
            if (! content.doid % 1 === 0) {
                // if doid is not an integer
                throw new AttributeError('DOID must be an integer');
            } else {
                content.name = content.doi.toLowerCase();
            }
        } else {
            throw new AttributeError('violated null constraint');
        }

        return super.validateContent(content);
    }

    static createClass(db) {
        // create the disease class
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'name', type: 'string', mandatory: true, notNull: true},
                {name: 'doid', type: 'integer', mandatory: true, notNull: true}
            ];

            const idxs = [{
                name: this.clsname + '.index_doid',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['doid' , 'deleted_at'],
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