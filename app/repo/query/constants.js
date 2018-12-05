const RELATED_NODE_DEPTH = 3;
const MAX_TRAVEL_DEPTH = 50;
const PARAM_PREFIX = 'param';
const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];
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

const DIRECTIONS = {
    OUT: 'out',
    IN: 'in',
    BOTH: 'both'
};

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
