const {error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');


const {TRAVERSAL_TYPE} = require('./constants');

/**
 * @param {string} compoundAttr the shorthand attr notation
 *
 * @returns {Object} the query JSON attr representation
 */
const parseCompoundAttr = (compoundAttr) => {
    const attrs = compoundAttr.split('.');
    const expanded = {};
    let curr = expanded;

    for (const attr of attrs) {
        if (curr.type === undefined) {
            curr.type = TRAVERSAL_TYPE.LINK;
        }
        const match = /^(in|out|both)(E?(\(([^)]*)\))|E)$/.exec(attr);
        if (match) {
            const [, direction, , , edges] = match;
            curr.child = {
                type: TRAVERSAL_TYPE.EDGE,
                direction
            };
            if (edges !== undefined) {
                curr.child.edges = edges.trim().length > 0
                    ? Array.from(edges.split(','), e => e.trim())
                    : [];
            }
        } else if (attr === 'vertex') {
            if (curr.type !== TRAVERSAL_TYPE.EDGE) {
                throw new AttributeError('vertex may only follow an edge traversal');
            }
            curr.child = {};
            if (curr.direction === 'out') {
                curr.child.attr = 'inV';
            } else if (curr.direction === 'in') {
                curr.child.attr = 'outV';
            } else {
                curr.child.attr = 'bothV';
            }
        } else {
            curr.child = {attr};
        }
        curr = curr.child;
    }
    return expanded.child;
};


module.exports = {parseCompoundAttr};
