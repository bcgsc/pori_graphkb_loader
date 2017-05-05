const {Base, KBVertex} = require('./base');
const cache = require('./cached/data');


class Vocab extends Base {

    static createClass(db) {
        /**
         * creates the vocab class ad simultaneously clears the cache.vocab
         */
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
                    return Promise.all([
                        this.loadClass(db),
                        fetchValues(db)
                    ]);
                }).then((plist) => {
                    cache.vocab = plist[1];
                    resolve(plist[0]);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    createRecord(content={}) {
        return new Promise((resolve, reject) => {
            super.createRecord(content)
                .then((record) => {
                    if (cache.vocab[record.class] == undefined) {
                        cache.vocab[record.class] = {};
                    }
                    if (cache.vocab[record.class][record.property] == undefined) {
                        cache.vocab[record.class][record.property] = {};
                    }
                    cache.vocab[record.class][record.property][record.term] = record;
                    resolve(record);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
}


const fetchValues = (db) => {
    // pull the table from the db
    return new Promise((resolve, reject) => {
        const local = {};
        db.select().from(Vocab.clsname).where({deleted_at: null}).all()  // all active records
            .then((records) => {
                for (let r of records) {
                    if (local[r.class] == undefined) {
                        local[r.class] = {};
                    }
                    if (local[r.class][r.property] == undefined) {
                        local[r.class][r.property] = {};
                    }
                    local[r.class][r.property][r.term] = r;
                }
                resolve(local);
            }, (error) => {
                reject(error);
            });
    });
}


module.exports = {Vocab, fetchValues};
