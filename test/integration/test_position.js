'use strict';
const {expect} = require('chai');
const conf = require('./../config/db');
const {connectServer, createDB} = require('./../../app/repo/connect');
const {AttributeError} = require('./../../app/repo/error');
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
        connectServer(conf)
            .then((result) => {
                // create the empty database
                server = result;
                return createDB({
                    name: conf.emptyDbName, 
                    username: conf.dbUsername, 
                    password: conf.dbPassword, 
                    server: server
                });
            }).then((connection) => {
                db = connection;
                done();
            }).catch((error) => {
                console.log('error', error);
                done(error);
            });
    });
    it('test create position class', () => {
        return Position.createClass(db)
            .then((result) => {
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
                });
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
            it('pos defaults to null', () => {
                return currClass.createRecord()
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('allows pos to be null', () => {
                return currClass.createRecord({pos: null})
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('errors on pos below minimum', () => {
                return currClass.createRecord({pos: 0})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows pos at min', () => {
                return currClass.createRecord({pos: 1})
                    .then((record) => {
                        expect(record.content).to.have.property('pos', 1);
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
            it('pos defaults to null', () => {
                return currClass.createRecord()
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('allows pos to be null', () => {
                return currClass.createRecord({pos: null})
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('errors on ref_aa too long', () => {
                return currClass.createRecord({pos: 1, ref_aa: 'DD'})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('errors on ref_aa empty string', () => {
                return currClass.createRecord({pos: 1, ref_aa: ''})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows ref_aa default null', () => {
                return currClass.createRecord({pos: 1})
                    .then((record) => {
                        expect(record.content.ref_aa).to.be.null;
                        expect(record.content.pos).to.equal(1);
                    });
            });
            it('allows pos at min', () => {
                return currClass.createRecord({pos: 1, ref_aa: 'X'})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.ref_aa).to.equal('X');
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
            it('pos defaults to null', () => {
                return currClass.createRecord()
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('allows pos null', () => {
                return currClass.createRecord({pos: null})
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('errors on pos below min', () => {
                return currClass.createRecord({pos: 0})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows pos at min', () => {
                return currClass.createRecord({pos: 1})
                    .then((record) => {
                        expect(record.content).to.have.property('pos', 1);
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
            it('pos default to null', () => {
                return currClass.createRecord()
                    .then((record) => {
                        expect(record.content.pos).is.null;
                        expect(record.content.offset).to.equal(0);
                    });
            });
            it('allows input pos as null', () => {
                return currClass.createRecord({pos: null, offset: null})
                    .then((record) => {
                        expect(record.content.pos).is.null;
                        expect(record.content.offset).is.null;
                    });
            });
            it('allows offset to default to 0', () => {
                return currClass.createRecord({pos: 1})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.offset).to.equal(0);
                    });
            });
            it('allows offset to be negative', () => {
                return currClass.createRecord({pos: 1, offset: -2})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.offset).to.equal(-2);
                    });
            });
            it('allows offset to be positive', () => {
                return currClass.createRecord({pos: 1, offset: 2})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.offset).to.equal(2);
                    });
            });
            it('allows offset to be null', () => {
                return currClass.createRecord({pos: 1, offset: null})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.offset).is.null;
                    });
            });
            it('errors on pos below min', () => {
                return currClass.createRecord({pos: 0})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
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
            it('errors on arm null', () => {
                return currClass.createRecord({arm: null})
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('errors on mandatory arm not given', () => {
                return currClass.createRecord()
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('errors on arm not p/q', () => {
                return currClass.createRecord({arm: 'k'})
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows arm p to force lower case', () => {
                return currClass.createRecord({arm: 'P'})
                    .then((record) => {
                        expect(record.content.arm).to.equal('p');
                        expect(record.content.major_band).to.be.null;
                        expect(record.content.minor_band).to.be.null;
                    });
            });
            it('allows arm q to force lower case', () => {
                return currClass.createRecord({arm: 'Q'})
                    .then((record) => {
                        expect(record.content.arm).to.equal('q');
                        expect(record.content.major_band).to.be.null;
                        expect(record.content.minor_band).to.be.null;
                    });
            });
            it('errors on minor_band not null when major band null', () => {
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

        describe('range.createRecord', () => {
            let currClass;
            beforeEach(function(done) {
                Promise.all([
                    Range.createClass(db),
                    CodingSequencePosition.createClass(db),
                    GenomicPosition.createClass(db),
                    ProteinPosition.createClass(db)
                ]).then((plist) => {
                    currClass = plist[0];
                    done();
                }).catch((error) => {
                    done(error);
                });
            });
            it('start null/undefined error', () => {
                return currClass.createRecord({end: {pos: 1}}, GenomicPosition.clsname)
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('end null/undefined error', () => {
                return currClass.createRecord({start: {pos: 1}}, GenomicPosition.clsname)
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });

            it('create range', () => {
                return currClass.createRecord({start: {pos: 1}, end: {pos: 2}}, GenomicPosition.clsname)
                    .then((record) => {
                        expect(record.content).to.include.keys('start', 'end');
                        expect(record.content.start).to.have.property('pos', 1);
                        expect(record.content.end).to.have.property('pos', 2);
                        expect(record.content.start).to.have.property('@class', GenomicPosition.clsname);
                        expect(record.content.end).to.have.property('@class', GenomicPosition.clsname);
                    });
            });
            it('errors on start > end', () => {
                return currClass.createRecord({start: {pos: 10}, end: {pos: 8}}, GenomicPosition.clsname)
                    .then((rec) => {
                        console.log(rec);
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('errors on start >= end', () => {
                return currClass.createRecord({start: {pos: 10}, end: {pos: 10}}, GenomicPosition.clsname)
                    .then((rec) => {
                        console.log(rec);
                        expect.fail('expected error');
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
    });
});
