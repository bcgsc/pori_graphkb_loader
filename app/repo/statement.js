const {Base, KBVertex, KBEdge, Record} = require('./base');
const {AttributeError, NoResultFoundError, ControlledVocabularyError} = require('./error');
const {Context} = require('./context');
const _ = require('lodash');
const Promise = require('bluebird');


const STATEMENT_TYPE = {
    BIOLOGICAL: 'biological',
    DIAGNOSTIC: 'diagnostic',
    THERAPEUTIC: 'therapeutic',
    PROGNOSTIC: 'prognostic',
    OCCURRENCE: 'occurrence'
}


class Statement extends KBVertex {
    
    validateContent(content) {
        if (! _.values(STATEMENT_TYPE).includes(content.type)) {
            throw new ControlledVocabularyError(`invalid type '${content.type}'`);
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        const props = [
            {name: 'type', type: 'string', mandatory: true, notNull: true},
            {name: 'relevance', type: 'string', mandatory: true, notNull: true},
        ];
        return new Promise((resolve, reject) => {
            Base.createClass({db, clsname: this.clsname, superClasses: Context.clsname, properties: props})
                .then(() => {
                    return this.loadClass(db);
                }).then((cls) => {
                    resolve(cls);
                }).catch((error) => {
                    reject(error);
                });
        });
    }
    /**
     * returns a list of statements that match the input events
     */ 
    searchByEvent(eventFilters, basicFilters, user) {
        // event.primary_feature.name
        // event.secondary_feature.name
        // type
        // relevance
        let query = `SELECT from ${Event.clsname} LET $feat = `
            + `(TRAVERSE ${FeatureDeprecatedBy.clsname}, ${FeatureAliasOf.clsname})`
        // get the features
        // for all events with features in (subquery)
        // follow the requires edges
        // return the statements with a fetch plan
    }
}


class AppliesTo extends KBEdge {
    
    validateContent(content) {
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        if (tgt['@class'] === undefined) {
            tgt['@class'] = Context.clsname;
        } else if (! this.db.models[tgt['@class']].isOrHasAncestor(Context.clsname) || this.db.models[tgt['@class']].isOrHasAncestor(Statement.clsname)) {
            throw new AttributeError(`edge target must be a descendant of context (except statement). Found '${tgt['@class']}'`);
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Statement.clsname)) {
            throw new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`);
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
                {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Context.clsname}
            ];
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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


class AsComparedTo extends KBEdge {
    
    validateContent(content) {
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        if (tgt['@class'] === undefined) {
            tgt['@class'] = Context.clsname;
        } else if (! this.db.models[tgt['@class']].isOrHasAncestor(Context.clsname) || this.db.models[tgt['@class']].isOrHasAncestor(Statement.clsname)) {
            throw new AttributeError(`edge target must be a descendant of context (except statement). Found '${tgt['@class']}'`);
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Statement.clsname)) {
            throw new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`);
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
                {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Context.clsname}
            ];
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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


class Requires extends KBEdge {

    validateContent(content) {
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        if (tgt['@class'] === undefined) {
            tgt['@class'] = Context.clsname;
        } else if (! this.db.models[tgt['@class']].isOrHasAncestor(Context.clsname)) {
            throw new AttributeError(`edge target must be a descendant of context. Found '${tgt['@class']}'`);
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Statement.clsname)) {
            throw new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`);
        }
        if (tgt.uuid && src.uuid && tgt.uuid === src.uuid) {
            throw new AttributeError('a statement cannot require itself');
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
                {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Context.clsname}
            ];
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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


class SupportedBy extends KBEdge {

    validateContent(content) {
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        if (tgt['@class'] === undefined) {
            tgt['@class'] = Evidence.clsname;
        } else if (! this.db.models[tgt['@class']].isOrHasAncestor(Evidence.clsname)) {
            throw new AttributeError(`edge target must be a descendant of context. Found '${tgt['@class']}'`);
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Statement.clsname)) {
            throw new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`);
        }
        if (tgt.uuid && src.uuid && tgt.uuid === src.uuid) {
            throw new AttributeError('a statement cannot require itself');
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
                {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Context.clsname},
                {name: 'quote', type: 'string', mandatory: false, notNull: true}
            ];
            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
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

module.exports = {Statement, AppliesTo, AsComparedTo, Requires, SupportedBy, STATEMENT_TYPE};
