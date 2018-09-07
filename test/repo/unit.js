

const {expect} = require('chai');

const {
    castUUID,
    looksLikeRID,
    castString,
    castNullableString,
    castNonEmptyString,
    groupRecordsBy
} = require('./../../app/repo/util');
const {
    hasRecordAccess,
    trimRecords
} = require('./../../app/repo/base');


describe('groupRecordsBy', () => {
    it('groups single level', () => {
        const records = [
            {name: 'bob', city: 'van'},
            {name: 'alice', city: 'van'},
            {name: 'blargh', city: 'monkeys'}
        ];
        expect(groupRecordsBy(records, ['city'], {value: 'name'})).to.eql({
            van: ['bob', 'alice'],
            monkeys: ['blargh']
        });
    });
    it('error on no aggregate and non-unique grouping', () => {
        const records = [
            {name: 'bob', city: 'van'},
            {name: 'alice', city: 'van'},
            {name: 'blargh', city: 'monkeys'}
        ];
        expect(() => {
            groupRecordsBy(records, ['city'], {value: 'name', aggregate: false});
        }).to.throw('non-unique grouping');
    });
    it('uses the whole record when nestedProperty is null', () => {
        const records = [
            {name: 'bob', city: 'van'},
            {name: 'alice', city: 'van'},
            {name: 'blargh', city: 'monkeys'}
        ];
        expect(groupRecordsBy(records, ['city'])).to.eql({
            van: [{name: 'bob', city: 'van'}, {name: 'alice', city: 'van'}],
            monkeys: [{name: 'blargh', city: 'monkeys'}]
        });
    });
    it('groups 2+ levels', () => {
        const records = [
            {name: 'bob', city: 'van', country: 'canada'},
            {name: 'alice', city: 'van', country: 'canada'},
            {name: 'blargh', city: 'monkeys', country: 'narnia'}
        ];
        expect(groupRecordsBy(records, ['country', 'city'], {value: 'name'})).to.eql({
            canada: {van: ['bob', 'alice']},
            narnia: {monkeys: ['blargh']}
        });
    });
    it('no aggregate', () => {
        const records = [
            {name: 'bob', city: 'van', country: 'canada'},
            {name: 'alice', city: 'van', country: 'mordor'},
            {name: 'blargh', city: 'monkeys', country: 'narnia'}
        ];
        expect(groupRecordsBy(records, ['country', 'city'], {value: 'name', aggregate: false})).to.eql({
            canada: {van: 'bob'},
            mordor: {van: 'alice'},
            narnia: {monkeys: 'blargh'}
        });
    });
});


describe('castUUID', () => {
    it('returns valid uuid', () => {
        const uuid = '933fd4de-5bd6-471c-9869-a7601294ea6e';
        expect(castUUID(uuid)).to.equal(uuid);
    });
    it('errors on bad uuid', () => {
        const uuid = '933fd4de-5bd6-471c-4ea6e';
        expect(() => { castUUID(uuid); }).to.throw();
    });
});

describe('castString', () => {
    it('lowercases', () => {
        expect(castString('Blargh MONKEYS')).to.equal('blargh monkeys');
    });
    it('trims whitespace', () => {
        expect(castString('blargh monkeys ')).to.equal('blargh monkeys');
    });
    it('convert int', () => {
        expect(castString(1)).to.equal('1');
    });
    it('error on null', () => {
        expect(() => castString(null)).to.throw('cannot cast null');
    });
    it('can be empty', () => {
        expect(castString('')).to.equal('');
    });
});

describe('castNonEmptyString', () => {
    it('cannot be empty', () => {
        expect(() => castNonEmptyString('')).to.throw('Cannot be an empty string');
    });
});


describe('castNullableString', () => {
    it('allows null', () => {
        expect(castNullableString(null)).to.be.null;
    });
    it('does not convert null', () => {
        expect(castNullableString('null')).to.equal('null');
    });
});


describe('looksLikeRID', () => {
    it('false for bad rid', () => {
        expect(looksLikeRID('4')).to.be.false;
    });
    it('true for rid without hash if not strict', () => {
        expect(looksLikeRID('4:0')).to.be.true;
    });
    it('false for rid without hash if strict', () => {
        expect(looksLikeRID('4:0', true)).to.be.false;
    });
    it('true for rid with hash if strict', () => {
        expect(looksLikeRID('#4:0'), true).to.be.true;
    });
    it('true for rid with hash if not strict', () => {
        expect(looksLikeRID('#4:0')).to.be.true;
    });
});


describe('hasRecordAccess', () => {
    it('user with no groups', () => {
        const access = hasRecordAccess({groups: []}, {groupRestrictions: [{'@rid': '#2:0'}]});
        expect(access).to.be.false;
    });
    it('record with no groups', () => {
        const access = hasRecordAccess({groups: []}, {});
        expect(access).to.be.true;
    });
    it('record with no groups but admin user', () => {
        const access = hasRecordAccess({groups: [{'@rid': '#2:0'}]}, {});
        expect(access).to.be.true;
    });
    it('record with different group', () => {
        const access = hasRecordAccess({groups: [{'@rid': '#3:0'}]}, {groupRestrictions: [{'@rid': '#4:0'}]});
        expect(access).to.be.false;
    });
    it('record with different group and admin user', () => {
        const access = hasRecordAccess({groups: [{'@rid': '#2:0'}]}, {groupRestrictions: [{'@rid': '#4:0'}]});
        expect(access).to.be.false;
    });
    it('record with the correct group', () => {
        const access = hasRecordAccess({groups: [{'@rid': '#2:0'}, {'@rid': '#4:0'}]}, {groupRestrictions: [{'@rid': '#2:0'}]});
        expect(access).to.be.true;
    });
});


describe('trimRecords', () => {
    it('removes protected records (default ok)', () => {
        const records = [
            {name: 'bob'},
            {name: 'alice', link: {name: 'george', '@rid': '#44:0'}}
        ];
        const trimmed = trimRecords(records, {activeOnly: false, user: {groups: [{'@rid': '#1:0'}]}});
        expect(trimmed).to.eql(records);
    });
    it('removes protected records (explicit group)', () => {
        const records = [
            {name: 'bob', groupRestrictions: [{'@rid': '#2:0'}]},
            {name: 'alice', groupRestrictions: [{'@rid': '#1:0'}]}
        ];
        const trimmed = trimRecords(records, {activeOnly: false, user: {groups: [{'@rid': '#1:0'}]}});
        expect(trimmed).to.eql([{name: 'alice', groupRestrictions: [{'@rid': '#1:0'}]}]);
    });
    it('removes protected edges (default ok)', () => {
        const records = [
            {name: 'bob', groupRestrictions: [{'@rid': '#1:0'}]},
            {
                name: 'alice',
                out_link: {'@rid': '44:1', groupRestrictions: [{'@rid': '#2:2'}]},
                groupRestrictions: [{'@rid': '#1:0'}]
            }
        ];
        const trimmed = trimRecords(records, {activeOnly: false, user: {groups: [{'@rid': '#1:0'}]}});
        expect(trimmed).to.eql([
            {name: 'bob', groupRestrictions: [{'@rid': '#1:0'}]},
            {name: 'alice', groupRestrictions: [{'@rid': '#1:0'}]}
        ]);
    });
    it('removes protected edges (explicit group)', () => {
        const records = [
            {name: 'bob', groupRestrictions: [{'@rid': '#1:0'}]},
            {name: 'alice', out_link: {'@rid': '44:1', groupRestrictions: [{'@rid': '#2:0'}]}, groupRestrictions: [{'@rid': '#1:0'}]}
        ];
        const trimmed = trimRecords(records, {activeOnly: false, user: {groups: [{'@rid': '#1:0'}]}});
        expect(trimmed).to.eql([
            {name: 'bob', groupRestrictions: [{'@rid': '#1:0'}]},
            {name: 'alice', groupRestrictions: [{'@rid': '#1:0'}]}
        ]);
    });
    it('removes nested protected records', () => {
        const records = [
            {name: 'bob'},
            {name: 'alice', link: {name: 'george', '@rid': '#44:1', groupRestrictions: [{'@rid': '#55:5'}]}, groupRestrictions: [{'@rid': '#2:1'}]}
        ];
        const trimmed = trimRecords(records, {user: {groups: [{'@rid': '#2:1'}]}});
        expect(trimmed).to.eql([
            {name: 'bob'},
            {name: 'alice', groupRestrictions: [{'@rid': '#2:1'}]}
        ]);
    });
});
