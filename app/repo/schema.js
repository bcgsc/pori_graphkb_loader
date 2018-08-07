/**
 * Repsonsible for defining and loading the database schema.
 * @module app/repo/schema
 */
const orientjs = require('orientjs');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');

const {PERMISSIONS} = require('./constants');
const {
    castUUID, timeStampNow, castToRID, VERBOSE
} = require('./util');
const {AttributeError} = require('./error');


const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];

const INDEX_SEP_CHARS = ' \r\n\t:;,.|+*/\\=!?[]()'; // default separator chars for orientdb full text hash: https://github.com/orientechnologies/orientdb/blob/2.2.x/core/src/main/java/com/orientechnologies/orient/core/index/OIndexFullText.java
const EXPOSE_ALL = {
    QUERY: true, PATCH: true, DELETE: true, POST: true, GET: true
};
const EXPOSE_NONE = {
    QUERY: false, PATCH: false, DELETE: false, POST: false, GET: false
};

const SCHEMA_DEFN = {
    V: {
        expose: EXPOSE_NONE,
        properties: [
            {
                name: '@rid', type: 'string', pattern: '^#\\d+:\\d+$', description: 'The record identifier'
            },
            {name: '@class', type: 'string', description: 'The database class this record belongs to'},
            {
                name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true, description: 'Internal identifier for tracking record history'
            },
            {
                name: 'createdAt', type: 'long', mandatory: true, notNull: true, description: 'The timestamp at which the record was created'
            },
            {name: 'deletedAt', type: 'long', description: 'The timestamp at which the record was deleted'},
            {
                name: 'createdBy', type: 'link', mandatory: true, notNull: true, linkedClass: 'User', description: 'The user who created the record'
            },
            {
                name: 'deletedBy', type: 'link', linkedClass: 'User', notNull: true, description: 'The user who deleted the record'
            },
            {
                name: 'history', type: 'link', notNull: true, description: 'Link to the previous version of this record'
            },
            {name: 'comment', type: 'string'},
            {
                name: 'groupRestrictions', type: 'linkset', linkedClass: 'UserGroup', description: 'user groups allowed to interact with this record'
            }
        ]
    },
    E: {
        expose: EXPOSE_NONE,
        isEdge: true,
        properties: [
            {
                name: '@rid', type: 'string', pattern: '^#\\d+:\\d+$', description: 'The record identifier'
            },
            {name: '@class', type: 'string', description: 'The database class this record belongs to'},
            {
                name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true, description: 'Internal identifier for tracking record history'
            },
            {
                name: 'createdAt', type: 'long', mandatory: true, notNull: true, description: 'The timestamp at which the record was created'
            },
            {name: 'deletedAt', type: 'long', description: 'The timestamp at which the record was deleted'},
            {
                name: 'createdBy', type: 'link', mandatory: true, notNull: true, linkedClass: 'User', description: 'The user who created the record'
            },
            {
                name: 'deletedBy', type: 'link', linkedClass: 'User', notNull: true, description: 'The user who deleted the record'
            },
            {
                name: 'history', type: 'link', notNull: true, description: 'Link to the previous version of this record'
            },
            {name: 'comment', type: 'string'},
            {
                name: 'groupRestrictions', type: 'linkset', linkedClass: 'UserGroup', description: 'user groups allowed to interact with this record'
            }
        ]
    },
    UserGroup: {
        properties: [
            {
                name: '@rid', type: 'string', pattern: '^#\\d+:\\d+$', description: 'The record identifier'
            },
            {name: '@class', type: 'string', description: 'The database class this record belongs to'},
            {
                name: 'name', type: 'string', mandatory: true, notNull: true
            },
            {name: 'permissions', type: 'embedded', linkedClass: 'Permissions'}
        ],
        indices: [
            {
                name: 'ActiveUserGroup',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name'],
                class: 'UserGroup'
            }
        ]
    },
    Permissions: {
        expose: EXPOSE_NONE,
        properties: []
    },
    Evidence: {isAbstract: true},
    Biomarker: {
        isAbstract: true
    },
    User: {
        properties: [
            {
                name: '@rid', type: 'string', pattern: '^#\\d+:\\d+$', description: 'The record identifier'
            },
            {name: '@class', type: 'string', description: 'The database class this record belongs to'},
            {
                name: 'name', type: 'string', mandatory: true, notNull: true, description: 'The username'
            },
            {
                name: 'groups', type: 'linkset', linkedClass: 'UserGroup', description: 'Groups this user belongs to. Defines permissions for the user'
            },
            {
                name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true
            },
            {
                name: 'createdAt', type: 'long', mandatory: true, notNull: true
            },
            {name: 'deletedAt', type: 'long'},
            {name: 'history', type: 'link', notNull: true},
            {
                name: 'createdBy', type: 'link', notNull: true, mandatory: false
            },
            {
                name: 'groupRestrictions', type: 'linkset', linkedClass: 'UserGroup', description: 'user groups allowed to interact with this record'
            }
        ],
        indices: [
            {
                name: 'ActiveUserName',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name', 'deletedAt'],
                class: 'User'
            }
        ]
    },
    Source: {
        inherits: ['Evidence', 'V'],
        properties: [
            {
                name: 'name', type: 'string', mandatory: true, notNull: true, description: 'Name of the evidence or source'
            },
            {name: 'version', type: 'string', description: 'The evidence version'},
            {name: 'url', type: 'string'},
            {name: 'description', type: 'string'},
            {name: 'usage', type: 'string', description: 'Link to the usage/licensing information associated with this evidence'}
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
        expose: {
            QUERY: true, GET: true
        },
        inherits: ['V', 'Biomarker'],
        properties: [
            {
                name: 'source', type: 'link', mandatory: true, notNull: true, linkedClass: 'Source', description: 'Link to the source from which this record is defined'
            },
            {
                name: 'sourceId', type: 'string', mandatory: true, notNull: true, description: 'The identifier of the record/term in the external source database/system'
            },
            {name: 'dependency', type: 'link', description: 'Mainly for alias records. If this term is defined as a part of another term, this should link to the original term'},
            {name: 'name', type: 'string', description: 'Name of the term'},
            {name: 'sourceIdVersion', type: 'string', description: 'The version of the identifier based on the external database/system'},
            {name: 'description', type: 'string'},
            {name: 'longName', type: 'string'},
            {
                name: 'subsets', type: 'embeddedset', linkedType: 'string', description: 'A list of names of subsets this term belongs to'
            },
            {
                name: 'deprecated', type: 'boolean', default: false, notNull: true, mandatory: true, description: 'True when the term was deprecated by the external source'
            },
            {name: 'url', type: 'string'}
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
            {name: 'journalName', type: 'string', description: 'Name of the journal where the article was published'},
            {name: 'year', type: 'integer'}
        ]
    },
    Therapy: {
        inherits: ['Ontology'],
        properties: [
            {name: 'mechanismOfAction', type: 'string'},
            {name: 'molecularFormula', type: 'string'},
            {name: 'iupacName', type: 'string'}
        ]
    },
    Feature: {
        inherits: ['Ontology'],
        properties: [
            {name: 'start', type: 'integer'},
            {name: 'end', type: 'integer'},
            {
                name: 'biotype', type: 'string', mandatory: true, notNull: true, description: 'The biological type of the feature', choices: ['gene', 'protein', 'transcript', 'exon', 'chromosome']
            }
        ]
    },
    Position: {
        properties: [
            {name: '@class', type: 'string', description: 'The database class this record belongs to'}
        ],
        isAbstract: true
    },
    ProteinPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        properties: [
            {
                name: 'pos', type: 'integer', min: 1, mandatory: true
            },
            {name: 'refAA', type: 'string'}
        ]
    },
    CytobandPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        properties: [
            {
                name: 'arm', type: 'string', mandatory: true, notNull: true
            },
            {name: 'majorBand', type: 'integer', min: 1},
            {name: 'minorBand', type: 'integer'}
        ]
    },
    GenomicPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        properties: [{
            name: 'pos', type: 'integer', min: 1, mandatory: true
        }]
    },
    ExonicPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        properties: [{
            name: 'pos', type: 'integer', min: 1, mandatory: true
        }]
    },
    IntronicPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        properties: [{
            name: 'pos', type: 'integer', min: 1, mandatory: true
        }]
    },
    CdsPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        properties: [
            {
                name: 'pos', type: 'integer', min: 1, mandatory: true
            },
            {name: 'offset', type: 'integer'}
        ]
    },
    Variant: {
        expose: {QUERY: true, GET: true},
        inherits: ['V', 'Biomarker'],
        properties: [
            {
                name: 'type', type: 'link', mandatory: true, notNull: true, linkedClass: 'Vocabulary'
            },
            {name: 'zygosity', type: 'string', choices: ['heterozygous', 'homozygous']},
            {name: 'germline', type: 'boolean', description: 'Flag to indicate if the variant is germline (vs somatic)'}
        ],
        isAbstract: true
    },
    PositionalVariant: {
        inherits: ['Variant'],
        properties: [
            {
                name: 'reference1', mandatory: true, type: 'link', linkedClass: 'Feature', notNull: true
            },
            {
                name: 'reference2', type: 'link', linkedClass: 'Feature', notNull: true
            },
            {name: 'break1Start', type: 'embedded', linkedClass: 'Position'},
            {name: 'break1End', type: 'embedded', linkedClass: 'Position'},
            {name: 'break1Repr', type: 'string'},
            {name: 'break2Start', type: 'embedded', linkedClass: 'Position'},
            {name: 'break2End', type: 'embedded', linkedClass: 'Position'},
            {name: 'break2Repr', type: 'string'},
            {name: 'refSeq', type: 'string'},
            {name: 'untemplatedSeq', type: 'string'},
            {name: 'untemplatedSeqSize', type: 'integer'}, // for when we know the number of bases inserted but not what they are
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
                    'reference1',
                    'reference2',
                    'type',
                    'untemplatedSeq',
                    'untemplatedSeqSize',
                    'zygosity',
                    'truncation'
                ],
                class: 'PositionalVariant'
            },
            {
                name: 'PositionalVariant.reference1',
                type: 'NOTUNIQUE_HASH_INDEX',
                metadata: {ignoreNullValues: true},
                properties: [
                    'reference1'
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
            {
                name: 'reference1', mandatory: true, type: 'link', linkedClass: 'Ontology', notNull: true
            },
            {
                name: 'reference2', type: 'link', linkedClass: 'Ontology', notNull: true
            }
        ],
        indices: [
            {
                name: 'CategoryVariant.active',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: [
                    'deletedAt',
                    'germline',
                    'reference1',
                    'reference2',
                    'type',
                    'zygosity'
                ],
                class: 'CategoryVariant'
            },
            {
                name: 'CategoryVariant.reference1',
                type: 'NOTUNIQUE_HASH_INDEX',
                metadata: {ignoreNullValues: true},
                properties: [
                    'reference1'
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
    Statement: {
        expose: {QUERY: true, GET: true}, // will have special post/delete method
        inherits: ['V'],
        properties: [
            {
                name: 'relevance', type: 'link', linkedClass: 'Vocabulary', mandatory: true, notNull: true
            },
            {
                name: 'appliesTo', type: 'link', linkedClass: 'Ontology', mandatory: true, notNull: false
            },
            {name: 'description', type: 'string'},
            {
                name: 'reviewStatus',
                type: 'string',
                choices: ['pending', 'not required', 'passed', 'failed']
            },
            {name: 'reviewedBy', type: 'link', linkedClass: 'User'},
            {name: 'reviewedAt', type: 'long'},
            {name: 'reviewComment', type: 'string'}
        ]
    },
    AnatomicalEntity: {inherits: ['Ontology']},
    Disease: {inherits: ['Ontology']},
    Pathway: {inherits: ['Ontology']},
    Signature: {inherits: ['Ontology']},
    Vocabulary: {inherits: ['Ontology']},
    CatalogueVariant: {inherits: ['Ontology']}
};

// Add the indicies to the ontology subclasses
for (const [name, defn] of Object.entries(SCHEMA_DEFN)) {
    if (!defn.inherits || !defn.inherits.includes('Ontology')) {
        continue;
    }
    if (SCHEMA_DEFN[name].indices === undefined) {
        SCHEMA_DEFN[name].indices = [];
    }
    SCHEMA_DEFN[name].indices.push(...[
        {
            name: `${name}.active`,
            type: 'unique',
            metadata: {ignoreNullValues: false},
            properties: ['source', 'sourceId', 'name', 'deletedAt', 'sourceIdVersion'],
            class: name
        },
        {
            name: `${name}.name`,
            type: 'NOTUNIQUE_HASH_INDEX',
            properties: ['name'],
            class: name
        },
        {
            name: `${name}.sourceId`,
            type: 'NOTUNIQUE_HASH_INDEX',
            properties: ['sourceId'],
            class: name
        },
        {
            name: `${name}.full`,
            type: 'FULLTEXT_HASH_INDEX',
            properties: ['name'],
            class: name,
            metadata: {separatorChars: INDEX_SEP_CHARS}
        }
    ]);
}

// Add the edge classes
for (const name of [
    'AliasOf',
    'Cites',
    'DeprecatedBy',
    'ElementOf',
    'Implies',
    'Infers',
    'OppositeOf',
    'SubClassOf',
    'SupportedBy',
    'TargetOf'
]) {
    const sourceProp = {name: 'source', type: 'link', linkedClass: 'Source'};
    if (!['SupportedBy', 'Implies'].includes(name)) {
        sourceProp.mandatory = true;
        sourceProp.notNull = true;
    }
    let reverseName;
    if (name.endsWith('Of')) {
        reverseName = `Has${name.slice(0, name.length - 2)}`;
    } else if (name === 'SupportedBy') {
        reverseName = 'Supports';
    } else if (name.endsWith('By')) {
        reverseName = `${name.slice(0, name.length - 3)}s`;
    } else if (name === 'Infers') {
        reverseName = 'InferredBy';
    } else {
        reverseName = `${name.slice(0, name.length - 1)}dBy`;
    }
    SCHEMA_DEFN[name] = {
        isEdge: true,
        reverseName,
        inherits: ['E'],
        properties: [
            {name: 'in', type: 'link', description: 'The record ID of the vertex the edge goes into, the target/destination vertex'},
            {name: 'out', type: 'link', description: 'The record ID of the vertex the edge comes from, the source vertex'},
            sourceProp
        ],
        indices: [ // add index on the class so it doesn't apply across classes
            {
                name: `${name}.restrictMultiplicity`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['deletedAt', 'in', 'out', 'source'],
                class: name
            }
        ]
    };
    if (name === 'SupportedBy') {
        SCHEMA_DEFN[name].properties.push({
            name: 'level', type: 'link', linkedClass: 'EvidenceLevel'
        });
    }
}

// Set the name to match the key
// initialize the models
for (const [name, model] of Object.entries(SCHEMA_DEFN)) {
    model.name = name;

    model.expose = Object.assign({}, model.isAbstract
        ? EXPOSE_NONE
        : EXPOSE_ALL, SCHEMA_DEFN[name].expose || {});
    if (model.isEdge) {
        model.expose.PATCH = false; // TODO: re-expose after odb tx fix
    }
}

// Add the permissions properties based on the other classes in the schema
for (const name of Object.keys(SCHEMA_DEFN)) {
    if (name !== 'Permissions') {
        SCHEMA_DEFN.Permissions.properties.push({
            min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', notNull: true, readOnly: false, name
        });
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
     */
    constructor(opt) {
        this.name = opt.name;
        this._cast = opt.cast || {};
        this._defaults = opt.defaults || {};
        this._inherits = opt.inherits || [];
        this._subclasses = opt.subclasses || [];
        this.isEdge = !!opt.isEdge;
        this._edgeRestrictions = opt.edgeRestrictions || null;
        this.reverseName = opt.reverseName;
        this.expose = opt.expose === undefined
            ? true
            : opt.expose;
        if (this._edgeRestrictions) {
            this.isEdge = true;
        }
        this.isAbstract = opt.isAbstract;
        this._properties = opt.properties || {}; // by name

        for (const prop of Object.values(this._properties)) {
            if (/(set|list|bag|map)/.exec(prop.type)) {
                prop.iterable = true;
            } else {
                prop.iterable = false;
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
     * Given the name of a subclass, retrieve the subclass model or throw an error if it is not
     * found
     */
    subClassModel(modelName) {
        for (const subclass of this._subclasses) {
            if (subclass.name === modelName) {
                return subclass;
            }
            try {
                return subclass.subClassModel(modelName);
            } catch (err) {}
        }
        throw new Error(`The subclass (${modelName}) was not found as a subclass of the current model (${this.name})`);
    }

    /**
     * @returns {string[]} a list of property names for all required properties
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
     * @returns {string[]} a list of property names for all optional properties
     */
    get optional() {
        const optional = Array.from(Object.values(this._properties).filter(prop => !prop.mandatory), prop => prop.name);
        for (const parent of this._inherits) {
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
        for (const parent of this._inherits) {
            properties = Object.assign({}, parent.properties, properties);
        }
        return properties;
    }

    get cast() {
        let cast = Object.assign({}, this._cast);
        for (const parent of this._inherits) {
            cast = Object.assign({}, parent.cast, cast);
        }
        return cast;
    }

    get defaults() {
        let defaults = Object.assign({}, this._defaults);
        for (const parent of this._inherits) {
            defaults = Object.assign({}, parent.defaults, defaults);
        }
        return defaults;
    }

    /**
     * returns a partial json representation of the current class model
     */
    toJSON() {
        const json = {
            properties: this.properties,
            inherits: this.inherits,
            edgeRestrictions: this._edgeRestrictions,
            isEdge: !!this.isEdge
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
     * Given some orientjs class object, convert it to the current model. Compare the model to the schema definition expected
     * @param {object} oclass
     * @param {object} schemaDefn the expected schema definition for this model
     * @returns {ClassModel} the parsed class
     */
    static parseOClass(oclass, schemaDefn) {
        const defaults = {};
        const cast = {};
        const properties = {};

        for (const prop of schemaDefn.properties || []) {
            properties[prop.name] = prop;
        }

        const castString = x => x.toString().toLowerCase().trim();
        const castNullableString = x => (x === null
            ? null
            : x.toString().toLowerCase().trim());
        const castNullableLink = (string) => {
            try {
                if (string.toString().toLowerCase() === 'null') {
                    return null;
                }
            } catch (err) {}
            return castToRID(string);
        };
        for (let prop of oclass.properties) {
            prop = _.omit(prop, ['class', 'custom', 'originalName', 'collate']);
            if (prop.name.startsWith('@') && !['@version', '@class', '@rid'].includes(prop.name)) {
                continue;
            }
            // get the property definition from the schema
            let schemaProp;
            for (const sprop of schemaDefn.properties || []) {
                if (sprop.name === prop.name) {
                    schemaProp = sprop;
                    break;
                }
            }
            if (!schemaProp) {
                throw new Error(`failed to find the property ${prop.name} on the schema definition`);
            }
            const dbPropType = orientjs.types[prop.type].toLowerCase();
            if (dbPropType !== schemaProp.type) {
                throw new Error(`The type defined on the schema model (${schemaProp.type}) does not match the type loaded from the database (${dbPropType})`);
            }
            properties[prop.name] = Object.assign(prop, schemaProp);

            if (prop.defaultValue) {
                defaults[prop.name] = () => prop.defaultValue;
            }
            if (prop.type === 'integer') {
                cast[prop.name] = x => parseInt(x, 10);
            } else if (prop.type === 'string') {
                if (prop.notNull) {
                    cast[prop.name] = castString;
                } else {
                    cast[prop.name] = castNullableString;
                }
            } else if (prop.type.includes('link')) {
                if (prop.notNull) {
                    cast[prop.name] = castToRID;
                } else {
                    cast[prop.name] = castNullableLink;
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
            properties,
            defaults,
            cast,
            expose: schemaDefn.expose,
            isAbstract: oclass.defaultClusterId === -1,
            reverseName: schemaDefn.reverseName
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
            for (const attr of Object.keys(this.defaults)) {
                if (record[attr] === undefined) {
                    formattedRecord[attr] = this.defaults[attr]();
                }
            }
        }
        for (const prop of Object.values(properties)) {
            // check that the required attributes are there
            if (prop.mandatory) {
                if (record[prop.name] === undefined && opt.ignoreMissing) {
                    continue;
                }
                if (record[prop.name] !== undefined) {
                    formattedRecord[prop.name] = record[prop.name];
                }
                if (formattedRecord[prop.name] === undefined && !opt.ignoreMissing) {
                    throw new AttributeError(`missing required attribute ${prop.name}`);
                }
                formattedRecord[prop.name] = formattedRecord[prop.name];
            } else if (record[prop.name] !== undefined) {
                // add any optional attributes that were specified
                formattedRecord[prop.name] = record[prop.name];
            }
        }

        // try the casting
        for (const attr of Object.keys(this.cast)) {
            if (formattedRecord[attr] !== undefined && formattedRecord[attr] !== null) {
                try {
                    if (/(bag|set|list|map)/.exec(properties[attr].type)) {
                        formattedRecord[attr].forEach((elem, i) => {
                            formattedRecord[attr][i] = this.cast[attr](elem);
                        });
                    } else {
                        formattedRecord[attr] = this.cast[attr](formattedRecord[attr]);
                    }
                } catch (err) {
                    throw new AttributeError({message: `Failed in casting (${this.cast[attr].name}) attribute (${attr}) with value (${formattedRecord[attr]}): ${err.message}`, castFunc: this.cast[attr]});
                }
            }
        }
        // check the properties with enum values
        for (const [attr, value] of Object.entries(formattedRecord)) {
            if (properties[attr] !== undefined && properties[attr].choices !== undefined) {
                if (properties[attr].notNull === false && value === null) {
                    continue;
                }
                if (!properties[attr].choices.includes(value)) {
                    throw new AttributeError(`Expected controlled vocabulary choices. ${value} is not in the list of valid choices`);
                }
            }
        }
        // look for linked models
        for (let [attr, value] of Object.entries(formattedRecord)) {
            let {linkedModel} = properties[attr];
            if (properties[attr].type === 'embedded' && linkedModel && typeof value === 'object') {
                if (value && value['@class'] && value['@class'] !== linkedModel.name) {
                    linkedModel = linkedModel.subClassModel(value['@class']);
                }
                value = linkedModel.formatRecord(value);
            }
            formattedRecord[attr] = value;
        }
        return formattedRecord;
    }
}

/**
 * creates a class in the database
 *
 * @returns {object} the newly created class
 */
const createClassModel = async (db, schemaModel) => {
    const model = Object.assign({}, schemaModel);
    model.properties = model.properties || [];
    model.indices = model.indices || [];
    model.isAbstract = model.isAbstract || false;
    model.inherits = model.inherits
        ? model.inherits.join(',')
        : null;

    if (model.name === undefined) {
        throw new AttributeError(`required attribute was not defined: clsname=${model.name}`);
    }

    const cls = await db.class.create(model.name, model.inherits, null, model.isAbstract); // create the class first
    await createProperties(cls, model.properties);
    await Promise.all(Array.from(model.indices, i => db.index.create(i)));
    return cls;
};

const createProperties = async (cls, props) => Promise.all(Array.from(
    props.filter(prop => !prop.name.startsWith('@')),
    async prop => cls.property.create(Object.assign({}, prop))
));


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
        for (const prop of curr.properties || []) {
            if (prop.linkedClass) {
                dependencies.push(prop.linkedClass);
            }
        }
        dependencies = dependencies.filter(name => schema[name] !== undefined);

        if (dependencies.length > 0) {
            if (dependencies.some(name => ranks[name] === undefined)) {
                queue.push(curr);
            } else {
                ranks[curr.name] = Math.max(...Array.from(dependencies, name => ranks[name])) + 1;
            }
        } else {
            ranks[curr.name] = 0;
        }
    }
    const split = [];

    for (const [clsName, rank] of Object.entries(ranks)) {
        if (split[rank] === undefined) {
            split[rank] = [];
        }
        split[rank].push(schema[clsName]);
    }
    return split;
};


/**
 * Defines and uilds the schema in the database
 *
 * @param {object} db the orientjs database connection object
 */
const createSchema = async (db) => {
    // create the permissions class
    await createClassModel(db, SCHEMA_DEFN.Permissions); // (name, extends, clusters, abstract)
    // create the user class
    await createClassModel(db, SCHEMA_DEFN.UserGroup);

    await createClassModel(db, SCHEMA_DEFN.User);
    // modify the existing vertex and edge classes to add the minimum required attributes for tracking etc
    const V = await db.class.get('V');
    await createProperties(V, SCHEMA_DEFN.V.properties);
    const E = await db.class.get('E');
    await createProperties(E, SCHEMA_DEFN.E.properties);

    await Promise.all(Array.from(['E', 'V', 'User'], cls => db.index.create({
        name: `${cls}.activeId`,
        type: 'unique',
        metadata: {ignoreNullValues: false},
        properties: ['uuid', 'deletedAt'],
        class: cls
    })));
    if (VERBOSE) {
        console.log('defined schema for the major base classes');
    }
    // create the other schema classes
    const classesByLevel = splitSchemaClassLevels(_.omit(SCHEMA_DEFN, ['Permissions', 'User', 'UserGroup', 'V', 'E']));

    for (const classList of classesByLevel) {
        if (VERBOSE) {
            console.log(`creating the classes: ${Array.from(classList, cls => cls.name).join(', ')}`);
        }
        await Promise.all(Array.from(classList, async cls => createClassModel(db, cls)));
    }

    // create the default user groups
    const adminPermissions = {};
    const regularPermissions = {};
    const readOnlyPermissions = {};

    for (const model of Object.values(SCHEMA_DEFN)) {
        if (!model.isAbstract) {
            adminPermissions[model.name] = PERMISSIONS.ALL;
            if (['Permissions', 'UserGroup', 'User'].includes(model.name)) {
                regularPermissions[model.name] = PERMISSIONS.READ;
            } else {
                regularPermissions[model.name] = PERMISSIONS.ALL;
            }
            readOnlyPermissions[model.name] = PERMISSIONS.READ;
        }
    }
    const defaultGroups = [
        {name: 'admin', permissions: adminPermissions},
        {name: 'regular', permissions: regularPermissions},
        {name: 'readOnly', permissions: readOnlyPermissions}
    ];
    await Promise.all(Array.from(defaultGroups, x => db.insert().into('UserGroup').set(x).one()));

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

    for (const cls of classes) {
        if (/^(O[A-Z]|_)/.exec(cls.name)) { // orientdb builtin classes
            continue;
        }
        const model = ClassModel.parseOClass(cls, SCHEMA_DEFN[cls.name]);
        schema[model.name] = model;
        if (SCHEMA_DEFN[model.name] === undefined) {
            throw new Error(`The class loaded from the database (${model.name}) is not defined in the SCHEMA_DEFN`);
        }
        if (cls.superClass && !SCHEMA_DEFN[model.name].inherits.includes(cls.superClass)) {
            throw new Error(`The class ${model.name} inherits according to the database (${cls.superClass}) does not match those defined by the schema definition: ${SCHEMA_DEFN[model.name].inherits}`);
        }
    }

    for (const model of Object.values(schema)) {
        for (const parentName of SCHEMA_DEFN[model.name].inherits || []) {
            const parentModel = schema[parentName];
            model._inherits.push(parentModel);
            parentModel._subclasses.push(model);
        }
    }

    // defines the source/target classes allowed for each type of edge/relationship
    const edgeRestrictions = {
        AliasOf: [], // auto add all self
        DeprecatedBy: [], // auto add all self
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
        SubClassOf: [], // auto add all self
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

    for (const name of ['Disease', 'Pathway', 'Pathway', 'Therapy', 'Signature', 'Feature', 'AnatomicalEntity']) {
        edgeRestrictions.AliasOf.push([name, name]);
        edgeRestrictions.DeprecatedBy.push([name, name]);
        edgeRestrictions.SubClassOf.push([name, name]);
        edgeRestrictions.Implies.push([name, 'Statement']);
    }

    for (const name of Object.keys(edgeRestrictions)) {
        if (!schema[name]) {
            throw new Error(`Did not load the expected class: ${name}`);
        }
        schema[name]._edgeRestrictions = edgeRestrictions[name];
        for (const [source, target] of edgeRestrictions[name] || []) {
            if (!schema[source] || !schema[target]) {
                throw new Error(`Did not load an expected class: ${source}, ${target}`);
            }
        }
    }
    // add the api-level checks?
    for (const modelName of ['User', 'V', 'E', 'UserGroup']) {
        schema[modelName]._cast['@rid'] = castToRID;
        schema[modelName]._cast.uuid = castUUID;
    }

    schema.Ontology._cast.subsets = item => item.trim().toLowerCase();
    if (schema.E._edgeRestrictions === null) {
        schema.E._edgeRestrictions = [];
    }
    schema.User.cast.uuid = castUUID;

    if (VERBOSE) {
        for (const cls of Object.values(schema)) {
            if (cls.isAbstract) {
                continue;
            }
            console.log(`loaded class: ${cls.name} [${cls.inherits}]`);
        }
    }
    if (VERBOSE) {
        console.log('linking models');
    }
    db.models = schema;
    // not link the different models where appropriate
    for (const model of Object.values(schema)) {
        for (const prop of Object.values(model._properties)) {
            if (prop.linkedClass && schema[prop.linkedClass]) {
                prop.linkedModel = schema[prop.linkedClass];
            }
        }
    }
    // ensure all edge classes are set as such
    for (const model of Object.values(schema)) {
        if (!model.isEdge && model.inherits.includes('E')) {
            model.isEdge = true;
        }
    }
    // set the default record group
    if (VERBOSE) {
        console.log('schema loading complete');
    }
    return schema;
};


module.exports = {
    createSchema,
    loadSchema,
    ClassModel,
    FUZZY_CLASSES,
    INDEX_SEP_CHARS,
    SCHEMA_DEFN,
    splitSchemaClassLevels
};
