"use strict";

// required packages
const OrientDB = require('orientjs');
const conf = require('./../../config/db');
const repo = require('./connect')(conf);

const db = repo.db;
const server = repo.server;
// now we have a db connection. We need to create the classes, properties and edges
// class function (name, extends, cluster, abstract)

// add the change_version attribute to all vertex and edges
// db.class.get('V')
//     .then((v) => {
//         v.property.create_class({name: 'edit_version', mandatory: true, notNull: true, type: 'integer'})
//     });

// create the context abstract class
repo.model.context.create_class()
    .catch((err) => {
        if (err.type != 'com.orientechnologies.orient.core.exception.OSchemaException') {
            throw err;
        } else {
            console.log('ignoring error:', err.message)
        }
    }).then(() => {
        // create the feature class
        repo.model.feature.create_class()
            .then((cls) => { console.log(`created ${cls.name} class`); })
            .catch((error) => { console.log(error.message); });
        // create the disease class
        repo.model.disease.create_class()
            .then((cls) => { console.log(`created ${cls.name} class`); })
            .catch((error) => { console.log(error.message); });
        // create the therapy class
        repo.model.therapy.create_class()
            .then((cls) => { console.log(`created ${cls.name} class`); })
            .catch((error) => { console.log(error.message); });
        // create the evaluation class


        // create the comparison class
    }).catch((err) => {
        console.log(err);
    });


// create the range abstract class
// create the position abstract class
// create the genomic position class
// create the protein position class
// create the cds position class
// create the cytoband position class
// create the exon position class

// create the user class

// create the evidence class set

repo.model.evidence.create_class()
    .catch((err) => {
        if (err.type != 'com.orientechnologies.orient.core.exception.OSchemaException') {
            throw err;
        } else {
            console.log('ignoring error:', err.message);
        }
    }).then(() => {
        // success, add properties and create the dependant classes
        // create the publication class
        repo.model.publication.create_class()
            .then((cls) => { console.log(`created ${cls.name} class`); })
            .catch((error) => { console.log(error.message); });
        // create the clinical trial class
        //db.class.create_class('study', 'evidence')
        //.then((evidence) => {
        //    console.log('created class', evidence.name);
        //}).catch((err) => {
        //    console.log(err.type, err.message);
        //});
        //// create the external DB class
        //db.class.create_class('external_db', 'evidence')
        //.then((evidence) => {
        //    console.log('created class', evidence.name);
        //}).catch((err) => {
        //    console.log(err.type, err.message);
        //});
    }).catch((err) => {
        console.log(err.type, err.message);
    });


// cleanup
const cleanup = (msg='') => {
    console.log('cleaning up', msg);
    db.close()
    .then(() => {
        server.close();
        process.exit();
    }).catch(err => {
        console.log('error in closing the db/server', err);
    });
};
process.on('SIGINT', cleanup);
process.on('uncaughtException', cleanup);
