/**
 * The query module is reponsible for building the complex psuedo-SQL statements
 */

/**
 * @constant
 * @ignore
 */
const {error: {AttributeError}, schema: SCHEMA_DEFN} = require('@bcgsc/knowledgebase-schema');

const {Comparison, Clause, Query} = require('./query');
const {Traversal} = require('./traversal');
const match = require('./match');
const constants = require('./constants');

const util = require('./util');

/**
 * For the GUI to speed up the main search query until we can migrate to v3 odb
 */
const generalKeywordSearch = (keywordsIn, opt) => {
    const {
        skip = 0,
        orderBy,
        orderByDirection = 'ASC',
        count = false
    } = opt;
    const params = {};
    const paramMapping = {};

    // remove any duplicate words
    const keywords = Array.from(new Set(keywordsIn.map(word => word.trim().toLowerCase())));

    for (const keyword of keywords) {
        const pname = `param${Object.keys(params).length}`;
        params[pname] = keyword;
        paramMapping[keyword] = pname;
    }

    const subContainsClause = (props) => {
        const whereClause = [];
        // must contains all words but words can exist in any prop
        for (const keyword of keywords) {
            const orClause = [];
            for (const prop of props) {
                orClause.push(`${prop} CONTAINSTEXT :${paramMapping[keyword]}`);
            }
            let inner = orClause.join(' OR ');

            if (orClause.length > 1) {
                inner = `(${inner})`;
            }
            whereClause.push(inner);
        }
        return whereClause.join(' AND ');
    };

    let query = `
    SELECT expand(distinct) FROM (
        SELECT distinct(@rid) FROM (
            SELECT expand($v)
            LET $ont = (SELECT * from Ontology WHERE ${
    subContainsClause(['sourceId', 'name'])
}),
                $variants = (SELECT * FROM Variant WHERE ${
    subContainsClause([
        'type.name',
        'type.sourceId',
        'reference1.name',
        'reference1.sourceId',
        'reference2.name',
        'reference2.sourceId'
    ])
}),
                $implicable = (SELECT expand(inE('ImpliedBy').outV()) from (select expand(UNIONALL($ont, $variants)))),
                $statements = (SELECT * FROM Statement WHERE ${
    subContainsClause([
        'appliesTo.name',
        'appliesTo.sourceId',
        'relevance.name',
        'relevance.sourceId'
    ])
}),
                $v = UNIONALL($statements, $implicable)
        ) WHERE deletedAt IS NULL
    )`;
    if (orderBy) {
        try {
            orderBy.map(orderProp => Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.V, orderProp));
        } catch (err) {
            throw new AttributeError(`Invalid orderBy (${orderBy.join(', ')}) ${err}`);
        }

        query = `${query} ORDER BY ${orderBy.join(', ')} ${orderByDirection}`;
    }
    if (count) {
        query = `SELECT count(*) from (${query})`;
    } else if (skip && skip > 0) {
        query = `${query} SKIP ${skip}`;
    }
    return {query, params};
};


module.exports = {
    Query, Clause, Comparison, Traversal, match, constants, util, generalKeywordSearch
};
