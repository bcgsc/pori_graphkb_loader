const settings = require('./settings');
const {Base, KBVertex} = require('./base');


class Vocab extends Base {

    static createClass(db) {
        const props = [
            {name: 'class', type: 'string', mandatory: true, notNull: true},
            {name: 'property', type: 'string', mandatory: true, notNull: true},
            {name: 'term', type: 'string', mandatory: true, notNull: true},
            {name: 'definition', type: 'string', mandatory: false, notNull: true}
        ];

        const idxs = [
            {
                name: `${this.clsname}_active_term_in_category_unique`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['class', 'property', 'term', 'deleted_at'],
                'class':  this.clsname
            }
        ];

        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: false, properties: props, indices: idxs})
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


const fetchValues = (db) => {
    // pull the table from the db
    return new Promise((resolve, reject) => {
        const cache = {};
        db.select().from(Vocab.clsname).where({deleted_at: null}).all()  // all active records
            .then((records) => {
                for (let r of records) {
                    if (cache[r.class] == undefined) {
                        cache[r.class] = {};
                        cache[r.class][r.property] = {};
                        cache[r.class][r.property][r.term] = r.definition;
                    } else if (cache[r.class][r.property] === undefined) {
                        cache[r.class][r.property] = {};
                        cache[r.class][r.property][r.term] = r.definition;
                    } else {
                        cache[r.class][r.property][r.term] = r.definition;
                    }
                }
                resolve(cache);
            }, (error) => {
                reject(error);
            });
    });
}


module.exports = {Vocab, fetchValues};
