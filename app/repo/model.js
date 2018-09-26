const orientjs = require('orientjs');

const {
    castDecimalInteger,
    castNullableLink,
    castNullableString,
    castNonEmptyString,
    castNonEmptyNullableString,
    castString,
    castToRID
} = require('./util');
const {AttributeError} = require('./error');


/**
 * @typedef {Object} Expose
 * @property {boolean} QUERY - expose the GET route
 * @property {boolean} GET - expose the GET/{rid} route
 * @property {boolean} POST - expose the POST route
 * @property {boolean} PATCH - expose the PATCH/{rid} route
 * @property {boolean} DELETE - expose the DELETE/{rid} route
 */

const EXPOSE_ALL = {
    QUERY: true, PATCH: true, DELETE: true, POST: true, GET: true
};
const EXPOSE_NONE = {
    QUERY: false, PATCH: false, DELETE: false, POST: false, GET: false
};
const EXPOSE_EDGE = {
    QUERY: true, PATCH: false, DELETE: true, POST: true, GET: true
};


class Property {
    /**
     * create a new property
     *
     * @param {Object} opt options
     * @param {string} opt.name the property name
     * @param {*|Function} opt.default the default value or function for generating the default
     * @param {string} opt.pattern the regex pattern values for this property should follow (used purely in docs)
     * @param {boolean} opt.nullable flag to indicate if the value can be null
     * @param {boolean} opt.mandatory flag to indicate if this property is required
     * @param {boolean} opt.nonEmpty for string properties indicates that an empty string is invalid
     * @param {string} opt.description description for the openapi spec
     * @param {ClassModel} opt.linkedClass if applicable, the class this link should point to or embed
     * @param {Array} opt.choices enum representing acceptable values
     * @param {Number} opt.min minimum value allowed (for intger type properties)
     * @param {Number} opt.max maximum value allowed (for integer type properties)
     * @param {Function} opt.cast the function to be used in formatting values for this property (for list properties it is the function for elements in the list)
     *
     * @return {Property} the new property
     */
    constructor(opt) {
        if (!opt.name) {
            throw new AttributeError('name is a required parameter');
        }
        this.name = opt.name;
        if (opt.default !== undefined) {
            if (opt.default instanceof Function) {
                this.generateDefault = opt.default;
            } else {
                this.default = opt.default;
            }
        }
        this.pattern = opt.pattern;
        this.generated = !!opt.generated;
        this.type = opt.type || 'string';
        this.cast = opt.cast;
        this.description = opt.description;
        this.nullable = opt.nullable === undefined
            ? true
            : !!opt.nullable;
        this.mandatory = !!opt.mandatory; // default false
        this.nonEmpty = !!opt.nonEmpty;

        this.iterable = !!/(set|list|bag|map)/ig.exec(this.type);
        this.linkedClass = opt.linkedClass;
        this.min = opt.min;
        this.max = opt.max;
        this.choices = opt.choices;
        if (!this.cast) { // set the default cast functions
            if (this.type === 'integer') {
                this.cast = castDecimalInteger;
            } else if (this.type === 'string') {
                if (!this.nullable) {
                    this.cast = this.nonEmpty
                        ? castNonEmptyString
                        : castString;
                } else {
                    this.cast = this.nonEmpty
                        ? castNonEmptyNullableString
                        : castNullableString;
                }
            } else if (this.type.includes('link')) {
                if (!this.nullable) {
                    this.cast = castToRID;
                } else {
                    this.cast = castNullableLink;
                }
            }
        }
    }

    /**
     * Create the property in the database
     *
     * @param {orientjs.dbClass} the database class object from orientjs
     */
    async create(dbClass) {
        const dbProperties = {
            name: this.name,
            type: this.type,
            notNull: !this.nullable,
            mandatory: this.mandatory
        };
        if (this.linkedClass) {
            dbProperties.linkedClass = this.linkedClass.name;
        }
        if (this.default !== undefined) {
            dbProperties.default = this.default;
        }
        if (this.min !== undefined) {
            dbProperties.min = this.min;
        }
        if (this.max !== undefined) {
            dbProperties.max = this.max;
        }
        return dbClass.property.create(dbProperties);
    }
}


class ClassModel {
    /**
     * @param {Object} opt
     * @param {string} opt.name the class name
     * @param {Object.<string,function>} [opt.defaults={}] the mapping of attribute names to functions producing default values
     * @param {ClassModel[]} [opt.inherits=[]] the models this model inherits from
     * @param {Array} [opt.edgeRestrictions=[]] list of class pairs this edge type is allowed to join
     * @param {boolean} [opt.isAbstract=false] this is an abstract class
     * @param {Object.<string,Object>} [opt.properties={}] mapping by attribute name to property objects (defined by orientjs)
     * @param {Function} [opt.paraphrase] the function to paraphrase this class type
     * @param {Expose} [opt.expose] the routes to expose to the API for this class
     * @param {boolean} [opt.embedded=false] this class owns no records and is used as part of other class records only
     */
    constructor(opt) {
        this.name = opt.name;
        this._inherits = opt.inherits || [];
        this.subclasses = opt.subclasses || [];
        this.isEdge = !!opt.isEdge;
        this._edgeRestrictions = opt.edgeRestrictions || null;
        this._paraphrase = opt.paraphrase;
        if (this._edgeRestrictions) {
            this.isEdge = true;
        }
        this.embedded = !!opt.embedded;
        this.reverseName = opt.reverseName;
        this.isAbstract = !!opt.isAbstract;
        if (this.isAbstract || this.embedded) {
            this.expose = Object.assign({}, EXPOSE_NONE, opt.expose || {});
        } else if (this.isEdge) {
            this.expose = Object.assign({}, EXPOSE_EDGE, opt.expose || {});
        } else {
            this.expose = Object.assign({}, EXPOSE_ALL, opt.expose || {});
        }
        this.indices = opt.indices || [];

        this._properties = opt.properties || {}; // by name
        for (const [name, prop] of Object.entries(this._properties)) {
            if (!(prop instanceof Property)) {
                this._properties[name] = new Property(Object.assign({name}, prop));
            }
        }
    }

    get routeName() {
        if (!this.isEdge && !this.name.endsWith('ary') && this.name.toLowerCase() !== 'evidence') {
            if (/.*[^aeiou]y$/.exec(this.name)) {
                return `/${this.name.slice(0, this.name.length - 1)}ies`.toLowerCase();
            }
            return `/${this.name}s`.toLowerCase();
        }
        return `/${this.name.toLowerCase()}`;
    }

    /**
     * @returns {string[]} the list of parent class names which this class inherits from
     */
    get inherits() {
        const parents = [];
        for (const model of this._inherits) {
            parents.push(model.name);
            parents.push(...model.inherits);
        }
        return parents;
    }

    /**
     * Create this class (and its properties) in the database
     *
     * @param {orientjs.Db} db the database connection
     */
    async create(db) {
        const inherits = this._inherits
            ? Array.from(this._inherits, x => x.name).join(',')
            : null;

        const cls = await db.class.create(this.name, inherits, null, this.isAbstract); // create the class first
        await Promise.all(Array.from(
            Object.values(this._properties).filter(prop => !prop.name.startsWith('@')),
            async prop => prop.create(cls)
        ));
        await Promise.all(Array.from(this.indices, i => db.index.create(i)));
        return cls;
    }

    /**
     * Given some record, returns a string representation that is used for display purposes only
     *
     * @param {Object} record the record to be paraphrased
     * @param {Object.<string,ClassModel>} schema mapping of names to db class models
     */
    paraphraseRecord(record, schema) {
        const newRecord = {};
        const {properties} = this;
        for (let [attr, value] of Object.entries(record)) {
            if (attr.startsWith('out_') || attr.startsWith('in_')) {
                newRecord[attr] = value;
                continue;
            }
            if (properties[attr] === undefined) {
                continue;
            }
            if (value && value['@class']) {
                const model = schema[value['@class']];
                value = model.paraphraseRecord(value, schema);
            }
            newRecord[attr] = value;
        }
        let paraphraseFunc = this._paraphrase;
        for (const parentName of this.inherits) {
            if (paraphraseFunc) {
                break;
            }
            paraphraseFunc = schema[parentName]._paraphrase;
        }
        if (paraphraseFunc) {
            return paraphraseFunc(newRecord, schema);
        }
        return `${record['@class']}[${record['@rid']}]`;
    }

    /**
     * Given the name of a subclass, retrieve the subclass model or throw an error if it is not
     * found
     *
     * @param {string} modelName the name of the model to find as a subclass
     */
    subClassModel(modelName) {
        for (const subclass of this.subclasses) {
            if (subclass.name === modelName) {
                return subclass;
            }
            try {
                return subclass.subClassModel(modelName);
            } catch (err) {}
        }
        throw new Error(`The subclass (${
            modelName
        }) was not found as a subclass of the current model (${
            this.name
        })`);
    }

    /**
     * Returns a set of properties from this class and all subclasses
     */
    get queryProperties() {
        const queue = Array.from(this.subclasses);
        const queryProps = this.properties;
        while (queue.length > 0) {
            const curr = queue.shift();
            for (const prop of Object.values(curr._properties)) {
                if (queryProps[prop.name] === undefined) { // first model to declare is used
                    queryProps[prop.name] = prop;
                }
            }
            queue.push(...curr.subclasses);
        }
        return queryProps;
    }

    /**
     * @returns {Array.<string>} a list of property names for all required properties
     */
    get required() {
        const required = Array.from(Object.values(this._properties).filter(
            prop => prop.mandatory
        ), prop => prop.name);
        for (const parent of this._inherits) {
            required.push(...parent.required);
        }
        return required;
    }

    /**
     * @returns {Array.<string>} a list of property names for all optional properties
     */
    get optional() {
        const optional = Array.from(
            Object.values(this._properties).filter(prop => !prop.mandatory),
            prop => prop.name
        );
        for (const parent of this._inherits) {
            optional.push(...parent.optional);
        }
        return optional;
    }

    /**
     * @returns {Array.<Property>} a list of the properties associate with this class or parents of this class
     */
    get properties() {
        let properties = Object.assign({}, this._properties);
        for (const parent of this._inherits) {
            properties = Object.assign({}, parent.properties, properties);
        }
        return properties;
    }

    /**
     * @returns {Object} a partial json representation of the current class model
     */
    toJSON() {
        const json = {
            properties: this.properties,
            inherits: this.inherits,
            edgeRestrictions: this._edgeRestrictions,
            isEdge: !!this.isEdge,
            name: this.name,
            isAbstract: this.isAbstract,
            embedded: this.embedded
        };
        if (this.reverseName) {
            json.reverseName = this.reverseName;
        }
        if (Object.values(this.expose).some(x => x)) {
            json.route = this.routeName;
        }
        return json;
    }

    /**
     * Given some orientjs class object, compare the model to the schema definition expected
     * @param {orientjs.dbClass} oclass the class from the database load
     *
     * @throws {Error} when the parsed class from the database does not match the expected schema definition
     */
    compareToDbClass(oclass) {
        for (const dbProp of oclass.properties) {
            if (dbProp.name.startsWith('@') && !['@version', '@class', '@rid'].includes(prop.name)) {
                continue;
            }
            // get the property definition from the schema
            const prop = this.properties[dbProp.name];
            if (prop === undefined) {
                throw new Error(`[${
                    this.name
                }] failed to find the property ${
                    dbProp.name
                } on the schema definition`);
            }
            const dbPropType = orientjs.types[dbProp.type].toLowerCase();
            if (dbPropType !== prop.type) {
                throw new Error(
                    `[${this.name}] The type defined on the schema model (${
                        prop.type
                    }) does not match the type loaded from the database (${
                        dbPropType
                    })`
                );
            }
        }
        if ((oclass.defaultClusterId === -1) !== this.isAbstract) {
            throw new Error(
                `The abstractness (${
                    this.isAbstract
                }) of the schema model ${
                    this.name
                } does not match the database definition (${
                    oclass.defaultClusterId
                })`
            );
        }
    }

    /**
     * Checks a single record to ensure it matches the expected pattern for this class model
     *
     * @param {Object} record the record to be checked
     * @param {Object} opt options
     * @param {boolean} [opt.dropExtra=true] drop any record attributes that are not defined on the current class model by either required or optional
     * @param {boolean} [opt.addDefaults=false] add default values for any attributes not given (where defined)
     * @param {boolean} [opt.ignoreMissing=false] do not throw an error when a required attribute is missing
     * @param {boolean} [opt.ignoreExtra=false] do not throw an error when an unexpected value is given
     */
    formatRecord(record, opt) {
        // add default options
        opt = Object.assign({
            dropExtra: true,
            addDefaults: false,
            ignoreMissing: false,
            ignoreExtra: false
        }, opt);
        const formattedRecord = Object.assign({}, opt.dropExtra
            ? {}
            : record);
        const {properties} = this;

        if (!opt.ignoreExtra && !opt.dropExtra) {
            for (const attr of Object.keys(record)) {
                if (this.isEdge && (attr === 'out' || attr === 'in')) {
                    continue;
                }
                if (properties[attr] === undefined) {
                    throw new AttributeError(`[${this.name}] unexpected attribute: ${attr}`);
                }
            }
        }
        // if this is an edge class, check the to and from attributes
        if (this.isEdge) {
            formattedRecord.out = record.out;
            formattedRecord.in = record.in;
        }

        // add the non generated (from other properties) attributes
        for (const prop of Object.values(properties)) {
            if (opt.addDefaults && record[prop.name] === undefined && !prop.generated) {
                if (prop.default !== undefined) {
                    formattedRecord[prop.name] = prop.default;
                } else if (prop.generateDefault) {
                    formattedRecord[prop.name] = prop.generateDefault();
                }
            }
            // check that the required attributes are there
            if (prop.mandatory) {
                if (record[prop.name] === undefined && opt.ignoreMissing) {
                    continue;
                }
                if (record[prop.name] !== undefined) {
                    formattedRecord[prop.name] = record[prop.name];
                }
                if (formattedRecord[prop.name] === undefined && !opt.ignoreMissing) {
                    throw new AttributeError(`[${this.name}] missing required attribute ${prop.name}`);
                }
            } else if (record[prop.name] !== undefined) {
                // add any optional attributes that were specified
                formattedRecord[prop.name] = record[prop.name];
            }
            // try the casting
            if (formattedRecord[prop.name] !== undefined
                && formattedRecord[prop.name] !== null
                && prop.cast
            ) {
                try {
                    if (/(bag|set|list|map)/.exec(prop.type)) {
                        formattedRecord[prop.name].forEach((elem, i) => {
                            formattedRecord[prop.name][i] = prop.cast(elem);
                        });
                    } else {
                        formattedRecord[prop.name] = prop.cast(formattedRecord[prop.name]);
                    }
                } catch (err) {
                    throw new AttributeError({
                        message: `[${this.name}] Failed in casting (${prop.cast.name}) attribute (${
                            prop.name}) with value (${formattedRecord[prop.name]}): ${err.message}`,
                        castFunc: prop.cast
                    });
                }
            }
        }
        // check the properties with enum values
        for (const [attr, value] of Object.entries(formattedRecord)) {
            const prop = properties[attr];
            if (prop && prop.choices) {
                if (prop.nullable && value === null) {
                    continue;
                }
                if (!prop.choices.includes(value)) {
                    throw new AttributeError(`[${
                        this.name
                    }] Expected controlled vocabulary choices. ${
                        value
                    } is not in the list of valid choices: ${
                        prop.choices
                    }`);
                }
            }
        }
        // look for linked models
        for (let [attr, value] of Object.entries(formattedRecord)) {
            let {linkedClass} = properties[attr];
            if (properties[attr].type === 'embedded' && linkedClass && typeof value === 'object') {
                if (value && value['@class'] && value['@class'] !== linkedClass.name) {
                    linkedClass = linkedClass.subClassModel(value['@class']);
                }
                value = linkedClass.formatRecord(value);
            }
            formattedRecord[attr] = value;
        }
        // create the generated attributes
        for (const prop of Object.values(properties)) {
            if (prop.generated && prop.generateDefault) {
                formattedRecord[prop.name] = prop.generateDefault(formattedRecord);
            }
        }
        return formattedRecord;
    }
}


module.exports = {
    ClassModel,
    Property,
    EXPOSE_ALL,
    EXPOSE_EDGE,
    EXPOSE_NONE
};
