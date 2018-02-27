'use strict';
const {expect} = require('chai');
const {AttributeError} = require('./../../app/repo/error');
const oError = require('./orientdb_errors');
const {setUpEmptyDB, tearDownEmptyDB} = require('./util');

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
    beforeEach(async () => { 
        ({server, db, user} = await setUpEmptyDB());
    });
    it('test create position class', () => {
        return Position.createClass(db)
            .then((result) => {
                expect(result.isAbstract).to.be.true;
            });
    });

    describe('position subclasses', () => {
        beforeEach(async () => {
            await Position.createClass(db);
        });
        it('test position class abstract error', () => {
            return db.models.Position.createRecord()
                .then(() => {
                    expect.fail('expected error');
                }, (error) => {
                    expect(error).to.have.property('name', 'OrientDB.OperationError');
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
            beforeEach(async function() {
                await GenomicPosition.createClass(db);
            });
            it('pos defaults to null', () => {
                return db.models.GenomicPosition.createRecord()
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('allows pos to be null', () => {
                return db.models.GenomicPosition.createRecord({pos: null})
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('errors on pos below minimum', () => {
                return db.models.GenomicPosition.createRecord({pos: 0})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows pos at min', () => {
                return db.models.GenomicPosition.createRecord({pos: 1})
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
            beforeEach(async () => {
                await ProteinPosition.createClass(db);
            });
            it('pos defaults to null', () => {
                return db.models.ProteinPosition.createRecord()
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('allows pos to be null', () => {
                return db.models.ProteinPosition.createRecord({pos: null})
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('errors on ref_aa too long', () => {
                return db.models.ProteinPosition.createRecord({pos: 1, ref_aa: 'DD'})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('errors on ref_aa empty string', () => {
                return db.models.ProteinPosition.createRecord({pos: 1, ref_aa: ''})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows ref_aa default null', () => {
                return db.models.ProteinPosition.createRecord({pos: 1})
                    .then((record) => {
                        expect(record.content.ref_aa).to.be.null;
                        expect(record.content.pos).to.equal(1);
                    });
            });
            it('allows pos at min', () => {
                return db.models.ProteinPosition.createRecord({pos: 1, ref_aa: 'X'})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.ref_aa).to.equal('x');
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
            beforeEach(async () => {
                await ExonicPosition.createClass(db);
            });
            it('pos defaults to null', () => {
                return db.models.ExonicPosition.createRecord()
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('allows pos null', () => {
                return db.models.ExonicPosition.createRecord({pos: null})
                    .then((record) => {
                        expect(record.content.pos).is.null;
                    });
            });
            it('errors on pos below min', () => {
                return db.models.ExonicPosition.createRecord({pos: 0})
                    .then(() => {
                        expect.fail('error was expected');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows pos at min', () => {
                return db.models.ExonicPosition.createRecord({pos: 1})
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
            beforeEach(async () => {
                await CodingSequencePosition.createClass(db);
            });
            it('pos default to null', () => {
                return db.models.CodingSequencePosition.createRecord()
                    .then((record) => {
                        expect(record.content.pos).is.null;
                        expect(record.content.offset).to.equal(0);
                    });
            });
            it('allows input pos as null', () => {
                return db.models.CodingSequencePosition.createRecord({pos: null, offset: null})
                    .then((record) => {
                        expect(record.content.pos).is.null;
                        expect(record.content.offset).is.null;
                    });
            });
            it('allows offset to default to 0', () => {
                return db.models.CodingSequencePosition.createRecord({pos: 1})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.offset).to.equal(0);
                    });
            });
            it('allows offset to be negative', () => {
                return db.models.CodingSequencePosition.createRecord({pos: 1, offset: -2})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.offset).to.equal(-2);
                    });
            });
            it('allows offset to be positive', () => {
                return db.models.CodingSequencePosition.createRecord({pos: 1, offset: 2})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.offset).to.equal(2);
                    });
            });
            it('allows offset to be null', () => {
                return db.models.CodingSequencePosition.createRecord({pos: 1, offset: null})
                    .then((record) => {
                        expect(record.content.pos).to.equal(1);
                        expect(record.content.offset).is.null;
                    });
            });
            it('errors on pos below min', () => {
                return db.models.CodingSequencePosition.createRecord({pos: 0})
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
            beforeEach(async () => {
                await CytobandPosition.createClass(db);
            });
            it('errors on arm null', () => {
                return db.models.CytobandPosition.createRecord({arm: null})
                    .then((record) => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('errors on mandatory arm not given', () => {
                return db.models.CytobandPosition.createRecord()
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('errors on arm not p/q', () => {
                return db.models.CytobandPosition.createRecord({arm: 'k'})
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('allows arm p to force lower case', () => {
                return db.models.CytobandPosition.createRecord({arm: 'P'})
                    .then((record) => {
                        expect(record.content.arm).to.equal('p');
                        expect(record.content.major_band).to.be.null;
                        expect(record.content.minor_band).to.be.null;
                    });
            });
            it('allows arm q to force lower case', () => {
                return db.models.CytobandPosition.createRecord({arm: 'Q'})
                    .then((record) => {
                        expect(record.content.arm).to.equal('q');
                        expect(record.content.major_band).to.be.null;
                        expect(record.content.minor_band).to.be.null;
                    });
            });
            it('errors on minor_band not null when major band null', () => {
                return db.models.CytobandPosition.createRecord({arm: 'p', minor_band: 1})
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
            beforeEach(async () => {
                await Promise.all([
                    Range.createClass(db),
                    CodingSequencePosition.createClass(db),
                    GenomicPosition.createClass(db),
                    ProteinPosition.createClass(db)
                ]);
            });
            it('start null/undefined error', () => {
                return db.models.Range.createRecord({end: {pos: 1}}, GenomicPosition.clsname)
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('end null/undefined error', () => {
                return db.models.Range.createRecord({start: {pos: 1}}, GenomicPosition.clsname)
                    .then(() => {
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });

            it('create range', () => {
                return db.models.Range.createRecord({start: {pos: 1}, end: {pos: 2}}, GenomicPosition.clsname)
                    .then((record) => {
                        expect(record.content).to.include.keys('start', 'end');
                        expect(record.content.start).to.have.property('pos', 1);
                        expect(record.content.end).to.have.property('pos', 2);
                        expect(record.content.start).to.have.property('@class', GenomicPosition.clsname);
                        expect(record.content.end).to.have.property('@class', GenomicPosition.clsname);
                    });
            });
            it('errors on start > end', () => {
                return db.models.Range.createRecord({start: {pos: 10}, end: {pos: 8}}, GenomicPosition.clsname)
                    .then((rec) => {
                        console.log(rec);
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
            it('errors on start >= end', () => {
                return db.models.Range.createRecord({start: {pos: 10}, end: {pos: 10}}, GenomicPosition.clsname)
                    .then((rec) => {
                        console.log(rec);
                        expect.fail('expected error');
                    }, (error) => {
                        expect(error).to.be.instanceof(AttributeError);
                    });
            });
        });
    });

    afterEach(async () => {
        tearDownEmptyDB(server);
    });
});
