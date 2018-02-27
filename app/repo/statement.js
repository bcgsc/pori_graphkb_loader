const {Base, KBVertex, KBEdge, Record} = require('./base');
const {AttributeError, NoResultFoundError, ControlledVocabularyError} = require('./error');
const {Context} = require('./context');
const {Evidence} = require('./evidence');
const _ = require('lodash');
const Promise = require('bluebird');


const STATEMENT_TYPE = {
    BIOLOGICAL: 'biological',
    DIAGNOSTIC: 'diagnostic',
    THERAPEUTIC: 'therapeutic',
    PROGNOSTIC: 'prognostic',
    OCCURRENCE: 'occurrence'
};


class Statement extends KBVertex {
    
    validateContent(content) {
        if (! _.values(STATEMENT_TYPE).includes(content.type)) {
            return Promise.reject(new ControlledVocabularyError(`invalid type '${content.type}'`));
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        const props = [
            {name: 'type', type: 'string', mandatory: true, notNull: true},
            {name: 'relevance', type: 'string', mandatory: true, notNull: true},
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: Context.clsname, properties: props})
            .then(() => {
                return this.loadClass(db);
            });
    }
    /**
     * method searches statements based on related events and evidence
     */ 
    async search(inputParams) {
        const where = [];
        const params = {};
        // select statements where s.requires.event.primary_feature.name = primary_feature_name
        for (let queryKey of Object.keys(inputParams)) {
            let target;
            const value = inputParams[queryKey];
            let comparisonOperator = value instanceof Array ? 'in' : '='; 
            switch (queryKey) {
                case 'primary_feature':
                    target = `out('requires').primary_feature.name.toLowerCase()`;
                    break;
                case 'secondary_feature':
                    target = `out('requires').secondary_feature.name.toLowerCase()`;
                    break;
                case 'event_type':
                    target = `out('requires').type`;
                    break;
                case 'event_absence_of':
                    target = `out('requires').absence_of`;
                    break;
                case 'zygosity':
                    target = `out('requires').zygosity`;
                    break;
                case 'event_subtype':
                    target = `out('requires').subtype`;
                    break;
                case 'statement_type':
                    target = `type`;
                    break;
                case 'germline':
                    target = `out('requires').germline`;
                    break;
                case 'relevance':
                    target = `relevance`;
                    break;
                case 'event_term':
                    target = `out('requires').term`;
                    break;
                case 'evidence_class':
                    target = `out('supported_by').@class`
                    break;
                case 'disease':
                    target = `out('requires').name`;
                    break;
                case 'min_evidence_count':
                    comparisonOperator = '>='
                    target = `out('supported_by').size()`;
                    break;
                default:
                    return Promise.reject(new AttributeError(`Invalid input query parameter: ${queryKey}`));
            }
            if (value instanceof Array) {
                for (let index in value) {
                    try {
                        value[index] = value[index].toLowerCase();
                    } catch (err) {}
                }
            } else {
                try {
                    value = value.toLowerCase();
                } catch (err) {}
            }
            params[queryKey] = value;
            where.push(`${target} ${comparisonOperator} :${queryKey}`);
        }
        const sql = `select from statement where ${where.join(' and ')}`;
        console.log('\t', sql);
        console.log('\t', params);
        return await this.db.conn.query(sql,{
            params: params,
            fetchPlan: 'out_requires.in:0 out_requires.in.primary_feature:0 out_requires.in.secondary_feature:0 out_applies_to.in:0 out_supported_by.in:0'
        });
    }
}


class AppliesTo extends KBEdge {
    
    validateContent(content) {
        const tgt = content.in.content || content.in;
        const src = content.out.content || content.out;
        if (tgt['@class'] === undefined) {
            tgt['@class'] = Context.clsname;
        } else if (! this.db.models[tgt['@class']].isOrHasAncestor(Context.clsname) || this.db.models[tgt['@class']].isOrHasAncestor(Statement.clsname)) {
            return Promise.reject(new AttributeError(`edge target must be a descendant of context (except statement). Found '${tgt['@class']}'`));
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Statement.clsname)) {
            return Promise.reject(new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`));
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        const props = [
            {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
            {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Context.clsname}
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
            .then(() => {
                return this.loadClass(db);
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
            return Promise.reject(new AttributeError(`edge target must be a descendant of context (except statement). Found '${tgt['@class']}'`));
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Statement.clsname)) {
            return Promise.reject(new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`));
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        const props = [
            {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
            {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Context.clsname}
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
            .then(() => {
                return this.loadClass(db);
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
            return Promise.reject(new AttributeError(`edge target must be a descendant of context. Found '${tgt['@class']}'`));
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Statement.clsname)) {
            return Promise.reject(new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`));
        }
        if (tgt.uuid && src.uuid && tgt.uuid === src.uuid) {
            return Promise.reject(new AttributeError('a statement cannot require itself'));
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        const props = [
            {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
            {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Context.clsname}
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
            .then(() => {
                return this.loadClass(db);
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
            return Promise.reject(new AttributeError(`edge target must be a descendant of context. Found '${tgt['@class']}'`));
        }
        if (src['@class'] === undefined) {
            src['@class'] = Statement.clsname;
        } else if (! this.db.models[src['@class']].isOrHasAncestor(Statement.clsname)) {
            return Promise.reject(new AttributeError(`edge source must be a descendant of statement. Found: '${src['@class']}'`));
        }
        if (tgt.uuid && src.uuid && tgt.uuid === src.uuid) {
            return Promise.reject(new AttributeError('a statement cannot require itself'));
        }
        return super.validateContent(content);
    }

    static createClass(db) {
        const props = [
            {name: 'out', type: 'link', mandatory: true, notNull: true, linkedClass: Statement.clsname},
            {name: 'in', type: 'link', mandatory: true, notNull: true, linkedClass: Evidence.clsname},
            {name: 'quote', type: 'string', mandatory: false, notNull: true}
        ];
        return Base.createClass({db, clsname: this.clsname, superClasses: KBEdge.clsname, isAbstract: false, properties: props})
            .then(() => {
                return this.loadClass(db);
            });
        
    }
}

module.exports = {Statement, AppliesTo, AsComparedTo, Requires, SupportedBy, STATEMENT_TYPE};
