const {Base, KBVertex} = require('./base');
const {NoResultFoundError} = require('./error');
const cache = require('./cached/data');
const Promise = require('bluebird');


class Vocab extends KBVertex {

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
            Base.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: false, properties: props, indices: idxs})
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

    createRecord(where={}) {
        return new Promise((resolve, reject) => {
            super.createRecord(where)
                .then((record) => {
                    if (cache.vocab[record.content.class] == undefined) {
                        cache.vocab[record.content.class] = {};
                    }
                    if (cache.vocab[record.content.class][record.content.property] == undefined) {
                        cache.vocab[record.content.class][record.content.property] = {};
                    }
                    cache.vocab[record.content.class][record.content.property][record.content.term] = record.content;
                    resolve(record);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    deleteRecord(where={}) {
        return new Promise((resolve, reject) => {
            super.deleteRecord(where)
                .then((record) => {
                    try {
                        delete cache.vocab[record.content.class][record.content.property][record.content.term];
                    } catch (e) {
                        if (! e instanceof TypeError) {
                            throw e;
                        } 
                    }
                    resolve(record);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    
    updateDefinition(where) {
        return new Promise((resolve, reject) => {
            for (let req of ['class', 'property', 'term']) {
                if (where[req] == undefined) {
                    throw new AttributeError(`required attribute '${req}'is missing`);
                }
            }
            this.selectExactlyOne({
                    'class': where.class,
                    property: where.property,
                    term: where.term,
                    deleted_at: null
                }).then((record) => {
                    if (record.content.definition === where.definition) {
                        resolve(record);
                    } else {
                        record.content.definition = where.definition;
                        return this.updateRecord(record.content);
                    }
                }).then((record) => {
                    resolve(record);
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    addTermIfNotExists(term) {
        return new Promise((resolve, reject) => {
            this.selectExactlyOne({
                    'class': term.class, property: term.property, term: term.term, deleted_at: null
                }).catch(NoResultFoundError, () => {
                    return this.createRecord({
                        'class': term.class, property: term.property, term: term.term, definition: term.definition
                    });
                }).then((record) => {
                    resolve(record);
                }).catch((error) => {
                    reject(error);
                });
        }); 
    }
    
    /**
     * adds new terminology if they do not already exist. Ignores existing terminology
     */
    createRecords(records) {
        return Promise.all(Array.from(records, x => { 
            return this.addTermIfNotExists(x); 
        }));
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
