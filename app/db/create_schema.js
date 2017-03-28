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
//         v.property.create({name: 'edit_version', mandatory: true, notNull: true, type: 'integer'})
//     });

// create the context abstract class
repo.model.context.create()
    .catch((err) => {
        if (err.type != 'com.orientechnologies.orient.core.exception.OSchemaException') {
            throw err;
        } else {
            console.log('ignoring error:', err.message);
        }
    }).then(() => {
        // create the feature class
        repo.model.feature.create()
            .then(() => { console.log('created feature class'); })
            .catch((error) => { console.log(error.message); });
        // create the disease class
        db.class.create('disease', context.name)
            .then((disease) => {
                disease.property.create({name: "name", type: "string", mandatory: true, notNull: true})
                    .then(() => {
                        // build the index to ensure no duplicate disease names
                        return db.index.create({
                            name: disease.name + '.index_name',
                            type: 'unique',
                            metadata: {ignoreNullValues: false},
                            properties: 'name',
                            'class':  disease.name
                        });
                    });
            });
        // create the therapy class
        db.class.create('therapy', context.name)
            .then((therapy) => {
                therapy.property.create({name: "name", type: "string", mandatory: true, notNull: true})
                    .then(() => {
                        // build the index to ensure no duplicate therapy names
                        return db.index.create({
                            name: therapy.name + '.index_name',
                            type: 'unique',
                            metadata: {ignoreNullValues: false},
                            properties: 'name',
                            'class':  therapy.name
                        });
                    });
            });
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

repo.model.evidence.create()
    .catch((err) => {
        if (err.type != 'com.orientechnologies.orient.core.exception.OSchemaException') {
            throw err;
        } else {
            console.log('ignoring error:', err.message);
        }
    }).then(() => {
        // success, add properties and create the dependant classes
        // create the publication class
        repo.model.publication.create()
            .then((cls) => {
                console.log('created class:', cls);
            }).catch((error) => {
                console.log('error creating class:', error.message);
            })
        // create the clinical trial class
        //db.class.create('study', 'evidence')
        //.then((evidence) => {
        //    console.log('created class', evidence.name);
        //}).catch((err) => {
        //    console.log(err.type, err.message);
        //});
        //// create the external DB class
        //db.class.create('external_db', 'evidence')
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
