'use strict';
const {expect} = require('chai');
const {setUpEmptyDB, tearDownEmptyDB} = require('./util');
const {fetchValues, Vocab} = require('./../../app/repo/vocab');
const cache = require('./../../app/repo/cached/data');
const data = require('./data.json');
const Promise = require('bluebird');
const {Record} = require('./../../app/repo/base');


describe('Vocab schema tests:', () => {
    let db, server;
    let user = 'me';
    beforeEach(async () => {
        ({db, server} = await setUpEmptyDB());
    });

    it('create the class', () => {
        return Vocab.createClass(db)
            .then((result) => {
                expect(result.propertyNames).to.include('class', 'property', 'term', 'definition', 'uuid', 'created_at', 'deleted_at', 'version');
                expect(result.isAbstract).to.be.false;
                expect(cache.vocab).to.not.have.property('feature');
            });
    });

    describe('class dependent', () => {
        beforeEach(async () => {
            await Vocab.createClass(db);
        });
        it('allows createRecords to create multiple records', async () => {
            await db.models.Vocab.createRecords(data.vocab, user);
            expect(cache.vocab).to.have.property('feature');
            expect(cache.vocab.feature).to.have.property('biotype');
            expect(cache.vocab.feature.biotype.length).to.equal(6);
        });
        it('allows createRecords to create multiple records when some already exist', async () => {
            await db.models.Vocab.createRecords(data.vocab, user);
            await db.models.Vocab.createRecords(data.vocab, user);
            expect(cache.vocab).to.have.property('feature');
            expect(cache.vocab.feature).to.have.property('biotype');
            expect(cache.vocab.feature.biotype.length).to.equal(6);
        });
        it('errors createRecord on duplicate within category', async () => {
            await db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'protein'}, user);
            try {
                await db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'protein'}, user);
            } catch (err) {
                return err;
            }
            throw new Error('expected an error');
        });
        it('allows duplicate within category if conditional is specified', async () => {
            await db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'protein'}, user);
            await db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'protein', conditional: 'other'}, user);
            expect(cache.vocab.feature.biotype.length).to.equal(2);
        });
        it('allows updateRecord', async () => {
            const record = await db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'protein'}, user);
            expect(record).to.be.an.instanceof(Record);
            expect(record.content).to.have.property('class', 'feature');
            expect(record.content).to.have.property('property', 'biotype');
            expect(record.content).to.have.property('term', 'protein');
            expect(record.content).to.have.property('version', 0);
            record.content.definition = 'this is a defn';
            const updated = await db.models.Vocab.updateRecord(record, user);
            expect(updated.content).to.have.property('version', 1);
            expect(updated.content).to.have.property('definition', 'this is a defn');
            expect(updated.content).to.have.property('class', 'feature');
            expect(updated.content).to.have.property('property', 'biotype');
            expect(updated.content).to.have.property('term', 'protein');
        });
        it('allows updateDefinition to update record definition', async () => {
            const record = await db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'protein'}, user);
            expect(record.content).to.have.property('class', 'feature');
            expect(record.content).to.have.property('property', 'biotype');
            expect(record.content).to.have.property('term', 'protein');
            expect(record.content).to.have.property('version', 0);
            record.content.definition = 'this is a defn';
            const updated = await db.models.Vocab.updateDefinition(record.content, user);
            expect(updated.content).to.have.property('version', 1);
            expect(updated.content).to.have.property('definition', 'this is a defn');
            expect(updated.content).to.have.property('class', 'feature');
            expect(updated.content).to.have.property('property', 'biotype');
            expect(updated.content).to.have.property('term', 'protein');
        });
        it('create record: allows different terms within same class & property', async () => {
            const [first, second] = await Promise.all([
                db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'protein'}, user),
                db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'gene'}, user)
            ]);
            expect(first.content).to.have.property('class', 'feature');
            expect(first.content).to.have.property('property', 'biotype');
            expect(first.content).to.have.property('term', 'protein');
            expect(second.content).to.have.property('class', 'feature');
            expect(second.content).to.have.property('property', 'biotype');
            expect(second.content).to.have.property('term', 'gene');
        });
        it('create record: allows duplicate terms when property is different', async () => {
            const [first, second] = await Promise.all([
                db.models.Vocab.createRecord({class: 'feature', property: 'name', term: 'protein'}, user),
                db.models.Vocab.createRecord({class: 'feature', property: 'biotype', term: 'protein'}, user)
            ]);
            expect(first.content).to.have.property('class', 'feature');
            expect(first.content).to.have.property('property', 'name');
            expect(first.content).to.have.property('term', 'protein');
            expect(second.content).to.have.property('class', 'feature');
            expect(second.content).to.have.property('property', 'biotype');
            expect(second.content).to.have.property('term', 'protein');
        });

        it('create record updates cache', () => {
            return db.models.Vocab.createRecord({class: 'feature', property: 'name', term: 'protein'}, user)
                .then(()  => {
                    expect(cache.vocab.feature).to.be.instanceof(Object);
                });
        });
        it('pull table into json', async () => {
            await Promise.all([
                db.models.Vocab.createRecord({class: 'feature', property: 'name', term: 'protein', definition: ''}, user),
                db.models.Vocab.createRecord({class: 'feature', property: 'name', term: 'gene'}, user),
                db.models.Vocab.createRecord({class: 'other', property: 'name', term: 'protein'}, user)
            ]);
            const localCache = await fetchValues(db);
            expect(localCache).to.have.property('feature');
            expect(localCache).to.have.property('other');
            expect(localCache.feature).to.have.property('name');
            expect(localCache.feature.name.length).to.equal(2);
            expect(localCache.other).to.have.property('name');
            expect(localCache.other.name.length).to.equal(1);
        });
        it('cache: delete something', async () => {
            await db.models.Vocab.createRecord({class: 'feature', property: 'name', term: 'protein', definition: ''}, user);
            expect(cache.vocab).to.have.property('feature');
            expect(cache.vocab.feature).to.have.property('name');
            expect(cache.vocab.feature.name.length).to.equal(1);
            await db.models.Vocab.deleteRecord({class: 'feature', property: 'name', term: 'protein'}, user);
            expect(cache.vocab).to.have.property('feature');
            expect(cache.vocab.feature).to.have.property('name');
            expect(cache.vocab.feature.name.length).to.equal(0);
        });
    });

    afterEach(async () => {
        await tearDownEmptyDB(server);
    });
});
