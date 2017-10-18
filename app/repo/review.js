const {Base, KBVertex, KBEdge} = require('./base');
const {AttributeError} = require('./error');
const {Context} = require('./context');
const {Statement} = require('./statement');
const Promise = require('bluebird');

class Review extends KBVertex {
    
    static createClass(db) {
        const props = [
            {name: 'comment', type: 'string', mandatory: true, notNull: true},
            {name: 'approved', type: 'boolean', mandatory: true, notNull: true},
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: Context.clsname, properties: props})
            .then(() => {
                return this.loadClass(db);
            });
    }
}

class ReviewAppliesTo extends KBEdge {

    validateContent(content) {
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        if (tgt['@class'] === undefined) {
            tgt['@class'] = Statement.clsname;
        } else if (! this.db.models[tgt['@class']].isOrHasAncestor(Statement.clsname)) {
            return Promise.reject(new AttributeError(`edge target must be a descendant of statenent. Found '${tgt['@class']}'`));
        }
        if (src['@class'] === undefined) {
            src['@class'] =  Review.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Review.clsname)) {
            return Promise.reject(new AttributeError(`edge source must be a descendant of review. Found: '${src['@class']}'`));
        }
        if (tgt.uuid && src.uuid && tgt.uuid === src.uuid) {
            return Promise.reject(new AttributeError('a statement cannot require itself'));
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        const props = [
            {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Review.clsname},
            {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
            .then(() => {
                return this.loadClass(db);
            });
        
    }
}

module.exports = {Review, ReviewAppliesTo};
