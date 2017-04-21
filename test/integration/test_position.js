"use strict";
const {expect} = require('chai');
const conf = require('./../config/db');
const {serverConnect} = require('./../../app/repo');
const _ = require('lodash');
const {DependencyError, AttributeError} = require('./../../app/repo/error');
const {History, KBVertex, KBEdge, softGetRID} = require('./../../app/repo/base');
const oError = require('./orientdb_errors');


const {
    Position,
    GenomicPosition,
    ExonicPosition,
    ProteinPosition,
    CodingSequencePosition,
    CytobandPosition,
    Range
} = require('./../../app/repo/position');


describe('Position schema tests:', () => {
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
    it('test create position class', () => {
        return Position.createClass(db)
            .then((result) => {
                expect(result.propertyNames).to.include('uuid', 'version', 'created_at', 'deleted_at');
                expect(result.isAbstract).to.be.true;
            });
    });

    describe('position subclasses', () => {
        let posClass;
        beforeEach(function(done) {
            Position.createClass(db)
                .then((result) => {
                    posClass = result;
                    done();
                }).catch((error) => {
                    done(error);
                });
        });
        it('test position class abstract error', () => {
            return posClass.createRecord()
                .then(() => {
                    expect.fail('expected error');
                }, (error) => {
                    oError.expectAbstractClassError(error);
                })
        });
        it('create genomic subclass', () => {
            return GenomicPosition.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('pos');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('genomic', () => {
            let currClass;
            beforeEach(function(done) {
                GenomicPosition.createClass(db)
                    .then((result) => {
                        currClass = result;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('pos mandatory error', () => {
                return currClass.createRecord()
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectMissingMandatoryAttributeError(error);
                    });
            });
            it('pos null error', () => {
                return currClass.createRecord({pos: null})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectNullConstraintError(error);
                    });
            });
        });

        it('create protein subclass', () => {
            return ProteinPosition.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('pos', 'ref_aa');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('protein', () => {
            let currClass;
            beforeEach(function(done) {
                ProteinPosition.createClass(db)
                    .then((result) => {
                        currClass = result;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('pos mandatory error', () => {
                return currClass.createRecord({ref_aa: null})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectMissingMandatoryAttributeError(error);
                    });
            });
            it('pos null error', () => {
                return currClass.createRecord({pos: null, ref_aa: null})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectNullConstraintError(error);
                    });
            });
            it('ref_aa too long error', () => {
                return currClass.createRecord({pos: 1, ref_aa: 'DD'})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('ref_aa empty string error', () => {
                return currClass.createRecord({pos: 1, ref_aa: ''})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('ref_aa default null', () => {
                return currClass.createRecord({pos: 1})
                    .then((record) => {
                        expect(record.ref_aa).to.be.null;
                        expect(record.pos).to.equal(1);
                    });
            });

        });

        it('create exon subclass', () => {
            return ExonicPosition.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('pos');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('exonic', () => {
            let currClass;
            beforeEach(function(done) {
                ExonicPosition.createClass(db)
                    .then((result) => {
                        currClass = result;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('pos mandatory error', () => {
                return currClass.createRecord()
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectMissingMandatoryAttributeError(error);
                    });
            });
            it('pos null error', () => {
                return currClass.createRecord({pos: null})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectNullConstraintError(error);
                    });
            });
        });

        it('create cds subclass', () => {
            return CodingSequencePosition.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('pos', 'offset');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('cds', () => {
            let currClass;
            beforeEach(function(done) {
                CodingSequencePosition.createClass(db)
                    .then((result) => {
                        currClass = result;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('pos mandatory error', () => {
                return currClass.createRecord()
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectMissingMandatoryAttributeError(error);
                    });
            });
            it('pos null error', () => {
                return currClass.createRecord({pos: null})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectNullConstraintError(error);
                    });
            });
            it('offset default 0', () => {
                return currClass.createRecord({pos: 1})
                    .then((record) => {
                        expect(record.pos).to.equal(1);
                        expect(record.offset).to.equal(0);
                    });
            });
            it('offset null error', () => {
                return currClass.createRecord({pos: 1, offset: null})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        oError.expectNullConstraintError(error);
                    });
            });
        });

        it('create cytoband subclass', () => {
            return CytobandPosition.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('arm', 'major_band', 'minor_band');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('cytoband', () => {
            let currClass;
            beforeEach(function(done) {
                CytobandPosition.createClass(db)
                    .then((result) => {
                        currClass = result;
                        done();
                    }).catch((error) => {
                        done(error);
                    });
            });
            it('arm null error', () => {
                return currClass.createRecord({arm: null})
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('arm mandatory error', () => {
                return currClass.createRecord()
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('arm not p/q error', () => {
                return currClass.createRecord({arm: 'k'})
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('arm p force lower case', () => {
                return currClass.createRecord({arm: 'P'})
                    .then((record) => {
                        expect(record.arm).to.equal('p');
                        expect(record.major_band).to.be.null;
                        expect(record.minor_band).to.be.null;
                    });
            });
            it('arm q force lower case', () => {
                return currClass.createRecord({arm: 'Q'})
                    .then((record) => {
                        expect(record.arm).to.equal('q');
                        expect(record.major_band).to.be.null;
                        expect(record.minor_band).to.be.null;
                    });
            });
            it('minor_band not null when major band null error', () => {
                return currClass.createRecord({arm: 'p', minor_band: 1})
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
        });

        it('create range subclass', () => {
            return Range.createClass(db)
                .then((result) => {
                    expect(result.propertyNames).to.include('start', 'end');
                    expect(result.isAbstract).to.be.false;
                });
        });

        describe('range', () => {
            let currClass, cdsClass, genClass;
            beforeEach(function(done) {
                Promise.all([
                    Range.createClass(db),
                    CodingSequencePosition.createClass(db),
                    GenomicPosition.createClass(db)
                ]).then((plist) => {
                    [currClass, cdsClass, genClass] = plist;
                    done();
                }).catch((error) => {
                    done(error);
                });
            });
            it('start null/undefined error', () => {
                return currClass.createRecord({end: {pos: 1}}, cdsClass)
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('end null/undefined error', () => {
                return currClass.createRecord({start: {pos: 1}}, cdsClass)
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });

            it('two positions', () => {
                return currClass.createRecord({start: {pos: 1}, end: {pos: 1}}, cdsClass)
                    .then((record) => {
                        expect(record.start).to.equal(cds1);
                        expect(record.end).to.equal(cds2);
                    });
            });
            it('same uuid for start/end error', () => {
                return currClass.createRecord({start: {pos: 1, uuid: '1'}, end: {pos: 1, uuid: '1'}}, cdsClass)
                    .then((record) => {
                        expect.fail('expected an error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
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
                done(error);
            });
    })
});
