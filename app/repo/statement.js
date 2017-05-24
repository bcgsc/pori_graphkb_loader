const {Base, KBVertex, KBEdge, Record} = require('./base');
const {AttributeError, NoResultFoundError} = require('./error');
const {Context} = require('./context');


const STATEMENT_TYPE = {
    BIOLOGICAL: 'biological',
    DIAGNOSTIC: 'diagnostic',
    THERAPEUTIC: 'therapeutic',
    PROGNOSTIC: 'prognostic'
}


class Statement extends KBVertex {
    
    validateContent(content) {
        if (! _.values(STATEMENT_TYPE).includes(content.type)) {
            throw new AttributeError(`invalid type '${content.type}'`);
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
}


class AppliesTo extends KBEdge {
    
    validateContent(content) {
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        if (tgt['@class'] === undefined) {
            tgt['@class'] = Context.clsname;
        } else if (! this.db.models[tgt['@class']].superClasses.includes(Context.clsname)) {
            throw new AttributeError(`edge target must be a descendant of context. Found '${tgt['@class']}'`);
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].superClasses.includes(Statement.clsname)) {
            throw new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`);
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {

            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: []})
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
        } else if (! this.db.models[tgt['@class']].superClasses.includes(Context.clsname)) {
            throw new AttributeError(`edge target must be a descendant of context. Found '${tgt['@class']}'`);
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].superClasses.includes(Statement.clsname)) {
            throw new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`);
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {

            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: []})
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
            tgt['@class'] = Statement.clsname;
        } else if (! this.db.models[tgt['@class']].superClasses.includes(Statement.clsname)) {
            throw new AttributeError(`edge target must be a descendant of context. Found '${tgt['@class']}'`);
        }
        if (src['@class'] === undefined) {
            src['@class'] = Context.clsname;
        } else if (! this.db.models[src['@class']].superClasses.includes(Context.clsname)) {
            throw new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`);
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {

            Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: []})
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


module.exports = {Statement, AppliesTo, AsComparedTo, Requires, STATEMENT_TYPE};
