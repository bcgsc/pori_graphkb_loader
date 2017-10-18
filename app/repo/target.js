const {Base, KBVertex} = require('./base');
const {Context} = require('./context');
const Promise = require('bluebird');

class Target extends KBVertex {
    
    static createClass(db) {
        const props = [
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'type', type: 'string', mandatory: false},
        ];

        const idxs = [{
            name: this.clsname + '.index_name',
            type: 'unique',
            metadata: {ignoreNullValues: false},
            properties: ['name' ,'deleted_at'],
            'class':  this.clsname
        }];

        return Base.createClass({db, clsname: this.clsname, superClasses: Context.clsname, properties: props, indices: idxs})
            .then(() => {
                return this.loadClass(db);
            });
    }
}

module.exports = {Target};
