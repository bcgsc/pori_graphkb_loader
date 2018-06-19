const {types}  = require('orientjs');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');

const {PERMISSIONS} = require('./constants');
const {createRepoFunctions} = require('./functions');
const {castUUID, timeStampNow, castToRID, VERBOSE} = require('./util');
const cache = require('./cache');
const {populateCache} = require('./base');
const {AttributeError} = require('./error');


const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];

const INDEX_SEP_CHARS = ' \r\n\t:;,.|+*/\\=!?[]()';  // default separator chars for orientdb full text hash: https://github.com/orientechnologies/orientdb/blob/2.2.x/core/src/main/java/com/orientechnologies/orient/core/index/OIndexFullText.java



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
                cast[prop.name] = (x) => x.toLowerCase();
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
        // check any controlled vocabulary
        const name = this.name.toLowerCase();
        if (cache.vocabulary[name]) {
            for (let attr of Object.keys(formattedRecord)) {
                if (cache.vocabulary[name][attr]) {
                    let accepted = false;
                    for (let term of cache.vocabulary[name][attr]) {
                        if (term.term === formattedRecord[attr]) {
                            accepted = true;
                        }
                    }
                    if (! accepted) {
                        throw new AttributeError(`Attribute violates controlled vocabulary stipulation ${formattedRecord[attr]}`);
                    }
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
    model.properties = model.properties || [];
    model.indices = model.indices || [];
    model.isAbstract = model.isAbstract || false;
    model.inherits = model.inherits || null;

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
 * Defines and uilds the schema in the database
 *
 * @param {object} db the orientjs database connection object
 */
const createSchema = async (db) => {
    // create the permissions class
    const Permissions = await db.class.create('Permissions', null, null, false); // (name, extends, clusters, abstract)
    // create the user class
    await createClassModel(db, {
        name: 'UserGroup',
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
    });
    const defaultGroups = [
        {name: 'admin', permissions: {V: PERMISSIONS.ALL, E: PERMISSIONS.ALL, User: PERMISSIONS.ALL, UserGroup: PERMISSIONS.ALL}},
        {name: 'regular', permissions: {V: PERMISSIONS.ALL, E: PERMISSIONS.ALL, User: PERMISSIONS.READ, UserGroup: PERMISSIONS.READ}},
        {name: 'readOnly', permissions: {V: PERMISSIONS.READ, E: PERMISSIONS.READ, User: PERMISSIONS.READ, UserGroup: PERMISSIONS.READ}}
    ];
    const groups = await Promise.all(Array.from(defaultGroups, x => db.insert().into('UserGroup').set(x).one()));
    cache.userGroups = {};
    for (let group of groups) {
        cache.userGroups[group.name] = group;
    }
    await createClassModel(db, {
        name: 'User',
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
    });
    // modify the existing vertex and edge classes to add the minimum required attributes for tracking etc
    const V = await db.class.get('V');
    await createProperties(V, [
        {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
        {name: 'createdAt', type: 'long', mandatory: true, notNull: true},
        {name: 'deletedAt', type: 'long'},
        {name: 'createdBy', type: 'link', mandatory: true, notNull: true,  linkedClass: 'User'},
        {name: 'deletedBy', type: 'link', linkedClass: 'User', notNull: true},
        {name: 'history', type: 'link', notNull: true},
        {name: 'comment', type: 'string'}
    ]);
    const E = await db.class.get('E');
    await createProperties(E, [
        {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
        {name: 'createdAt', type: 'long', mandatory: true, notNull: true},
        {name: 'deletedAt', type: 'long'},
        {name: 'createdBy', type: 'link', mandatory: true, notNull: true,  linkedClass: 'User'},
        {name: 'deletedBy', type: 'link', linkedClass: 'User', notNull: true},
        {name: 'history', type: 'link', notNull: true},
        {name: 'comment', type: 'string'}
    ]);

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

    await db.class.create('Biomarker', null, null, true);  // purely for selection purposes

    // create the evidence classes
    await createClassModel(db, {
        name: 'Evidence',
        inherits: 'V',
        properties: [
            {name: 'url', type: 'string'},
            {name: 'description', type: 'string'}
        ],
        isAbstract: true
    });
    await Promise.all([
        createClassModel(db, {
            name: 'Publication',
            inherits: 'Evidence',
            properties: [
                {name: 'journalName', type: 'string'},
                {name: 'title', type: 'string', mandatory: true, notNull: true},
                {name: 'year', type: 'integer'},
                {name: 'pubmed', type: 'integer'},
                {name: 'pmcid', type: 'string'},
                {name: 'doi', type: 'string'}
            ],
            indices: [
                {
                    name: 'Publication.activeTitle',
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['deletedAt', 'title', 'year'],
                    class: 'Publication'
                }
            ]
        }),
        createClassModel(db, {
            name: 'ClinicalTrial',
            inherits: 'Evidence',
            properties: [
                {name: 'nctID', type: 'string'},
                {name: 'name', type: 'string', mandatory: true, notNull: true},
                {name: 'phase', type: 'string'},
                {name: 'size', type: 'integer'},
                {name: 'startYear', type: 'integer'},
                {name: 'completionYear', type: 'integer'},
                {name: 'country', type: 'string'},
                {name: 'city', type: 'string'}
            ],
            indices: [
                {
                    name: 'ClinicalTrial.activeName',
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['deletedAt', 'name'],
                    class: 'ClinicalTrial'
                }
            ]
        }),
        createClassModel(db, {
            name: 'Statement',
            inherits: 'V',
            properties: [
                {name: 'type', type: 'string', mandatory: true, notNull: true},
                {name: 'subtype', type: 'string'},
                {name: 'relevance', type: 'string'},
                {name: 'reviewBy', type: 'link', linkedClass: 'User', notNull: true},
                {name: 'reviewAt', type: 'long'},
                {name: 'reviewStatus', type: 'string'},
                {name: 'appliesTo', type: 'link', linkedClass: 'Biomarker', notNull: true}
            ]
        }),
        createClassModel(db, {
            name: 'Vocabulary',
            inherits: 'V',
            properties: [
                {name: 'class', type: 'string', mandatory: true, notNull: true},
                {name: 'property', type: 'string', mandatory: true, notNull: true},
                {name: 'term', type: 'string', mandatory: true, notNull: true},
                {name: 'definition', type: 'string'},
                {name: 'conditionalProperty', type: 'string'},
                {name: 'conditionalValue', type: 'string'}
            ],
            indices: [
                {
                    name: 'Vocabulary.activeTerm',
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['deletedAt', 'class', 'property', 'term', 'conditionalProperty', 'conditionalValue'],
                    class:  'Vocabulary'
                }
            ]
        })
    ]);

    if (VERBOSE) {
        console.log('defining schema for Ontology class');
    }
    await createClassModel(db, {
        name: 'Source',
        inherits: 'Evidence',
        properties: [
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'version', type: 'string'}
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
    });
    await createClassModel(db, {
        name: 'Ontology',
        inherits: 'V,Biomarker',
        properties: [
            {name: 'source', type: 'link', mandatory: true, notNull: true, linkedClass: 'Source'},
            {name: 'sourceId', type: 'string', mandatory: true, notNull: true},
            {name: 'name', type: 'string'},
            {name: 'sourceIdVersion', type: 'string'},
            {name: 'description', type: 'string'},
            {name: 'longName', type: 'string'},
            {name: 'subsets', type: 'embeddedset', linkedType: 'string'}
        ],
        indices: [
            {
                name: 'Ontology.active',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['source', 'sourceId', 'name', 'deletedAt', 'sourceIdVersion'],
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
    });
    if (VERBOSE) {
        console.log('defining schema for Ontology subclasses');
    }
    await createClassModel(db, {
        name: 'Therapy',
        inherits: 'Ontology',
        properties: [
            {name: 'mechanismOfAction', type: 'string'}
        ]
    });
     // now create the custom data related classes
    await createClassModel(db, {
        name: 'Feature',
        inherits: 'Ontology',
        properties: [
            {name: 'start', type: 'integer'},
            {name: 'end', type: 'integer'},
            {name: 'biotype', type: 'string', mandatory: true, notNull: true}
        ]
    });
    await Promise.all(Array.from(['MutationSignature', 'Disease', 'Pathway', 'AnatomicalEntity'], (name) => {
        db.class.create(name, 'Ontology', null, false);
    }));

    await db.class.create('Position', null, null, true);
    await createClassModel(db, {
        name: 'GenomicPosition',
        inherits: 'Position',
        properties: [{name: 'pos', type: 'integer', min: 1}]
    });
    await createClassModel(db, {
        name: 'ProteinPosition',
        inherits: 'Position',
        properties: [
            {name: 'pos', type: 'integer', min: 1},
            {name: 'refAA', type: 'string'}
        ]
    });
    await createClassModel(db, {
        name: 'CdsPosition',
        inherits: 'Position',
        properties: [
            {name: 'pos', type: 'integer', min: 1},
            {name: 'offset', type: 'integer'}
        ]
    });
    await createClassModel(db, {
        name: 'ExonicPosition',
        inherits: 'Position',
        properties: [{name: 'pos', type: 'integer', min: 1}]
    });
    await createClassModel(db, {
        name: 'CytobandPosition',
        inherits: 'Position',
        properties: [
            {name: 'arm', type: 'string', mandatory: true, notNull: true},
            {name: 'majorBand', type: 'integer', min: 1},
            {name: 'minorBand', type: 'integer'}
        ]
    });
    await createClassModel(db, {
        name: 'Variant',
        inherits: 'V,Biomarker',
        properties: [
            {name: 'type', mandatory: true, type: 'string', notNull: true},
            {name: 'subtype', type: 'string'},
            {name: 'zygosity', type: 'string'},
            {name: 'germline', type: 'boolean'}
        ],
        isAbstract: true
    });
    await createClassModel(db, {
        name: 'PositionalVariant',
        inherits: 'Variant',
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
    });
    await createClassModel(db, {
        name: 'CategoryVariant',
        inherits: 'Variant',
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
    });
    await createClassModel(db, {
        name: 'OntologyEdge',
        inherits: 'E',
        properties: [
            {name: 'source', type: 'link', mandatory: true, notNull: true, linkedClass: 'Source'}
        ]
    });
    // create all the ontology based edge classes
    await Promise.all(Array.from(['ElementOf', 'SubClassOf', 'DeprecatedBy', 'AliasOf', 'TargetOf'], (name) => {
        if (VERBOSE) {
            console.log(`defining schema for class: ${name}`);
        }
        createClassModel(db, {
            name: name,
            inherits: 'OntologyEdge',
            properties: [
                {name: 'in', type: 'link'},
                {name: 'out', type: 'link'}
            ],
            indices: [ // add index on the class so it doesn't apply across classes
                {
                    name: `${name}.restrictMulti`,
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['deletedAt', 'in', 'out'],
                    class: name
                }
            ]
        });
    }));
    // create all the edge classes
    await Promise.all(Array.from(['Infers', 'SupportedBy', 'Implies', 'Cites'], (name) => {
        if (VERBOSE) {
            console.log(`defining schema for class: ${name}`);
        }
        createClassModel(db, {
            name: name,
            inherits: 'E',
            properties: [
                {name: 'in', type: 'link'},
                {name: 'out', type: 'link'}
            ],
            indices: [
                {
                    name: `${name}.restrictMulti`,
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['deletedAt', 'in', 'out'],
                    class: name
                }
            ]
        });
    }));

    const properties = [];
    for (let name of [
        'AliasOf',
        'AnatomicalEntity',
        'Biomarker',
        'CategoryVariant',
        'Cites',
        'ClinicalTrial',
        'DeprecatedBy',
        'Disease',
        'E',
        'ElementOf',
        'Feature',
        'Implies',
        'Infers',
        'MutationSignature',
        'Ontology',
        'Pathway',
        'PositionalVariant',
        'Publication',
        'Statement',
        'SubClassOf',
        'SupportedBy',
        'Therapy',
        'User',
        'UserGroup',
        'V',
        'Variant'
    ]) {
        properties.push({min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', notNull: true, readOnly: false, name: name});
    }
    await createProperties(Permissions, properties);
    if (VERBOSE) {
        console.log('create the custom server functions');
    }
    // now load the custom functions. MUST be es5 or straight sql
    await createRepoFunctions(db);
};



/**
 * loads the schema from the database and then adds additional checks. returns the object of models
 *
 * @param {object} db the orientjs database connection
 */
const loadSchema = async (db) => {
    // adds checks etc to the schema loaded from the database
    const schema = {};

    const classes = await db.class.list();
    const inheritanceMap = {};

    for (let cls of classes) {
        if (/^(O[A-Z]|_)/.exec(cls.name)) {  // orientdb builtin classes
            continue;
        }
        const model = ClassModel.parseOClass(cls);
        schema[model.name] = model;
        if (cls.superClass) {
            inheritanceMap[model.name] = cls.superClass;
        }
    }

    for (let name of Object.keys(inheritanceMap)) {
        const parent = inheritanceMap[name];
        schema[name]._inherits.push(schema[parent]);
    }
    for (let cls of ['Variant', 'Ontology']) {
        schema[cls]._inherits.push(schema.Biomarker);
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

    // make the ontology base models
    for (let name of ['Disease', 'Pathway', 'Pathway', 'Therapy', 'MutationSignature', 'Feature', 'AnatomicalEntity']) {
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
    for (let modelName of ['User', 'V', 'Vocabulary', 'E', 'UserGroup']) {
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
    if (VERBOSE) {
        console.log('populating the cache');
    }
    // load the vocabulary
    await populateCache(db, schema);
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
