const {STATEMENT_TYPE, Statement} = require('./../../../app/repo/statement');

const relevance = [
    {
        term: 'haploinsufficient',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    },
    {
        term: 'gain of function',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    },
    {
        term: 'loss of function',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    },
    {
        term: 'switch of function',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    },
    {
        term: 'tumour suppressor',
        definition: '',
        conditional: STATEMENT_TYPE.BIOLOGICAL,
        class: Statement.clsname,
        property: 'relevance'
    }
];
