'use strict';
const {Base, KBVertex, KBEdge, Record, KBUser} = require('./base');
const {AttributeError, NoResultFoundError} = require('./error');
const currYear = require('year');

/**
*
* @todo more properties to be added to journal class
*
*/

/**
 * @class
 * @extends KBVertex
 */
class Evidence extends KBVertex {

    static createClass(db){
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true})
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
 * @swagger
 * definitions:
 *  Publication:
 *      type: object
 *      properties:
 *          title:
 *              type: string
 *          journal:
 *              type: object
 *          year:
 *              type: integer
 *          doi:
 *              type: string
 *          pubmed:
 *              type: integer
 */
class Publication extends KBVertex {

    validateContent(args) {
        const content = Object.assign({}, args)
        if ([content.title, content.year].some(x => x == undefined)) {
            throw new AttributeError('violated null constraint');
        } else if ((content.year < 1000) || (content.year > currYear('yyyy'))) {
            throw new AttributeError('publication year cannot be too old or in the future');
        }
        // content.journal = journalClass.validateContent({name: content.journal.name, created_by: content.created_by});
        content.title = content.title.toLowerCase();
        if (content.doi != undefined || content.pmid != undefined) {
            if (content.pmid !== parseInt(content.pmid, 10)) {
                // if pmid is not an integer
                throw new AttributeError('PMID must be an integer');
            } else { 
                content.doi = content.doi != undefined ? content.doi.toLowerCase() : undefined;
            }
        }

        return super.validateContent(content);
    }

    createRecord(opt={}, user) {
        const content = Object.assign({}, opt)
        content.created_by = true;
        const args = this.validateContent(content);
        return new Promise((resolve, reject) => {
            let journal = args.journal ? new Record(args.journal, Journal.clsname) : null;

            Promise.all([
                journal == null || journal.hasRID ? Promise.resolve(journal) : this.db.models.Journal.selectExactlyOne(journal.content),
                user.rid != null ? Promise.resolve(user) : this.selectExactlyOne({username: user, '@class': KBUser.clsname})
            ]).then((pList) => {
                [journal, user] = pList;
                if (journal == null) {
                    delete args.journal;
                } else {
                    args.journal = journal.rid;
                }
                args.created_by = user.rid;
                return this.conn.create(args);
            }).then((rec) => {
                rec.journal = journal ? journal.content : journal;
                rec.created_by = user.content;
                resolve(new Record(rec, this.constructor.clsname));
            }).catch((error) => {
                reject(error);
            });
        });                    
    }

    static createClass(db){
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'journal', type: 'link', mandatory: false, notNull: true, linkedClass: Journal.clsname},
                {name: 'year', type: 'integer', mandatory: true, notNull: true},
                {name: 'title', type: 'string', mandatory: true, notNull: true},
                {name: 'doi', type: 'string', mandatory: false},
                {name: 'pmid', type: 'integer', mandatory: false},
            ];
            const idxs = [{
                name: this.clsname + '.index_jyt',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['deleted_at', 'journal', 'year', 'title'],
                'class':  this.clsname
            }];
            Base.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, indices: idxs})
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
 * @extends KBVertex
 */
class Journal extends KBVertex {

    validateContent(content) {
        if (content.name !== undefined) {
            content.name = content.name.toLowerCase();
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'name', type: 'string', mandatory: true, notNull: true},
            ];
            const idxs = [{
                name: this.clsname + '.index_name',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['deleted_at', 'name'],
                'class':  this.clsname
            }];
            Base.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, isAbstract: false, indices: idxs})
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
 * @extends KBVertex
 */
class Study extends KBVertex {

    validateContent(content) {
        if (content.title == undefined || content.year == undefined) {
            throw new AttributeError('violated null constraint');
        } else if ((content.year < 1000) || (content.year > currYear('yyyy'))) {
            throw new AttributeError('study year cannot be in the future');
        }

        // TODO: Validate year
        content.title = content.title.toLowerCase();
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'title', type: 'string', mandatory: true, notNull: true},
                {name: 'year', type: 'integer', mandatory: true, notNull: true},
                {name: 'sample_population', type: 'string'},
                {name: 'sample_population_size', type: 'integer'},
                {name: 'method', type: 'string'},
                {name: 'url', type: 'string'}
            ];
            const idxs = [{
                name: this.clsname + '.index_ty',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['deleted_at', 'title', 'year'],
                'class':  this.clsname
            }];
            Base.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, isAbstract: false, indices: idxs})
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
 * @extends KBVertex
 */
class ClinicalTrial extends KBVertex {

    validateContent(content) {
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [

                {name: 'phase', type: 'integer'},
                {name: 'trial_id', type: 'string'},
                {name: 'official_title', type: 'string'},
                {name: 'summary', type: 'string'}
            ];
            const idxs = [{
                name: this.clsname + '.index_trial_id',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['deleted_at','trial_id'],
                'class':  this.clsname
            },
            {
                name: this.clsname + '.index_official_title',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['deleted_at','official_title'],
                'class':  this.clsname
            }];
            Base.createClass({db, clsname: this.clsname, superClasses: Study.clsname, properties: props, isAbstract: false, indices: idxs})
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
 * @extends KBVertex
 */
class ExternalSource extends KBVertex {

    validateContent(content) {
        if (content.url == undefined || content.extraction_date == undefined) {
            throw new AttributeError('violated null constraint');
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'title', type: 'string'},
                {name: 'url', type: 'string', mandatory: true, notNull: true},
                {name: 'extraction_date', type: 'string', mandatory: true, notNull: true}
            ];
            const idxs = [{
                name: this.clsname + '.index_url_date',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['deleted_at', 'url', 'extraction_date'],
                'class':  this.clsname
            }];
            Base.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, isAbstract: false, indices: idxs})
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

module.exports = {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource};
