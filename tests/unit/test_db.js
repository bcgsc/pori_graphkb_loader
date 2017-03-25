const { expect } = require('chai');
const repo = require('./../../db/connect');

describe('publication', () => {
    it('create', () => {
        const pub = repo.publication.create({pubmed_id: 111111, title: 'dummy'});
    });
    it('read', () => {});
    it('update', () => {});
    it('delete', () => {});
});
