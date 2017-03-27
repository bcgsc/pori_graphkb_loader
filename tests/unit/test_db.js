import expect from 'chai';
import conf from './../../config/db';
import connect from './../../app/db/connect';

const repo = connect(conf);

describe('publication', () => {
    it('create', () => {
        const pub = repo.publication.create({pubmed_id: 111111, title: 'dummy'});
    });
    it('read', () => {});
    it('update', () => {});
    it('delete', () => {});
});
