const {Base, KBVertex} = require('./base');
const {NoResultFoundError, AttributeError} = require('./error');
const cache = require('./cached/data');
const Promise = require('bluebird');


class Vocab extends KBVertex {
    
    validateContent(content) {
        const args = Object.assign({conditional: null, definition: ''}, content);
        return super.validateContent(args);
    }

    static createClass(db) {
        /**
         * creates the vocab class ad simultaneously clears the cache.vocab
         */
        const props = [
            {name: 'class', type: 'string', mandatory: true, notNull: true},
            {name: 'property', type: 'string', mandatory: true, notNull: true},
            {name: 'term', type: 'string', mandatory: true, notNull: true},
            {name: 'definition', type: 'string', mandatory: false, notNull: true},
            {name: 'conditional', type: 'string', mandatory: true, notNull: false}
        ];

        const idxs = [
            {
                name: `${this.clsname}_active_term_in_category_unique`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['class', 'property', 'term', 'deleted_at', 'conditional'],
                'class':  this.clsname
            }
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: false, properties: props, indices: idxs})
                .then(() => {
                    return Promise.all([
                        this.loadClass(db),
                        fetchValues(db)
                    ]);
                }).then((plist) => {
                    cache.vocab = plist[1];
                    return plist[0];
                });
    }

    createRecord(where={}, user) {
        return super.createRecord(where, user)
            .then((record) => {
                upsertCache(record.content);
                return record;
            });
    }

    deleteRecord(where={}, user) {
        return super.deleteRecord(where, user)
            .then((record) => {
                removeFromCache(record.content);
                return record;
            });
    }
    
    updateDefinition(where, user) {
        for (let req of ['class', 'property', 'term']) {
            if (where[req] == undefined) {
                return Promise.reject(new AttributeError(`required attribute '${req}'is missing`));
            }
        }
        return this.selectExactlyOne({
                'class': where.class,
                property: where.property,
                term: where.term,
                deleted_at: null,
                conditional: where.conditional || null
            }).then((record) => {
                if (! where.definition || record.content.definition === where.definition) {
                    return record;
                } else {
                    record.content.definition = where.definition;
                    return this.updateRecord(record, user);
                }
            });
    }

    addTermIfNotExists(term, user) {
        return this.selectExactlyOne({
                'class': term.class, property: term.property, term: term.term, deleted_at: null, conditional: term.conditional || null
            }).catch(NoResultFoundError, () => {
                return this.createRecord({
                    'class': term.class, property: term.property, term: term.term, definition: term.definition, conditional: term.conditional || null
                }, user);
            });
    }
    
    /**
     * adds new terminology if they do not already exist. Ignores existing terminology
     */
    createRecords(records, user) {
        return Promise.all(Array.from(records, x => { 
            return this.addTermIfNotExists(x, user); 
        }));
    }
}


const cacheIndexOf = (record) => {
    let indexOf = -1;
    try {
        for (let i=0; i < cache.vocab[record.class][record.property].length; i++) {
            let same = true;
            let r = cache.vocab[record.class][record.property][i];
            for (let key of ['class', 'term', 'property', 'conditional']) {
                if (record[key] != r[key]) {
                    same = false;
                    break;
                }
            }
            if (same) {
                indexOf = i;
                break;
            }
        }
    } catch (e) {
        if (!(e instanceof TypeError)) {
            throw e;
        }
    }
    return indexOf;
};


const upsertCache = (record) => {
    if (cache.vocab[record.class] == undefined) {
        cache.vocab[record.class] = {};
    }
    if (cache.vocab[record.class][record.property] == undefined) {
        cache.vocab[record.class][record.property] = [];
    }
    let indexOf =  cacheIndexOf(record);
    if (indexOf < 0) {
        cache.vocab[record.class][record.property].push(record);
    } else {
        cache.vocab[record.class][record.property][indexOf] = record;
    }
};


const removeFromCache = (record) => {
    let indexOf =  cacheIndexOf(record);
    if (indexOf >= 0) {
        cache.vocab[record.class][record.property].splice(indexOf, 1);
    }
};


const fetchValues = (dbconn) => {
    // pull the table from the db
    return dbconn.conn.select().from(Vocab.clsname).where({deleted_at: null}).all()  // all active records
            .then((records) => {
                const local = {};
                for (let r of records) {
                    if (local[r.class] == undefined) {
                        local[r.class] = {};
                    }
                    if (local[r.class][r.property] == undefined) {
                        local[r.class][r.property] = [];
                    }
                    local[r.class][r.property].push(r);
                }
                return local;
            });
};


module.exports = {Vocab, fetchValues};
