const expect = require('chai');
const conf = require('./../../config/db');
const connect = require('./../../app/db/connect');

const repo = connect(conf);

describe('publication', () => {
    it('create', () => {
        const pub = repo.publication.create({pubmed_id: 111111, title: 'dummy'});
    });
    it('read', () => {});
    it('update', () => {});
    it('delete', () => {});
});
