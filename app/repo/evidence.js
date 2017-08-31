'use strict';
const {Base, KBVertex, Record, KBUser} = require('./base');
const {AttributeError} = require('./error');
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
        const content = Object.assign({}, args);
        if (content.year != null && (content.year < 1000) || (content.year > currYear('yyyy'))) {
            throw new AttributeError('publication year cannot be too old or in the future');
        }
        content.title = content.title.toLowerCase();
        if (content.doi != undefined || content.pmid != undefined) {
            if (content.pmid !== parseInt(content.pmid, 10)) {
                // if pmid is not an integer
                content.pmid = parseInt(content.pmid);
            } else { 
                content.doi = content.doi != undefined ? content.doi.toLowerCase() : undefined;
            }
        }

        return super.validateContent(content);
    }

    createRecord(opt={}, user) {
        return new Promise((resolve, reject) => {
            const content = Object.assign({}, opt);
            content.created_by = true;
            const args = this.validateContent(content);
            let selectJournal = true;
            if (args.journal == undefined) {
                selectJournal = false;
            } else if (args.journal.rid !== undefined) {
                selectJournal = false;
            } else if (args.journal.startsWith('#')) {
                selectJournal = false;
                args.journal = new Record({'@rid': args.journal}, 'journal');
            }
            let journal;
            Promise.all([
                selectJournal ? this.db.models.Journal.selectOrCreate(args.journal, user) : Promise.resolve(args.journal),
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
                rec.journal = journal == undefined ? null : journal.content;
                rec.user = user.content;
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
                {name: 'year', type: 'integer', mandatory: true, notNull: false},
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
        const args = Object.assign({year: null}, content);

        if (args.year != null) {
            if ((args.year < 1000) || (args.year > currYear('yyyy'))) {
                throw new AttributeError('study year cannot be in the future');
            } 
        }
            
        if (args.title == undefined && args.url == undefined) {
            throw new AttributeError('no title is provided');
        } else if (args.title == undefined && args.url != undefined) {
            args.title = args.url;
        }

        args.title = args.title.toLowerCase();
        return super.validateContent(args);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'title', type: 'string', mandatory: true, notNull: true},
                {name: 'year', type: 'integer', mandatory: true, notNull: false},
                {name: 'sample_population', type: 'string'},
                {name: 'sample_population_size', type: 'integer'},
                {name: 'method', type: 'string'},
                {name: 'url', type: 'string'}
            ];
            const idxs = [{
                name: this.clsname + '.index_ty',
                type: 'unique',
                metadata: {ignoreNullValues: true},
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
        const args = Object.assign(content);

        if (args.official_title == undefined || args.trial_id == undefined) {
                throw new AttributeError('mandatory property was not specified');
        }
            
        if (args.official_title == undefined && args.trial_id != undefined) {
            args.official_title = args.trial_id;
        }

        args.official_title = args.official_title.toLowerCase();
        return super.validateContent(args);
    }
    
    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'official_title', type: 'string', notNull: true},
                {name: 'phase', type: 'integer'},
                {name: 'trial_id', type: 'string'},
                {name: 'summary', type: 'string'}
            ];
            const idxs = [{
                name: this.clsname + '.index_trial_id',
                type: 'unique',
                metadata: {ignoreNullValues: true},
                properties: ['deleted_at','trial_id'],
                'class':  this.clsname
            },
            {
                name: this.clsname + '.index_official_title',
                type: 'unique',
                metadata: {ignoreNullValues: true},
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

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'title', type: 'string', mandatory: true, notNull: true},
                {name: 'url', type: 'string', mandatory: true, notNull: false},
                {name: 'extraction_date', type: 'string', mandatory: false, notNull: true}
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
