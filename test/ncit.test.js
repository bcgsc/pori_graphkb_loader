// write tests for cleanRawRow and pickEndpoint

const { clearnRawRow } = require('../src/ncit');
const { pickEndpoint } = require('../src/ncit');

describe('pickEndpoint', () => {
    test.each([
        ['Islets of Langerhans','Tissue','AnatomicalEntity'],
        ['Recurrent Childhood Giant Cell Glioblastoma','Neoplastic Process','Disease'],
        ['Erlotinib','Pharmacologic Substance','Therapy'],
        ['Nivolumab','Therapeutic or Preventive Procedure','Therapy'],
        ['Vemurafenib','Organic Chemical|Pharmacologic Substance','Therapy'],

    ])(
        '%s|%s|%s returns %s', (conceptName, parentConcepts, expected) => {
            expect(pickEndpoint(conceptName, parentConcepts)).toEqual(expected);
        },
    );

});

describe('cleanRawRow', () => {
    test.each([
        [],
    ])(
        '%s|%s|%s returns %s', (rawRow, expected) => {
            expect(cleanRawRow(rawRow)).toEqual(expected);
        },
    );

});

