/**
 * Create neighborhood queries where some conditions are loosely matched and then expanded to
 * surrounding verticies
 */
/**
 * @constant
 * @ignore
 */
const {error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');
const {quoteWrap} = require('./../util');

const {NEIGHBORHOOD_EDGES, MAX_TRAVEL_DEPTH, RELATED_NODE_DEPTH} = require('./constants');


/**
 * @param {Object} opt options
 * @param {Clause} opt.whereClause the conditions of the match
 * @param {string} opt.modelName the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 * @param {string} opt.direction the direction to follow (in/out)
 */
const treeQuery = (opt) => {
    const {
        whereClause, modelName, paramIndex, direction, depth
    } = Object.assign({
        paramIndex: 0
    }, opt);
    const edges = opt.edges || ['SubclassOf'];

    if (!['out', 'in'].includes(direction)) {
        throw new AttributeError(`direction (${direction}) must be in or out`);
    }

    const {query, params} = whereClause.toString(paramIndex);
    const edgeList = Array.from(edges, quoteWrap).join(', ');
    const statement = `SELECT * FROM (MATCH
    {class: ${modelName}, WHERE: (${query})}
        .${direction}(${edgeList}){WHILE: (${direction}(${edgeList}).size() > 0 AND $depth < ${depth || MAX_TRAVEL_DEPTH})}
RETURN $pathElements)`;
    return {query: statement, params};
};

/**
 * @param {Object} opt options
 * @param {Clause} opt.whereClause the conditions of the match
 * @param {string} opt.modelName the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 * @param {Number} opt.depth the number of jumps away to follow (max distance away)
 */
const neighborhood = (opt) => {
    const {
        whereClause, modelName, paramIndex
    } = Object.assign({
        paramIndex: 0
    }, opt);
    const edges = opt.edges || NEIGHBORHOOD_EDGES;
    const depth = opt.depth || RELATED_NODE_DEPTH;

    const {query, params} = whereClause.toString(paramIndex);
    const statement = `SELECT * FROM (MATCH
    {class: ${modelName}, WHERE: (${query})}
        .both(${Array.from(edges, quoteWrap).join(', ')}){WHILE: ($depth < ${depth})}
RETURN $pathElements)`;
    return {query: statement, params};
};

/**
 * From some starting node (defined by the where clause conditions) follow all incoming edges and
 * return the set of nodes visited
 *
 * @param {Object} opt options
 * @param {Clause} opt.whereClause the conditions of the match
 * @param {string} opt.modelName the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 */
const ancestors = (opt) => {
    opt.direction = 'in';
    return treeQuery(opt);
};

/**
 * From some starting node (defined by the where clause conditions) follow all outgoing edges and
 * return the set of nodes visited
 *
 * @param {Object} opt options
 * @param {Clause} opt.whereClause the conditions of the match
 * @param {string} opt.modelName the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 */
const descendants = (opt) => {
    opt.direction = 'out';
    return treeQuery(opt);
};


module.exports = {neighborhood, ancestors, descendants};
