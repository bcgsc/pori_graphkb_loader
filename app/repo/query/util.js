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
        const match = /^(in|out|both)E?(\(([^)]*)\))?$/.exec(attr);
        if (match) {
            curr.child = {
                type: TRAVERSAL_TYPE.EDGE,
                direction: match[1]
            };
            if (match[3] !== undefined) {
                curr.child.edges = match[3].trim().length > 0
                    ? Array.from(match[3].split(','), e => e.trim())
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
