'use strict';
const {Base, KBVertex} = require('./base');
const {AttributeError} = require('./error');
const currYear = require('year');

/**
*
* @todo take versioning into account by implementing partial indexes
* @todo make sure the value of year is provided in yyyy format
* @todo more properties to be added to journal class
*
*/

/**
 * @class
 * @extends Base
 */
class Evidence extends Base {
    
    static createClass(db){
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname, isAbstract: true})
                .then((result) => {
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
 * @extends Base
 */
class Publication extends Base {

    validateContent(content, journalClass) {
        if ([content.title, content.journal, content.year].some(x => x == undefined)) {
            throw new AttributeError('violated null constraint');
        } else if ( content.year > currYear('yyyy') ) {
            throw new AttributeError('publication year cannot be in the future');
        }

        content.journal = journalClass.validateContent(content.journal);
        content.title = content.title.toLowerCase();
        if (content.doi != undefined || content.pmid != undefined ) {
            content.doi = content.doi.toLowerCase();
            content.pmid = content.pmid.toLowerCase();
        }
        
        return super.validateContent(content);
    }

    createRecord(opt, journalClass) {
        return new Promise((resolve, reject) => {
            const args = this.validateContent(opt, journalClass);
            var commit = this.dbClass.db
                .let('journalName', (trs) => {
                    return trs.create(journalClass.constructor.createType, journalClass.constructor.clsname).set(args.journal);
                }).let('link', (trs) => {
                    //connect the nodes
                    const sub = Object.assign({}, args);
                    delete sub.journal;
                    return trs.create(this.constructor.createType, this.constructor.clsname).set(sub).set('journal = $journalName');
                }).commit();
            commit.return('$link').one().then((record) => {
                this.dbClass.db.record.get(record.journal).then((journalName) => {
                    record.journal = journalName;
                    resolve(record);
                }).catch((error) => { 
                    reject(error); 
                });
            }).catch((error) => {
                reject(error);
            });
        });
    }

    static createClass(db){
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'journal', type: 'link', mandatory: true, notNull: true, linkedClass: Evidence.clsname},
                {name: 'year', type: 'integer', mandatory: true, notNull: true},
                {name: 'title', type: 'string', mandatory: true, notNull: true},
                {name: 'doi', type: 'string', mandatory: false},
                {name: 'pmid', type: 'integer', mandatory: false},
            ];
            const idxs = [{
                name: this.clsname + '.index_jyt',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['journal', 'year', 'title'],
                'class':  this.clsname
            }];
            super.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, indices: idxs})
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
 * @extends Base
 */
class Journal extends Base {

    validateContent(content) {
        if (content.name == undefined) {
            throw new AttributeError('violated null constraint');
        }
        content.name = content.name.toLowerCase();
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
                properties: ['name'],
                'class':  this.clsname
            }];
            super.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, indices: idxs})
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
 * @extends Base
 */
class Study extends Base {

    validateContent(content) {
        if ([content.title, content.year].some(x => x == undefined)) {
            throw new AttributeError('violated null constraint');
        } else if ( content.year > currYear('yyyy') ) {
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
                properties: ['title', 'year'],
                'class':  this.clsname
            }];
            super.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, indices: idxs})
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
 * @extends Base
 */
class ClinicalTrial extends Base {

    validateContent(content) {
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [

                {name: 'phase', type: 'integer'},
                {name: 'trialID', type: 'string'},
                {name: 'officialTitle', type: 'string'},
                {name: 'summary', type: 'string'}
            ];
            const idxs = [{
                name: this.clsname + '.index_trialID',
                type: 'unique',
                metadata: {ignoreNullValues: true},
                properties: ['trialID'],
                'class':  this.clsname
            },
            {
                name: this.clsname + '.index_officialTitle',
                type: 'unique',
                metadata: {ignoreNullValues: true},
                properties: ['officialTitle'],
                'class':  this.clsname
            }];
            super.createClass({db, clsname: this.clsname, superClasses: Study.clsname, properties: props, indices: idxs})
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
 * @extends Base
 */
class ExternalSource extends Base {

    validateContent(content) {
        if (content.url == undefined || content.extractionDate == undefined) {
            throw new AttributeError('violated null constraint');
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'title', type: 'string'},
                {name: 'url', type: 'string', mandatory: true, notNull: true},
                {name: 'extractionDate', type: 'long', mandatory: true, notNull: true}
            ];
            const idxs = [{
                name: this.clsname + '.index_urlDate',
                type: 'unique',
                metadata: {ignoreNullValues: true},
                properties: ['url', 'extractionDate'],
                'class':  this.clsname
            }];
            super.createClass({db, clsname: this.clsname, superClasses: Evidence.clsname, properties: props, indices: idxs})
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