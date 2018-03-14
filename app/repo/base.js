'use strict';
const {AttributeError, ControlledVocabularyError, MultipleResultsFoundError, NoResultFoundError, PermissionError, AuthenticationError} = require('./error');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');
const moment = require('moment');
const cache = require('./cache');
const {PERMISSIONS} = require('./constants');
const Promise = require('bluebird');


const checkAccess = (user, model, permissionsRequired) => {
    if (! user.permissions) {
        return false;
    }
    if (user.permissions[model.name] !== undefined && (permissionsRequired & user.permissions[model.name])) {
        return true;
    }
    for (let name of model.inherits) {
        if (user.permissions[name] !== undefined) {
            if (permissionsRequired & user.permissions[name]) {
                return true;
            }
        }
    }
    return false;
};


const create = async (db, opt) => {
    const {content, model, user} = opt;
    if (! checkAccess(user, model, PERMISSIONS.CREATE)) {
        throw new PermissionError(`insufficient permissions to create records in table ${model.name}`);
    }
    content.createdBy = user['@rid']; 
    const record = model.formatRecord(content, false, true);
    return await db.insert().into(model.name).set(record).one();
};

const select = async (db, opt) => {
    const activeOnly = opt.activeOnly === undefined ? true : opt.activeOnly;
    const exactlyN = opt.exactlyN === undefined ? null : opt.exactlyN;
    const fetchPlan = opt.fetchPlan || {'*': 1};
    const debug = opt.debug === undefined ? false : opt.debug;
    const params = Object.assign({}, opt.where);

    if (activeOnly) {
        params.deletedAt = null;
    }
    let query = db.select().from(opt.from).where(params);
    if (Object.keys(params).length == 0) {
        query = db.select().from(opt.from);
    }
    let statement = query.buildStatement();
    for (let key of Object.keys(query._state.params)) {
        let value = query._state.params[key];
        if (typeof value === 'string') {
            value = `'${value}'`;
        }
        statement = statement.replace(':' + key, `${value}`);
    }
    if (debug) {
        console.log('select query statement:', statement);
    }
    const recordList  = await query.fetch(fetchPlan).all();
    if (exactlyN !== null) {
        if (recordList.length === 0) {
            if (exactlyN === 0) {
                return [];
            } else {
                throw new NoResultFoundError(`query returned an empty list: ${statement}`);
            }
        } else if (exactlyN !== recordList.length) {
            throw new MultipleResultsFoundError(
                `query returned unexpected number of results. Found ${recordList.length} results `
                `but expected ${exactlyN} results: ${statement}`
            );
        } else {
            return recordList;
        }
    } else {
        return recordList;
    }
};

const remove = () => {};
const update = () => {};

/* return recordSelect
            .then((selectedRecord) => {
                currentRecord = selectedRecord;
                return currentUser.hasRID ? Promise.resolve(currentUser) : this.selectExactlyOne({username: currentUser, '@class': KBUser.clsname});
            }).then((userRecord) => {
                currentUser = userRecord;
                return this.isPermitted(currentUser, PERMISSIONS.UPDATE);
            }).then(() => {
                const duplicate = currentRecord.mutableAttributes();
                const timestamp = moment().valueOf();
                let updates = record.mutableAttributes();
                duplicate.deleted_at = timestamp; // set the deletion time
                duplicate.deleted_by = currentUser.rid;
                duplicate.uuid = currentRecord.content.uuid;

                updates.version += 1;
                updates.created_at = timestamp;
                updates.created_by = currentUser.rid;
                updates.deleted_by = null;

                // start the transaction
                var commit = this.db.conn
                    .let('updatedRID', (tx) => {
                        // update the existing node
                        return tx.update(`${currentRecord.rid}`).set(updates).return('AFTER @rid').where(currentRecord.staticAttributes());
                    }).let('duplicate', (tx) => {
                        //duplicate the old node
                        return tx.create(this.constructor.createType, this.constructor.clsname)
                            .set(duplicate);
                    }).let('historyEdge', (tx) => {
                        //connect the nodes
                        return tx.create(History.createType, History.clsname)
                            .from('$updatedRID')
                            .to('$duplicate');
                    }).commit();
                // const stat = commit.buildStatement();
                return commit.return('$updatedRID').one()
                    .then((rid) => {
                        return this.db.conn.record.get(rid);
                    }).then((record) => {
                        return new Record(record, this.constructor.clsname);
                    });
            });
*/
module.exports = {select, create, update, remove, checkAccess};
