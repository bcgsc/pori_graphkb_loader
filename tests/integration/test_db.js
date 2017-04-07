"use strict";
const {expect} = require('chai');
const conf = require('./../config/db');
const {models, createSchema, loadSchema, serverConnect, ORIENT_DB_TIME_FORMAT} = require('./../../app/repo');
const _ = require('lodash');
const {DependencyError, AttributeError} = require('./../../app/repo/error');
const {Base, History, KBVertex, KBEdge} = require('./../../app/repo/base');


class MockVertexClass extends Base { // simple non-abstract class for tests
    static createClass(db) {
        return new Promise((resolve, reject) => {
            super.createClass({db, clsname: this.clsname, superClasses: KBVertex.clsname})
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

const expectDuplicateKeyError = (error) => {
    expect(error.message).to.include('duplicated key');
    expect(error.type).to.equal('com.orientechnologies.orient.core.storage.ORecordDuplicatedException');
    expect(error.name).to.equal('OrientDB.RequestError');
};

const expectAbstractClassError = (error) => {
    expect(error.message).to.include('abstract class');
    expect(error.type).to.equal('com.orientechnologies.orient.core.exception.OSchemaException');
    expect(error.name).to.equal('OrientDB.RequestError');
};

const expectNullConstraintError = (error) => {
    expect(error.message).to.include('cannot be null');
    expect(error.type).to.equal('com.orientechnologies.orient.core.exception.OValidationException');
    expect(error.name).to.equal('OrientDB.RequestError');
};


describe('database schema tests (empty db):', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        console.log('\n\nconnecting to the server');
        serverConnect(conf)
            .then((result) => {
                server = result;
                return server.create({name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
            }).then((result) => {
                console.log('created the test database', result.name);
                db = result;
                return db.class.list();
            }).then((clsList) => {
                done();
            }).catch((error) => {
                console.log('error in connecting', error);
                done(error);
            });
    });
    it('create KBVertex class', () => {
        return KBVertex.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['uuid', 'created_at', 'deleted_at', 'edit_version']);
                expect(KBVertex.clsname).to.equal('kbvertex');
                expect(KBVertex.createType).to.equal('vertex');
            });
    });
    it('create History class', () => {
        return History.createClass(db)
            .then((cls) => {
                expect(cls.propertyNames).to.have.members(['comment']);
                expect(History.clsname).to.equal('history');
                expect(History.createType).to.equal('edge');
            });
    });

    describe('History Tracking', () => {
        let mockRecord, mockClass;
        beforeEach((done) => {
            Promise.all([
                KBVertex.createClass(db),
                History.createClass(db)
            ]).then(() => {
                return MockVertexClass.createClass(db);
            }).then(() => {
                return MockVertexClass.loadClass(db);
            }).then((cls) => {
                mockClass = cls;
                return cls.createRecord();
            }).then((record) => {
                mockRecord = record;
                done();
            }).catch((error) => {
                done(error);
            });
        });
        it('update a mock record', () => {
            const uuid = mockRecord.uuid;
            const edit_version = mockRecord.edit_version;
            return mockClass.updateRecord(mockRecord, null, true)
                .then((record) => {
                    expect(record.uuid).to.equal(uuid);
                    expect(record.edit_version).to.equal(edit_version + 1);
                });
        });
    });
    describe('KBVertex dependent:', () => {
        beforeEach((done) => {
            KBVertex.createClass(db)
                .then((cls) => {
                    console.log('KBVertex class name', cls.constructor.clsname);
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('create the evidence schema model', () => {
            return models.Evidence.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(models.Evidence);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.true;
                    expect(result.dbClass.superClass).to.equal('kbvertex');
                });
        });
        it('create an evidence record (should error)', () => {
            return models.Evidence.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return result.createRecord(); // test creating a record?
                }).then((result) => {
                    throw new Error('expected error. class is abstract');
                }).catch((error) => {
                    return expectAbstractClassError(error);
                });
        });
        it('create the evidence-publication schema model', () => {
            return models.Evidence.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then(() => {
                    return models.Publication.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Publication);
                    expect(result).to.have.property('dbClass');
                    expect(result.propertyNames).to.include('pubmed_id', 'title', 'journal', 'year');
                    expect(result.isAbstract).to.be.false;
                });
        });
        describe('create publication records', () => {
            let pub = null;
            beforeEach((done) => {
                console.log('setting up the publication class');
                models.Evidence.createClass(db)
                    .then((result) => {
                        return models.Publication.createClass(db);
                    }).then((result) => {
                        pub = result;
                        done();
                    }).catch((error) => {
                        done(new DependencyError(error.message));
                    });
            });
            it('title only', () => {
                return pub.createRecord({title: 'title'})
                    .then((result) => {
                        expect(result).to.have.property('uuid');
                        expect(result).to.have.property('title');
                        expect(result.title).to.equal('title');
                        // should not have
                        expect(result).to.not.have.property('journal');
                        expect(result).to.not.have.property('year');
                    });
            });
            it('null title error', () => {
                return pub.createRecord({title: null})
                    .then((result) => {
                        throw new Error('Expected error. Violated title != null constraint');
                    }).catch((error) => {
                        return expectNullConstraintError(error);
                    });
            });
            it('pubmed duplicate error', () => {
                return pub.createRecord({title: 'title', pubmed_id: 1})
                    .then((result) => {
                        return pub.createRecord({title: 'title2', pubmed_id: 1});
                    }).then((result) => {
                        throw new Error('Expected error. Violated pubmed unique index constraint');
                    }).catch((error) => {
                        return expectDuplicateKeyError(error);
                    });
            });
            it('invalid attribute', () => {
                return pub.createRecord({title: 'title', pubmed_id: 1, invalid_attribute: 2})
                    .then((result) => {
                        throw new Error('Expected error. Invalid attribute');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
        });
        it('create the evidence-study schema model', () => {
            return models.Evidence.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then(() => {
                    return models.Study.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Study);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });
        it('create the evidence-external_db schema model', () => {
            return models.Evidence.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then(() => {
                    return models.ExternalDB.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.ExternalDB);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the context schema model', () => {
            return models.Context.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(models.Context);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.true;
                });
        });
        it('create the context-evaluation model', () => {
            return models.Context.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return models.Evaluation.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Evaluation);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                    expect(result.propertyNames).to.include('consequence');
                });
        });
        it('create the context-evaluation-comparison model', () => {
            return models.Context.createClass(db)
                .then(() => {
                    return models.Evaluation.createClass(db);
                }).catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return models.Comparison.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Comparison);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                    expect(result.propertyNames).to.include('consequence');
                });
        });
        it('create the context-feature model');
        it('create the context-disease model', () => {
            return models.Context.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return models.Disease.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Disease);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                    expect(result.propertyNames).to.include('name');
                });
        });
        it('create the context-therapy model', () => {
            return models.Context.createClass(db)
                .catch((error) => {
                    throw new DependencyError(error.message);
                }).then((result) => {
                    return models.Therapy.createClass(db);
                }).then((result) => {
                    expect(result).to.be.an.instanceof(models.Therapy);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                    expect(result.propertyNames).to.include('name');
                });
        });
        it('create the context-event model');
        it('create the context-event-vocab model');
        it('create the context-event-positional model');
        it('create the range model');
        it('create the position model');
        it('create the position-genomic model');
        it('create the position-cds model');
        it('create the position-protein model');
        it('create the position-cytoband model');
        it('create the position-exon model');
        it.skip('create the full schema', () => {
            return createSchema(db)
                .then((result) => {
                    console.log('result', Object.keys(result));
                    // check the abstract classes exist
                    expect(result).to.have.all.keys([
                        'evidence', 'context', 'publication', 'feature', 'disease', 'therapy'
                    ]);
                    // check the evidence and subclasses
                    expect(result.evidence).to.have.property('properties');
                    expect(result.evidence.properties).to.have.members([]);
                });
        });
    });
    afterEach((done) => {
        /* disconnect from the database */
        console.log('dropping the test database');
        server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                console.log('closing the server server');
                return server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error closing the server', error);
                done(error);
            });
    })
});


describe('Mock Class', () => {
    let cls;
    beforeEach(function(done) {
        cls = new MockVertexClass();
        done();
    });
    it('clsname', () => {
        expect(cls.constructor.clsname).to.equal('mock_vertex_class');
    });
});
