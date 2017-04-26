"use strict";
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');
const _ = require('lodash');
const {DependencyError, AttributeError} = require('./../../app/repo/error');
const {Base, History, KBVertex, KBEdge} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');
const {Evidence, Study, Publication, ExternalSource} = require('./../../app/repo/evidence');
const moment = require('moment');



describe('Evidence schema tests:', () => {
    let server, db;
    beforeEach(function(done) { /* build and connect to the empty database */
        // set up the database server
        serverConnect(conf)
            .then((result) => {
                // create the empty database
                server = result;
                return server.create({name: conf.emptyDbName, username: conf.dbUsername, password: conf.dbPassword});
            }).then((result) => {
                db = result;
                return Promise.all([
                    KBVertex.createClass(db),
                    History.createClass(db),
                    KBEdge.createClass(db)
                ]);
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });
    it('test creating the evidence class', () => {
        return Evidence.createClass(db)
            .then((result) => {
                expect(result).to.be.an.instanceof(Evidence);
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at')
                expect(result).to.have.property('dbClass');
                expect(result.isAbstract).to.be.true;
                expect(result.dbClass.superClass).to.equal('kbvertex');
            });
    });
    it('create an evidence record (should error)', () => {
        return Evidence.createClass(db)
            .catch((error) => {
                throw new DependencyError(error.message);
            }).then((result) => {
                return result.createRecord(); // test creating a record?
            }).then((result) => {
                expect.fail('violated constraint should have thrown error');
            }, (error) => {
                return oError.expectAbstractClassError(error);
            });
    });
    
    describe('evidence subclasses', () => {
        beforeEach(function(done) {
            Evidence.createClass(db)
                .then(() => {
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('create publication class', () => {
            return Publication.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Publication);
                    expect(result).to.have.property('dbClass');
                    expect(result.propertyNames).to.include('idType', 'id', 'title', 'journal', 'year','version','created_at','deleted_at');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it('create the study class', () => {
            return Study.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(Study);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });

        it.skip('create the ExternalSource class', () => {
            return ExternalSource.createClass(db)
                .then((result) => {
                    expect(result).to.be.an.instanceof(ExternalDB);
                    expect(result).to.have.property('dbClass');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('publication constraints', () => {
            let pub = null;
            beforeEach(function(done) {
                Publication.createClass(db)
                    .then((result) => {
                        pub = result;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });

            it('test mandatory props', () => {
                return pub.createRecord({title: 'tiTLe', idType: 'PMcID', id: 'PMC1'})
                    .then((result) => {
                        expect(result).to.have.property('uuid');
                        expect(result).to.have.property('title');
                        expect(result).to.have.property('idType');
                        expect(result).to.have.property('id');
                        expect(result).to.have.property('version');
                        expect(result).to.have.property('created_at');
                        expect(result).to.have.property('deleted_at');
                        expect(result.title).to.equal('title');
                        expect(result.idType).to.equal('pmcid');
                        expect(result.id).to.equal('pmc1');
                        // should not have
                        expect(result).to.not.have.property('journal');
                        expect(result).to.not.have.property('year');
                    });
            });
            it('null for mandatory porps error', () => {
                return pub.createRecord({title: 'title'})
                    .then((result) => {
                        expect.fail('violated null constraint should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('one idType duplicate IDs error', () => {
                // TODO: account for versioning in index
                return pub.createRecord({title: 'title', idType: 'PMcID', id: 'pmc1'})
                    .then((result) => {
                        return pub.createRecord({title: 'title2', idType: 'PMcid', id: 'PMC1'});
                    }).then((result) => {
                        expect.fail('violated constraint should have thrown error');
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('duplicate title and idType', () => {
                return pub.createRecord({title: 'title', idType: 'pmid', id: '13456'})
                    .then((result) => {
                        return pub.createRecord({title: 'title', idType: 'PMID', id: '65412'});
                    }).then((result) => {
                        expect(result).to.have.property('title');
                        expect(result.idType).to.equal('pmid');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('identical entries', () => {
                return pub.createRecord({title: 'title', id: '12456'})
                    .then((result) => {
                        return pub.createRecord({title: 'title', idType: 'PMID', id: '12456'});
                    }).then((result) => {
                        expect.fail('expected error');                        
                    }).catch((error) => {
                        return oError.expectDuplicateKeyError(error);
                    });
            });
            it('idType default pmid', () => {
                return pub.createRecord({title: 'title', id:'654'})
                    .then((result) => {
                        expect(result.idType).to.equal('pmid');
                        expect(result.id).to.equal('654');
                    }, (error) => {
                        oError.expectNullConstraintError(error);
                    });
            });
            it('duplicate titles`', () => {
                return pub.createRecord({title: 'title', id:'654'})
                    .then((result) => {
                        expect(result.idType).to.equal('pmid');
                        expect(result.id).to.equal('654');
                    }, (error) => {
                        oError.expectNullConstraintError(error);
                    });
            });
            it('invalid attribute', () => {
                return pub.createRecord({title: 'title', idType: 'pmid', invalid_attribute: 2})
                    .then((result) => {
                        expect.fail('invalid attribute. should have thrown error');
                    }).catch((error) => {
                        expect(error).to.be.an.instanceof(AttributeError);
                    });
            });
        });

        describe('study constraints', () => {
            let currClass = null;
            beforeEach(function(done) {
                Study.createClass(db)
                    .then((studyClass) => {
                        currClass = studyClass;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('test mandatory props', () => {
                return currClass.createRecord({title: 'POG', url: 'http://donate.bccancerfoundation.com/site/PageNavigator/POG2017.html?s_src=PPC&gclid=CPKLvZDowNMCFYNGXgodQp8GeQ'})
                    .then((record) => {
                        expect(record).to.have.property('uuid');
                        expect(record).to.have.property('version');
                        expect(record).to.have.property('created_at');
                        expect(record).to.have.property('deleted_at');
                        expect(record).to.have.property('title');
                        expect(record).to.have.property('url');
                        // should not have
                        expect(record).not.to.have.property('year');
                        expect(record).not.to.have.property('sample_population');
                        expect(record).not.to.have.property('sample_population_size');
                        expect(record).not.to.have.property('method');
                    });
            });
        });

        describe('external sources constraints', () => {
            let currClass = null;
            beforeEach(function(done) {
                ExternalSource.createClass(db)
                    .then((esClass) => {
                        currClass = esClass;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('test mandatory props', () => {
                return currClass.createRecord({url: 'https://www.intogen.org/search?gene=MAP3K11', extractionDate: moment().unix() })
                    .then((record) => {
                        expect(record).to.have.property('uuid');
                        expect(record).to.have.property('version');
                        expect(record).to.have.property('created_at');
                        expect(record).to.have.property('deleted_at');
                        expect(record).to.have.property('url');
                        expect(record).to.have.property('extractionDate');
                        // should not have
                        expect(record).to.not.have.property('title');
                    });
            });
        });

    });

    afterEach((done) => {
        /* disconnect from the database */
        server.drop({name: conf.emptyDbName})
            .catch((error) => {
                console.log('error:', error);
            }).then(() => {
                return server.close();
            }).then(() => {
                done();
            }).catch((error) => {
                console.log('error closing the server', error);
                done(error);
            });
    })
});
