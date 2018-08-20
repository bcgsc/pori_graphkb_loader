

const {expect} = require('chai');
const {types} = require('orientjs');

const {castUUID, looksLikeRID} = require('./../../app/repo/util');
const {
    hasRecordAccess,
    trimRecords
} = require('./../../app/repo/base');


describe('util.castUUID', () => {
    it('returns valid uuid', () => {
        const uuid = '933fd4de-5bd6-471c-9869-a7601294ea6e';
        expect(castUUID(uuid)).to.equal(uuid);
    });
    it('errors on bad uuid', () => {
        const uuid = '933fd4de-5bd6-471c-4ea6e';
        expect(() => { castUUID(uuid); }).to.throw();
    });
});


describe('util.looksLikeRID', () => {
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
