const {error: {AttributeError}, util: {castDecimalInteger, castToRID}} = require('@bcgsc/knowledgebase-schema');

const {quoteWrap} = require('./../../../app/repo/util');

const {TRAVERSAL_TYPE, SIZE_COMPUTATION, DIRECTIONS} = require('./constants');
const {parseCompoundAttr} = require('./util');


class Traversal {
    /**
     * @param {object} opt options
     * @param {string} opt.type the type of traversal (LINK, EDGE, DIRECT)
     * @param {Traversal|string} opt.child the child traversal to chain to the current traversal
     * @param {Array.<string>} opt.edges List of edge classes to traverse (for EDGE traversal only)
     * @param {string} opt.direction Direction of an edge traversal (both, out, in)
     * @param {Function} opt.cast the cast function to apply to values being compared to this
     */
    constructor(opt = {}) {
        if (typeof opt === 'string') {
            opt = {attr: opt};
        }
        this.attr = opt.attr;
        this.type = opt.type || TRAVERSAL_TYPE.DIRECT;
        this.child = opt.child || null;
        if (this.child && typeof this.child === 'string') {
            this.child = new this.constructor({attr: this.child});
        }
        this.edges = opt.edges || [];
        this.direction = (opt.direction || DIRECTIONS.BOTH).toLowerCase();
        this.cast = opt.cast || null;
        if (!this.cast && this.type === TRAVERSAL_TYPE.EDGE) {
            this.cast = castToRID;
        }
        this.property = opt.property || null;
    }

    /**
     * @param {object.<string,ClassModel>} schema the mapping of class names to models
     * @param {ClassModel} model the starting model
     * @param {object} attr the JSON representation of the traversal to be parsed
     * @param {string|Traversal} attr.attr the attribute name
     * @param {string} attr.type the traversal type
     * @param {Array.<string>} attr.edges the edge classes to traverse
     * @param {string} attr.direction the direction to traverse
     * @param {Function} attr.cast function to apply to values
     *
     * @returns {Traversal} the parsed traversal object
     */
    static parse(schema, model, attr) {
        const properties = {};
        if (model) {
            Object.assign(properties, model.queryProperties);
        } else {
            Object.assign(properties, schema.E.queryProperties, schema.V.queryProperties);
        }
        if (typeof attr === 'string') {
            attr = parseCompoundAttr(attr);
        }
        const prop = properties[attr.attr || attr]; // property associated with this attr

        if (attr.type === TRAVERSAL_TYPE.EDGE || attr.edges || attr.direction) {
            // Edge property
            let {child} = attr;
            if (child && !child.attr) {
                child = {attr: child};
            }
            if (attr.attr) {
                throw new AttributeError('Edges do not require the attr property since they are not named');
            }
            const validEdges = new Set();
            for (const modelName of Object.keys(schema)) {
                validEdges.add(modelName.toLowerCase());
            }
            for (const edgename of attr.edges || []) {
                if (!validEdges.has(edgename.toLowerCase())) {
                    throw new AttributeError(`Invalid Edge class: ${edgename}`);
                }
            }

            if (child) {
                if (child.attr === 'vertex') {
                    if (attr.direction === 'out') {
                        child.attr = 'inv';
                    } else if (attr.direction === 'in') {
                        child.attr = 'outV';
                    } else {
                        child.attr = 'bothV';
                    }
                }
                child = this.parse(schema, null, child);
            }
            const parsed = new this({
                type: attr.type, child, edges: attr.edges, direction: attr.direction, cast: castToRID
            });
            if (!Object.values(DIRECTIONS).includes(parsed.direction)) {
                throw new AttributeError(`Invalid direction (${parsed.direction})`);
            }
            return parsed;
        }
        const optAttr = {attr: attr.attr || attr};

        const matchbuiltIn = /^(in|out|both)([V])?(\(\))?$/.exec(optAttr.attr);

        if (matchbuiltIn) {
            optAttr.cast = castToRID;
            optAttr.attr = `${matchbuiltIn[1]}V()`;
        }

        if (attr.child) { // Link without a child is the same as a direct attr
            // Linked class property or direct attribute
            if (!attr.attr) {
                throw new AttributeError('attr is a required property for link-type traversals');
            }
            const {child} = attr;
            optAttr.type = TRAVERSAL_TYPE.LINK;
            if (prop) {
                optAttr.property = prop;
                if (!prop.linkedClass) {
                    throw new AttributeError(`The traversal (${attr.attr}) was defined as a link but the property (${prop.name}) does not have a linkedClass`);
                } else {
                    optAttr.child = this.parse(schema, prop.linkedClass, child);
                }
            } else if (matchbuiltIn) {
                optAttr.child = this.parse(schema, null, child);
            } else {
                throw new AttributeError(`The expected property (${attr.attr}) has no definition`);
            }

            return new this(optAttr);
        }
        // Direct attribute
        if (prop) {
            optAttr.property = prop;
        } else if (optAttr.attr === SIZE_COMPUTATION) {
            optAttr.cast = castDecimalInteger;
        } else {
            throw new AttributeError(`The expected property (${optAttr.attr}) has no property on the current model (${model.name})`);
        }
        optAttr.type = TRAVERSAL_TYPE.DIRECT;
        return new this(optAttr);
    }

    /**
     * @returns {string} the string (odb SQL) representation of this traversal object
     */
    toString() {
        if (this.type === TRAVERSAL_TYPE.EDGE) {
            const edges = Array.from(this.edges, quoteWrap).join(', ');
            const base = `${this.direction}E(${edges})`;
            if (this.child) {
                const child = new this.constructor(this.child);
                return `${base}.${child.toString()}`;
            }
            return base;
        } if (this.type === TRAVERSAL_TYPE.LINK) {
            return `${this.attr}.${this.child.toString()}`;
        }
        return this.attr;
    }

    /**
     * For nested Traversal returns the most terminal property
     *
     * @returns {Property} the property (based on a given model) associated with this traversal
     */
    terminalProperty() {
        if (!this.child) {
            return this.property;
        }
        return this.child.terminalProperty();
    }

    /**
     * For nested Traversals return the most terminal cast function
     *
     * @returns {Function} the cast function associated with this traversal
     */
    terminalCast() {
        if (!this.child) {
            return this.cast;
        }
        return this.child.terminalCast();
    }
}

module.exports = {Traversal};
