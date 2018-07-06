/**
 * Repsonsible for defining and loading the database schema.
 * @module app/repo/schema
 */
const {types}  = require('orientjs');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');

const {PERMISSIONS} = require('./constants');
const {createRepoFunctions} = require('./functions');
const {castUUID, timeStampNow, castToRID, VERBOSE} = require('./util');
const {populateCache} = require('./base');
const {AttributeError} = require('./error');


const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];

const INDEX_SEP_CHARS = ' \r\n\t:;,.|+*/\\=!?[]()';  // default separator chars for orientdb full text hash: https://github.com/orientechnologies/orientdb/blob/2.2.x/core/src/main/java/com/orientechnologies/orient/core/index/OIndexFullText.java


const SCHEMA_DEFN = {
    V: {
        properties: [
            {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
            {name: 'createdAt', type: 'long', mandatory: true, notNull: true},
            {name: 'deletedAt', type: 'long'},
            {name: 'createdBy', type: 'link', mandatory: true, notNull: true,  linkedClass: 'User'},
            {name: 'deletedBy', type: 'link', linkedClass: 'User', notNull: true},
            {name: 'history', type: 'link', notNull: true},
            {name: 'comment', type: 'string'}
        ]
    },
    E: {
        properties: [
            {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
            {name: 'createdAt', type: 'long', mandatory: true, notNull: true},
            {name: 'deletedAt', type: 'long'},
            {name: 'createdBy', type: 'link', mandatory: true, notNull: true,  linkedClass: 'User'},
            {name: 'deletedBy', type: 'link', linkedClass: 'User', notNull: true},
            {name: 'history', type: 'link', notNull: true},
            {name: 'comment', type: 'string'}
        ]
    },
    UserGroup: {
        properties: [
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'permissions', type: 'embedded', linkedClass: 'Permissions'}
        ],
        indices: [
            {
                name: 'ActiveUserGroup',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name'],
                'class':  'UserGroup'
            }
        ]
    },
    Permissions: {},
    Evidence: {isAbstract: true},
    Biomarker: {isAbstract: true},
    User: {
        properties: [
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'groups', type: 'linkset', linkedClass: 'UserGroup'},
            {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
            {name: 'createdAt', type: 'long', mandatory: true, notNull: true},
            {name: 'deletedAt', type: 'long'},
            {name: 'history', type: 'link', notNull: true},
            {name: 'createdBy', type: 'link', notNull: true, mandatory: false}
        ],
        indices: [
            {
                name: 'ActiveUserName',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name', 'deletedAt'],
                'class':  'User'
            }
        ]
    },
    Source: {
        inherits: ['Evidence', 'V'],
        properties: [
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'version', type: 'string'},
            {name: 'url', type: 'string'},
            {name: 'description', type: 'string'},
            {name: 'usage', type: 'string'}
        ],
        indices: [
            {
                name: 'Source.active',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name', 'version', 'deletedAt'],
                class: 'Source'
            }
        ]
    },
    Ontology: {
        inherits: ['V', 'Biomarker'],
        properties: [
            {name: 'source', type: 'link', mandatory: true, notNull: true, linkedClass: 'Source'},
            {name: 'sourceId', type: 'string', mandatory: true, notNull: true},
            {name: 'dependency', type: 'link'},
            {name: 'name', type: 'string'},
            {name: 'sourceIdVersion', type: 'string'},
            {name: 'description', type: 'string'},
            {name: 'longName', type: 'string'},
            {name: 'subsets', type: 'embeddedset', linkedType: 'string'},
            {name: 'deprecated', type: 'boolean', default: false, notNull: true, mandatory: true},
            {name: 'url', type: 'string'}
        ],
        indices: [
            {
                name: 'Ontology.active',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['source', 'sourceId', 'name', 'deletedAt', 'sourceIdVersion', 'dependency'],
                class:  'Ontology'
            },
            {
                name: 'Ontology.name',
                type: 'NOTUNIQUE_HASH_INDEX',
                properties: ['name'],
                class: 'Ontology'
            },
            {
                name: 'Ontology.sourceId',
                type: 'NOTUNIQUE_HASH_INDEX',
                properties: ['sourceId'],
                class: 'Ontology'
            },
            {
                name: 'Ontology.full',
                type: 'FULLTEXT_HASH_INDEX',
                properties: ['name'],
                class: 'Ontology',
                metadata: {separatorChars: INDEX_SEP_CHARS}
            }
        ],
        isAbstract: true
    },
    EvidenceLevel: {inherits: ['Ontology', 'Evidence']},
    ClinicalTrial: {
        inherits: ['Ontology', 'Evidence'],
        properties: [
            {name: 'phase', type: 'string'},
            {name: 'size', type: 'integer'},
            {name: 'startYear', type: 'integer'},
            {name: 'completionYear', type: 'integer'},
            {name: 'country', type: 'string'},
            {name: 'city', type: 'string'}
        ]
    },
    Publication: {
        inherits: ['Ontology', 'Evidence'],
        properties: [
            {name: 'journalName', type: 'string'},
            {name: 'year', type: 'integer'}
        ]
    },
    Therapy: {
        inherits: ['Ontology'],
        properties: [
            {name: 'mechanismOfAction', type: 'string'}
        ]
    },
    Feature: {
        inherits: ['Ontology'],
        properties: [
            {name: 'start', type: 'integer'},
            {name: 'end', type: 'integer'},
            {name: 'biotype', type: 'string', mandatory: true, notNull: true}
        ]
    },

    Position: {isAbstract: true},
    ProteinPosition: {
        inherits: ['Position'],
        properties: [
            {name: 'pos', type: 'integer', min: 1},
            {name: 'refAA', type: 'string'}
        ]
    },
    CytobandPosition: {
        inherits: ['Position'],
        properties: [
            {name: 'arm', type: 'string', mandatory: true, notNull: true},
            {name: 'majorBand', type: 'integer', min: 1},
            {name: 'minorBand', type: 'integer'}
        ]
    },
    GenomicPosition: {
        inherits: ['Position'],
        properties: [{name: 'pos', type: 'integer', min: 1}]
    },
    ExonicPosition: {
        inherits: ['Position'],
        properties: [{name: 'pos', type: 'integer', min: 1}]
    },
    CdsPosition: {
        inherits: ['Position'],
        properties: [
            {name: 'pos', type: 'integer', min: 1},
            {name: 'offset', type: 'integer'}
        ]
    },
    Variant: {
        inherits: ['V', 'Biomarker'],
        properties: [
            {name: 'type', mandatory: true, type: 'string', notNull: true},
            {name: 'subtype', type: 'string'},
            {name: 'zygosity', type: 'string'},
            {name: 'germline', type: 'boolean'}
        ],
        isAbstract: true
    },
    PositionalVariant: {
        inherits: ['Variant'],
        properties: [
            {name: 'reference', mandatory: true, type: 'link', linkedClass: 'Feature', notNull: true},
            {name: 'reference2', type: 'link', linkedClass: 'Feature', notNull: true},
            {name: 'break1Start', type: 'embedded', linkedClass: 'Position'},
            {name: 'break1End', type: 'embedded', linkedClass: 'Position'},
            {name: 'break1Repr', type: 'string'},
            {name: 'break2Start', type: 'embedded', linkedClass: 'Position'},
            {name: 'break2End', type: 'embedded', linkedClass: 'Position'},
            {name: 'break2Repr', type: 'string'},
            {name: 'refSeq', type: 'string'},
            {name: 'untemplatedSeq', type: 'string'},
            {name: 'untemplatedSeqSize', type: 'integer'},  // for when we know the number of bases inserted but not what they are
            {name: 'truncation', type: 'integer'}
        ],
        indices: [
            {
                name: 'PositionalVariant.active',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: [
                    'break1Repr',
                    'break2Repr',
                    'deletedAt',
                    'germline',
                    'refSeq',
                    'reference',
                    'reference2',
                    'subtype',
                    'type',
                    'untemplatedSeq',
                    'untemplatedSeqSize',
                    'zygosity',
                    'truncation'
                ],
                class: 'PositionalVariant'
            },
            {
                name: 'PositionalVariant.reference',
                type: 'NOTUNIQUE_HASH_INDEX',
                metadata: {ignoreNullValues: true},
                properties: [
                    'reference'
                ],
                class: 'PositionalVariant'
            },
            {
                name: 'PositionalVariant.reference2',
                type: 'NOTUNIQUE_HASH_INDEX',
                metadata: {ignoreNullValues: true},
                properties: [
                    'reference2'
                ],
                class: 'PositionalVariant'
            }
        ]
    },
    CategoryVariant: {
        inherits: ['Variant'],
        properties: [
            {name: 'reference', mandatory: true, type: 'link', linkedClass: 'Ontology', notNull: true},
            {name: 'reference2', type: 'link', linkedClass: 'Ontology', notNull: true},
            {name: 'value', type: 'string', mandatory: true, notNull: true},
            {name: 'method', type: 'string'}
        ],
        indices: [
            {
                name: 'CategoryVariant.active',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: [
                    'deletedAt',
                    'germline',
                    'method',
                    'reference',
                    'reference2',
                    'subtype',
                    'type',
                    'value',
                    'zygosity'
                ],
                class: 'CategoryVariant'
            },
            {
                name: 'CategoryVariant.reference',
                type: 'NOTUNIQUE_HASH_INDEX',
                metadata: {ignoreNullValues: true},
                properties: [
                    'reference'
                ],
                class: 'CategoryVariant'
            },
            {
                name: 'CategoryVariant.reference2',
                type: 'NOTUNIQUE_HASH_INDEX',
                metadata: {ignoreNullValues: true},
                properties: [
                    'reference2'
                ],
                class: 'CategoryVariant'
            }
        ]
    },
    OntologyEdge: {
        inherits: ['E'],
        properties: [{name: 'source', type: 'link', mandatory: true, notNull: true, linkedClass: 'Source'}]
    },
    Statement: {
        inherits: ['V'],
        properties: [
            {name: 'relevance', type: 'link', linkedClass: 'Relevance', mandatory: true, notNull: true},
            {name: 'appliesTo', type: 'link', linkedClass: 'Ontology', mandatory: true, notNull: true},
            {name: 'reviewStatus', type: 'string'},
            {name: 'reviewedBy', type: 'link', linkedClass: 'User'},
            {name: 'reviewedAt', type: 'long'},
            {name: 'reviewComment', type: 'string'}
        ]
    }
};

// Add the simple ontology subclasses
for (let name of [
    'AnatomicalEntity',
    'Disease',
    'Pathway',
    'Relevance',
    'Signature'
]) {
    SCHEMA_DEFN[name] = {inherits: ['Ontology']};
}

// Add the other edge classes
for (let name of [
    'AliasOf',
    'Cites',
    'DeprecatedBy',
    'ElementOf',
    'Implies',
    'Infers',
    'SubClassOf',
    'SupportedBy',
    'TargetOf'
]) {
    const inheritFrom = ['Implies', 'SupportedBy', 'Infers'].includes(name) ? 'E' : 'OntologyEdge';
    SCHEMA_DEFN[name] = {
        inherits: [inheritFrom],
        properties: [
            {name: 'in', type: 'link'},
            {name: 'out', type: 'link'}
        ],
        indices: [ // add index on the class so it doesn't apply across classes
            {
                name: `${name}.restrictMultiplicity`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['deletedAt', 'in', 'out'],
                class: name
            }
        ]
    };
}

// Set the name to match the key
for (let name of Object.keys(SCHEMA_DEFN)) {
    SCHEMA_DEFN[name].name = name;
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
     */
    constructor(opt) {
        this.name = opt.name;
        this._cast = opt.cast || {};
        this._defaults = opt.defaults || {};
        this._inherits = opt.inherits || [];
        this.isEdge = opt.isEdge ? true : false;
        this._edgeRestrictions = opt.edgeRestrictions || null;
        if (this._edgeRestrictions) {
            this.isEdge = true;
        }
        this.isAbstract = opt.isAbstract;
        this._properties = opt.properties || {};  // by name

        for (let prop of Object.values(this._properties)) {
            if (/(set|list|bag|map)/.exec(prop.type)) {
                prop.iterable = true;
            } else {
                prop.iterable = false;
            }
        }
    }

    get routeName() {
        if (! this.isEdge) {
            if (/.*[^aeiou]y$/.exec(this.name)) {
                return `/${this.name.slice(0, this.name.length - 1)}ies`.toLowerCase();
            } else {
                return `/${this.name}s`.toLowerCase();
            }
        }
        return `/${this.name.toLowerCase()}`;
    }

    /**
     * @returns {string[]} the list of parent class names which this class inherits from
     */
    get inherits() {
        let parents = [];
        for (let model of this._inherits) {
            parents.push(model.name);
            parents.push(...model.inherits);
        }
        return parents;
    }

    /**
     * @returns {string[]} a list of property names for all required properties
     */
    get required() {
        let required = Array.from(Object.values(this._properties).filter(prop => prop.mandatory), (prop) => prop.name);
        for (let parent of this._inherits) {
            required.push(...parent.required);
        }
        return required;
    }

    /**
     * @returns {string[]} a list of property names for all optional properties
     */
    get optional() {
        let optional = Array.from(Object.values(this._properties).filter(prop => ! prop.mandatory), (prop) => prop.name);
        for (let parent of this._inherits) {
            optional.push(...parent.optional);
        }
        return optional;
    }

    /**
     * @returns {string[]} list of property names
     */
    get propertyNames() {
        return Object.keys(this.properties);
    }

    get properties() {
        let properties = Object.assign({}, this._properties);
        for (let parent of this._inherits) {
            properties = Object.assign({}, parent.properties, properties);
        }
        return properties;
    }

    get cast() {
        let cast = Object.assign({}, this._cast);
        for (let parent of this._inherits) {
            cast = Object.assign({}, parent.cast, cast);
        }
        return cast;
    }

    get defaults() {
        let defaults = Object.assign({}, this._defaults);
        for (let parent of this._inherits) {
            defaults = Object.assign({}, parent.defaults, defaults);
        }
        return defaults;
    }

    /**
     * returns a partial json representation of the current class model
     */
    toJSON() {
        return {
            properties: this.properties,
            inherits: this.inherits,
            edgeRestrictions: this._edgeRestrictions
        };
    }
    /**
     * Given some orientjs class object, convert it to the current model
     * @param {object} oclass
     * @returns {ClassModel} the parsed class
     */
    static parseOClass(oclass) {
        const defaults = {};
        const cast = {};
        const properties = {};
        for (let prop of oclass.properties) {
            prop = _.omit(prop, ['class']);
            if (prop.name.startsWith('@') && ! ['@version', '@class', '@rid'].includes(prop.name)) {
                continue;
            }
            properties[prop.name] = prop;

            if (prop.defaultValue) {
                defaults[prop.name] = () => prop.defaultValue;
            }
            prop.type = types[prop.type].toLowerCase();  // human readable, defaults to number system from the db
            if (prop.type === 'integer') {
                cast[prop.name] = (x) => parseInt(x, 10);
            } else if (prop.type === 'string') {
                if (prop.notNull) {
                    cast[prop.name] = (x) => x.toLowerCase();
                } else {
                    cast[prop.name] = (x) => x === null ? null : x.toLowerCase();
                }
            } else if (prop.type.includes('link')) {
                if (prop.notNull) {
                    cast[prop.name] = castToRID;
                } else {
                    cast[prop.name] = (string) => {
                        try {
                            if (string === null || string.toLowerCase() == 'null') {
                                return null;
                            }
                        } catch (err) {}
                        return castToRID(string);
                    };
                }
            }

            if (prop.name === 'uuid') {
                defaults.uuid = uuidV4;
            } else if (prop.name === 'createdAt') {
                defaults.createdAt = timeStampNow;
            }
        }
        return new this({
            name: oclass.name,
            properties: properties,
            defaults: defaults,
            cast: cast,
            isAbstract: oclass.defaultClusterId === -1 ? true : false
        });
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
        const formattedRecord = Object.assign({}, opt.dropExtra ? {} : record);
        const properties = this.properties;
        const prefixed = {};

        if (! opt.ignoreExtra && ! opt.dropExtra) {
            for (let attr of Object.keys(record)) {
                if (this.isEdge && (attr === 'out' || attr === 'in')) {
                    continue;
                }
                if (properties[attr] === undefined && prefixed[attr] === undefined) {
                    throw new AttributeError(`unexpected attribute: ${attr}`);
                }
            }
        }
        // if this is an edge class, check the to and from attributes
        if (this.isEdge) {
            formattedRecord.out = record.out;
            formattedRecord.in = record.in;
        }

        // add any defaults that were not otherwise given
        if (opt.addDefaults) {
            for (let attr of Object.keys(this.defaults)) {
                if (record[attr] === undefined) {
                    formattedRecord[attr] = this.defaults[attr]();
                }
            }
        }
        for (let prop of Object.values(properties)) {
            // check that the required attributes are there
            if (prop.mandatory) {
                if (record[prop.name] === undefined && opt.ignoreMissing) {
                    continue;
                }
                if (record[prop.name] !== undefined) {
                    formattedRecord[prop.name] = record[prop.name];
                }
                if (formattedRecord[prop.name] === undefined && ! opt.ignoreMissing) {
                    throw new AttributeError(`missing required attribute ${prop.name}`);
                }
                formattedRecord[prop.name] = formattedRecord[prop.name];
            } else if (record[prop.name] !== undefined) {
                // add any optional attributes that were specified
                formattedRecord[prop.name] = record[prop.name];
            }
        }

        // try the casting
        for (let attr of Object.keys(this.cast)) {
            if (formattedRecord[attr] != undefined) {
                if (/(bag|set|list|map)/.exec(properties[attr].type)) {
                    for (let i in formattedRecord[attr]) {
                        formattedRecord[attr][i] = this.cast[attr](formattedRecord[attr][i]);
                    }
                } else {
                    formattedRecord[attr] = this.cast[attr](formattedRecord[attr]);
                }
            }
        }
        return formattedRecord;
    }
}

/**
 * creates a class in the database
 *
 * @returns {object} the newly created class
 */
const createClassModel = async (db, model) => {
    model = Object.assign([], model);
    model.properties = model.properties || [];
    model.indices = model.indices || [];
    model.isAbstract = model.isAbstract || false;
    model.inherits = model.inherits ? model.inherits.join(',') : null;

    if (model.name === undefined) {
        throw new AttributeError(`required attribute was not defined: clsname=${model.name}`);
    }

    const cls = await db.class.create(model.name, model.inherits, null, model.isAbstract); // create the class first
    await Promise.all(Array.from(model.properties, (prop) => cls.property.create(prop)));
    await Promise.all(Array.from(model.indices, (i) => db.index.create(i)));
    return cls;
};

const createProperties = async (cls, props) => {
    return await Promise.all(Array.from(props, (prop) => cls.property.create(prop)));
};


/**
 * Split class models into an array or arrays such that any model with dependencies
 * will be in an array after the array containing the class models it depends on
 */
const splitSchemaClassLevels = (schema) => {
    const ranks = {};
    const queue = Object.values(schema);
    while (queue.length > 0) {
        const curr = queue.shift();
        let dependencies = Array.from(curr.inherits || []);
        for (let prop of curr.properties || []) {
            if (prop.linkedClass) {
                dependencies.push(prop.linkedClass);
            }
        }
        dependencies = dependencies.filter(name => schema[name] !== undefined);

        if (dependencies.length > 0) {
            if (dependencies.some((name) => ranks[name] === undefined)) {
                queue.push(curr);
            } else {
                ranks[curr.name] = Math.max(...Array.from(dependencies, (name) => ranks[name])) + 1;
            }
        } else {
            ranks[curr.name] = 0;
        }
    }
    const split = [];

    for (let [clsName, rank] of Object.entries(ranks)) {
        if (split[rank] === undefined) {
            split[rank] = [];
        }
        split[rank].push(schema[clsName]);
    }
    return split;
}


/**
 * Defines and uilds the schema in the database
 *
 * @param {object} db the orientjs database connection object
 */
const createSchema = async (db) => {
    // create the permissions class
    const Permissions = await createClassModel(db, SCHEMA_DEFN.Permissions);; // (name, extends, clusters, abstract)
    // create the user class
    await createClassModel(db, SCHEMA_DEFN.UserGroup);
    const defaultGroups = [
        {name: 'admin', permissions: {V: PERMISSIONS.ALL, E: PERMISSIONS.ALL, User: PERMISSIONS.ALL, UserGroup: PERMISSIONS.ALL}},
        {name: 'regular', permissions: {V: PERMISSIONS.ALL, E: PERMISSIONS.ALL, User: PERMISSIONS.READ, UserGroup: PERMISSIONS.READ}},
        {name: 'readOnly', permissions: {V: PERMISSIONS.READ, E: PERMISSIONS.READ, User: PERMISSIONS.READ, UserGroup: PERMISSIONS.READ}}
    ];
    const groups = await Promise.all(Array.from(defaultGroups, x => db.insert().into('UserGroup').set(x).one()));
    await createClassModel(db, SCHEMA_DEFN.User);
    // modify the existing vertex and edge classes to add the minimum required attributes for tracking etc
    const V = await db.class.get('V');
    await createProperties(V, SCHEMA_DEFN.V.properties);
    const E = await db.class.get('E');
    await createProperties(E, SCHEMA_DEFN.E.properties);

    for (let cls of ['E', 'V', 'User']) {
        await db.index.create({
            name: `${cls}.activeId`,
            type: 'unique',
            metadata: {ignoreNullValues: false},
            properties: ['uuid', 'deletedAt'],
            'class':  cls
        });
    }
    if (VERBOSE) {
        console.log('defined schema for the major base classes');
    }
    // create the other schema classes
    const classesByLevel = splitSchemaClassLevels(_.omit(SCHEMA_DEFN, ['Permissions', 'User', 'UserGroup', 'V', 'E']));

    for (let classList of classesByLevel) {
        if (VERBOSE) {
            console.log(`creating the classes: ${Array.from(classList, cls => cls.name).join(', ')}`);
        }
        await Promise.all(Array.from(classList, async (cls) => { return await createClassModel(db, cls); }));
    }

    const properties = [];
    for (let name of Object.keys(SCHEMA_DEFN)) {
        if (name !== 'Permissions') {
            properties.push({min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', notNull: true, readOnly: false, name: name});
        }
    }
    await createProperties(Permissions, properties);

    if (VERBOSE) {
        console.log('Schema is Complete');
    }
};



/**
 * Loads the schema from the database and then adds additional checks. returns the object of models.
 * Checks that the schema loaded from the databases matches the schema defined here
 *
 * @param {object} db the orientjs database connection
 */
const loadSchema = async (db) => {
    // adds checks etc to the schema loaded from the database
    const schema = {};

    const classes = await db.class.list();

    for (let cls of classes) {
        if (/^(O[A-Z]|_)/.exec(cls.name)) {  // orientdb builtin classes
            continue;
        }
        const model = ClassModel.parseOClass(cls);
        schema[model.name] = model;
        if (SCHEMA_DEFN[model.name] === undefined) {
            throw new Error(`The class loaded from the database (${model.name}) is not defined in the SCHEMA_DEFN`);
        }
        if (cls.superClass && ! SCHEMA_DEFN[model.name].inherits.includes(cls.superClass)) {
            throw new Error(`The class ${model.name} inherits according to the database (${cls.superClass}) does not match those defined by the schema definition: ${SCHEMA_DEFN[model.name].inherits}`);
        }
    }

    for (let model of Object.values(schema)) {
        model._inherits = Array.from(SCHEMA_DEFN[model.name].inherits || [], parent => schema[parent]);
    }

    // defines the source/target classes allowed for each type of edge/relationship
    const edgeRestrictions = {
        AliasOf: [],  // auto add all self
        DeprecatedBy: [],  // auto add all self
        ElementOf: [
            ['ClinicalTrial', 'Publication'],
            ['Publication', 'Source'],
            ['ClinicalTrial', 'Source']
        ],
        Implies: [
            ['CategoryVariant', 'Statement'],
            ['PositionalVariant', 'Statement']
        ],
        Infers: [
            ['CategoryVariant', 'PositionalVariant'],
            ['PositionalVariant', 'CategoryVariant'],
            ['PositionalVariant', 'PositionalVariant'],
            ['CategoryVariant', 'CategoryVariant']
        ],
        SubClassOf: [],  // auto add all self
        SupportedBy: [
            ['Statement', 'Publication'],
            ['Statement', 'ClinicalTrial'],
            ['Statement', 'Source']
        ],
        TargetOf: [
            ['Disease', 'Therapy'],
            ['Feature', 'Therapy']
        ]
    };

    for (let name of ['Disease', 'Pathway', 'Pathway', 'Therapy', 'Signature', 'Feature', 'AnatomicalEntity']) {
        edgeRestrictions.AliasOf.push([name, name]);
        edgeRestrictions.DeprecatedBy.push([name, name]);
        edgeRestrictions.SubClassOf.push([name, name]);
        edgeRestrictions.Implies.push([name, 'Statement']);
    }

    for (let name of Object.keys(edgeRestrictions)) {
        if (! schema[name]) {
            throw new Error(`Did not load the expected class: ${name}`);
        }
        schema[name]._edgeRestrictions = edgeRestrictions[name];
        for (let [source, target] of edgeRestrictions[name] || []) {
            if (! schema[source] || ! schema[target]) {
                throw new Error(`Did not load an expected class: ${source}, ${target}`);
            }
        }
    }
    // add the api-level checks?
    let ridProperty = {name: '@rid', type: 'string'};
    for (let modelName of ['User', 'V', 'E', 'UserGroup']) {
        schema[modelName]._properties['@rid'] = ridProperty;
        schema[modelName]._cast['@rid'] = castToRID;
        schema[modelName]._cast.uuid = castUUID;
    }

    schema.Ontology._cast.subsets = item => item.trim().toLowerCase();
    if (schema.E._edgeRestrictions === null) {
        schema.E._edgeRestrictions = [];
    }
    schema.User.cast.uuid = castUUID;

    if (VERBOSE) {
        for (let cls of Object.values(schema)) {
            if (cls.isAbstract) {
                continue;
            }
            console.log(`loaded class: ${cls.name} [${cls.inherits}]`);
        }
    }
    if(VERBOSE) {
        console.log('linking models');
    }
    db.models = schema;
    // not link the different models where appropriate
    for (let model of Object.values(schema)) {
        for (let prop of Object.values(model._properties)) {
            if (prop.linkedClass && schema[prop.linkedClass]) {
                prop.linkedModel = schema[prop.linkedClass];
            }
        }
    }
    // ensure all edge classes are set as such
    for (let model of Object.values(schema)) {
        if (! model.isEdge && model.inherits.includes('E')) {
            model.isEdge = true;
        }
    }
    if (VERBOSE) {
        console.log('schema loading complete');
    }
    return schema;
};


module.exports = {createSchema, loadSchema, ClassModel, FUZZY_CLASSES, INDEX_SEP_CHARS};
