const {Base, KBVertex, KBEdge, Record, KBUser} = require('./base');
const {AttributeError, NoResultFoundError, ControlledVocabularyError} = require('./error');
const {Context} = require('./context');
const {Statement} = require('./statement')
const Promise = require('bluebird');

class Review extends KBEdge {

    validateContent(content) {
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        if (tgt['@class'] === undefined) {
            tgt['@class'] = Statement.clsname;
        } else if (! this.db.models[tgt['@class']].isOrHasAncestor(Statement.clsname)) {
            throw new AttributeError(`edge target must be a descendant of statenent. Found '${tgt['@class']}'`);
        }
        if (src['@class'] === undefined) {
            src['@class'] =  KBUser.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(KBUser.clsname)) {
            throw new AttributeError(`edge source must be a descendant of KBUser. Found: '${src['@class']}'`);
        }
        if (tgt.uuid && src.uuid && tgt.uuid === src.uuid) {
            throw new AttributeError('a statement cannot require itself');
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        return new Promise((resolve, reject) => {
            const props = [
                {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: KBUser.clsname},
                {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
                {name: 'status',  type: 'string', mandatory: true, notNull: true}
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

module.exports = {Review};
