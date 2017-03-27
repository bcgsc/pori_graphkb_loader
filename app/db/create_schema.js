"use strict";

// required packages
import OrientDB from 'orientjs';
import conf from './../config/db';
import connect from './connect';

const repo = connect(conf);
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
db.class.create('context', 'V', null, true)
    .then((context) => {
        // create the feature class
        db.class.create('feature', context.name)
            .then((feature) => {
                feature.property.create({name: "name", type: "string", mandatory: true, notNull: true})
                    .then(() => {
                        return feature.property.create({name: "source", type: "string", mandatory: true, notNull: true});
                    }).then(() => {
                        // allow version to be null since we won't always know this info
                        return feature.property.create({name: "source_version", type: "string", mandatory: true, notNull: false});
                    }).then(() => {
                        return feature.property.create({name: "biotype", type: "string", mandatory: true, notNull: true})
                    });
            });
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
        console.log(err.type, err.message);
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

db.class.create('evidence', 'V', null, true)
.then((evidence) => {
    // success, add properties and create the dependant classes
    // create the publication class
    db.class.create('publication', 'evidence')
    .then((evidence) => {
        console.log('created class', evidence.name);
        // now add properties
        evidence.property.create({name: "journal", type: "string"})
            .then(() => {
                return evidence.property.create({name: "year", type: "integer"});
            }).then(() => {
                return evidence.property.create({name: "title", type: "string", mandatory: true, notNull: true});
            }).then(() => {
                return evidence.property.create({name: "pubmed_id", type: "integer"});
            }).then(() => {
                // create the index
                return db.index.create({
                    name: evidence.name + '.index_pubmed',
                    type: 'unique',
                    metadata: {ignoreNullValues: true},
                    properties: 'pubmed_id',
                    'class':  evidence.name
                });
            });
    }).catch((err) => {
        console.log(err.type, err.message);
    });
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
