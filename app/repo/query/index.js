/**
 * The query module is reponsible for building the complex psuedo-SQL statements
 */

/**
 * @constant
 * @ignore
 */
const {Comparison, Clause, Query} = require('./query');
const {Traversal} = require('./traversal');
const match = require('./match');
const constants = require('./constants');

const {OPERATORS} = constants;
const util = require('./util');

/**
 * For the GUI to speed up the main search query until we can migrate to v3 odb
 */
const generalKeywordSearch = (keywords, skip = 0) => {
    const params = {};

    for (const keyword of keywords) {
        params[`param${Object.keys(params).length}`] = keyword;
    }
    const ontQueries = {};

    for (const attr of ['name', 'sourceId']) {
        let where = Array.from(Object.keys(params), p => `${attr} ${OPERATORS.CONTAINSTEXT} :${p}`).join(' AND ');
        if (Object.keys(params).length > 1) {
            where = `(${where})`;
        }
        const subqueryName = `$ont${attr}`;
        ontQueries[subqueryName] = `${subqueryName} = (SELECT * from Ontology WHERE ${where})`;
    }
    let query = `LET ${Object.values(ontQueries).join(',\n')},
    $ont = UNIONALL(${Object.keys(ontQueries).join(', ')})`;
    query = `SELECT * FROM (SELECT expand($v)
${query},
    $variants = (SELECT * FROM Variant WHERE type IN $ont OR reference1 in $ont OR reference2 in $ont),
    $implicable = UNIONALL($ont, $variants),
    $statements = (
        SELECT * FROM Statement
        WHERE
            inE('impliedBy').outV() in $implicable
            OR outE('supportedBy').inV() in $ont
            OR appliesTo in $implicable
            OR relevance in $implicable
        ),
    $v = UNIONALL($statements, $variants, $ont)) WHERE deletedAt IS NULL`;
    if (skip && skip > 0) {
        query = `${query} SKIP ${skip}`;
    }
    return {query, params};
};


module.exports = {
    Query, Clause, Comparison, Traversal, match, constants, util, generalKeywordSearch
};
