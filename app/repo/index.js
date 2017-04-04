"use strict";
/*
 * Repository-layer. Responsible for operations which access the database
 */
const _ = require('lodash');
const connect = require('./connect');
const models = {};
_.assign(models, require('./evidence'));
_.assign(models, require('./context'));


const loadSchema = (db) => {
    /**
     * loads the db models from the db connection
     * @returns {Promise} if all models were loaded successfully
     */
    return new Promise((resolve, reject) => {
        const promises = Array.from(models, (cls) => cls.loadClass(db));
        Promise.all(promises)
            .then((classes) => {
                const result = {};
                for (let cls of classes) {
                    result[cls.clsname] = cls;
                }
                resolve(result);
            }).catch((error) => {
                reject(error);
            });
    });
}

/**
 * builds the schema from the models. Assumes an empty db
 * @param  {orientjs.Db} db the database connection object
 * @return {Promise}    {Base[]} array of loaded classes on success, {error} on fail
 */
const createSchema = (db) => {

    const p1 = new Promise((resolve, reject) => {
        // build the abstract classes and then their dependencies
        Evidence.createClass(db)
            .then((evidence) => {
                // TODO: create subclasses

            }).catch((error) => {
                reject(error);
            });
    });

    const p2 = new Promise((resolve, reject) => {
        Context.createClass(db)
            .then((context) => {
                // TODO: create subclasses
            }).catch((error) => {
                reject(error);
            });
    });

    return new Promise((resolve, reject) => {
        Promise.all([p1, p2])
            .then(() => {
                console.log('load the schema');
                return loadSchema(db);
            }).then((models) => {
                resolve(models);
            }).catch((error) => {
                reject(error);
            });
    });
}


module.exports = {
    models: models,
    loadSchema,
    createSchema,
    serverConnect: connect
};
