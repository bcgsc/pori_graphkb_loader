/**
 * @constant
 * @type {Number}
 * @default
 */
const RELATED_NODE_DEPTH = 3;
/**
 * @constant
 * @type {Number}
 * @default
 */
const MAX_TRAVEL_DEPTH = 50;
/**
 * @constant
 * @type {string}
 * @default
 */
const PARAM_PREFIX = 'param';
/**
 * @constant
 * @type {Array.<string>}
 * @default
 */
const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];
/**
 * @constant
 * @type {Set.<string>}
 * @default
 */
const SPECIAL_QUERY_ARGS = new Set([
    'fuzzyMatch', // follow deprecatedby/aliasof links
    'ancestors', // follow outgoing edges
    'descendants', // follow incoming edges
    'returnProperties', // return select properties only
    'limit', // limit the number of records to return
    'skip',
    'neighbors',
    'activeOnly',
    'v',
    'direction',
    'or'
]);
/**
 * @namespace
 */
const DIRECTIONS = {
    OUT: 'out',
    IN: 'in',
    BOTH: 'both'
};
/**
 * operators to be used in generating SQL statements
 * @namespace
 * @property {string} EQ equal to
 * @property {string} CONTAINS
 * @property {string} CONTAINSALL
 * @property {string} CONTAINSTEXT
 * @property {string} IN
 * @property {string} GTE greater than or equal to
 * @property {string} GT greater than
 * @property {string} LTE
 * @property {string} LT
 * @property {string} IS
 * @property {string} OR
 * @property {string} AND
 */
const OPERATORS = {
    EQ: '=',
    CONTAINS: 'CONTAINS',
    CONTAINSALL: 'CONTAINSALL',
    CONTAINSTEXT: 'CONTAINSTEXT',
    IN: 'IN',
    GTE: '>=',
    GT: '>',
    LTE: '<=',
    LT: '<',
    IS: 'IS',
    OR: 'OR',
    AND: 'AND'
};

/**
 * @constant
 * @type {Array.<string>}
 * @default
 */
const NEIGHBORHOOD_EDGES = [
    'AliasOf',
    'GeneralizationOf',
    'DeprecatedBy',
    'CrossReferenceOf',
    'ElementOf'
];

const TRAVERSAL_TYPE = {LINK: 'LINK', EDGE: 'EDGE', DIRECT: 'DIRECT'};

const SIZE_COMPUTATION = 'size()';


module.exports = {
    RELATED_NODE_DEPTH,
    PARAM_PREFIX,
    FUZZY_CLASSES,
    SPECIAL_QUERY_ARGS,
    OPERATORS,
    DIRECTIONS,
    NEIGHBORHOOD_EDGES,
    TRAVERSAL_TYPE,
    SIZE_COMPUTATION,
    MAX_TRAVEL_DEPTH
};
