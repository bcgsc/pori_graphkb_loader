/**
 * Repsonsible for defining and loading the database schema.
 * @module app/repo/schema
 */
const orientjs = require('orientjs');
const uuidV4 = require('uuid/v4');
const _ = require('lodash');

const {PERMISSIONS} = require('./constants');
const {
    castDecimalInteger,
    castNullableLink,
    castNullableString,
    castString,
    castToRID,
    castUUID,
    naturalListJoin,
    timeStampNow,
    VERBOSE
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
const EXPOSE_EDGE = {
    QUERY: true, PATCH: false, DELETE: true, POST: true, GET: true
};

const trimString = x => x.toString().trim();


const SCHEMA_DEFN = {
    V: {
        expose: EXPOSE_NONE,
        properties: [
            {
                name: '@rid',
                pattern: '^#\\d+:\\d+$',
                description: 'The record identifier',
                cast: castToRID
            },
            {
                name: '@class',
                description: 'The database class this record belongs to',
                cast: trimString
            },
            {
                name: 'uuid',
                type: 'string',
                mandatory: true,
                nullable: false,
                readOnly: true,
                description: 'Internal identifier for tracking record history',
                cast: castUUID,
                default: uuidV4
            },
            {
                name: 'createdAt',
                type: 'long',
                mandatory: true,
                nullable: false,
                description: 'The timestamp at which the record was created',
                default: timeStampNow
            },
            {
                name: 'deletedAt',
                type: 'long',
                description: 'The timestamp at which the record was deleted',
                nullable: false
            },
            {
                name: 'createdBy',
                type: 'link',
                mandatory: true,
                nullable: false,
                linkedClass: 'User',
                description: 'The user who created the record'
            },
            {
                name: 'deletedBy',
                type: 'link',
                linkedClass: 'User',
                nullable: false,
                description: 'The user who deleted the record'
            },
            {
                name: 'history',
                type: 'link',
                nullable: false,
                description: 'Link to the previous version of this record'
            },
            {name: 'comment', type: 'string'},
            {
                name: 'groupRestrictions',
                type: 'linkset',
                linkedClass: 'UserGroup',
                description: 'user groups allowed to interact with this record'
            }
        ]
    },
    E: {
        expose: EXPOSE_NONE,
        isEdge: true,
        properties: [
            {
                name: '@rid',
                pattern: '^#\\d+:\\d+$',
                description: 'The record identifier',
                cast: castToRID
            },
            {
                name: '@class',
                description: 'The database class this record belongs to',
                cast: trimString
            },
            {
                name: 'uuid',
                type: 'string',
                mandatory: true,
                nullable: false,
                readOnly: true,
                description: 'Internal identifier for tracking record history',
                cast: castUUID,
                default: uuidV4
            },
            {
                name: 'createdAt',
                type: 'long',
                mandatory: true,
                nullable: false,
                description: 'The timestamp at which the record was created',
                default: timeStampNow
            },
            {
                name: 'deletedAt',
                type: 'long',
                description: 'The timestamp at which the record was deleted',
                nullable: false
            },
            {
                name: 'createdBy',
                type: 'link',
                mandatory: true,
                nullable: false,
                linkedClass: 'User',
                description: 'The user who created the record'
            },
            {
                name: 'deletedBy',
                type: 'link',
                linkedClass: 'User',
                nullable: false,
                description: 'The user who deleted the record'
            },
            {
                name: 'history',
                type: 'link',
                nullable: false,
                description: 'Link to the previous version of this record'
            },
            {name: 'comment', type: 'string'},
            {
                name: 'groupRestrictions',
                type: 'linkset',
                linkedClass: 'UserGroup',
                description: 'user groups allowed to interact with this record'
            }
        ]
    },
    UserGroup: {
        properties: [
            {
                name: '@rid',
                pattern: '^#\\d+:\\d+$',
                description: 'The record identifier',
                cast: castToRID
            },
            {
                name: '@class',
                description: 'The database class this record belongs to',
                cast: trimString
            },
            {
                name: 'name', mandatory: true, nullable: false, castString
            },
            {
                name: 'uuid',
                type: 'string',
                mandatory: true,
                nullable: false,
                readOnly: true,
                description: 'Internal identifier for tracking record history',
                cast: castUUID,
                default: uuidV4
            },
            {
                name: 'createdAt',
                type: 'long',
                mandatory: true,
                nullable: false,
                description: 'The timestamp at which the record was created',
                default: timeStampNow
            },
            {
                name: 'deletedAt',
                type: 'long',
                description: 'The timestamp at which the record was deleted',
                nullable: false
            },
            {
                name: 'createdBy',
                type: 'link',
                nullable: false,
                description: 'The user who created the record'
            },
            {
                name: 'deletedBy',
                type: 'link',
                nullable: false,
                description: 'The user who deleted the record'
            },
            {
                name: 'history',
                type: 'link',
                nullable: false,
                description: 'Link to the previous version of this record'
            },
            {name: 'permissions', type: 'embedded', linkedClass: 'Permissions'}
        ],
        indices: [
            {
                name: 'ActiveUserGroupName',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name', 'deletedAt'],
                class: 'UserGroup'
            },
            {
                name: 'ActiveUserGroup',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['uuid', 'deletedAt'],
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
                name: '@rid',
                pattern: '^#\\d+:\\d+$',
                description: 'The record identifier',
                cast: castToRID
            },
            {
                name: '@class',
                description: 'The database class this record belongs to',
                cast: trimString
            },
            {
                name: 'name',
                mandatory: true,
                nullable: false,
                description: 'The username'
            },
            {
                name: 'groups',
                type: 'linkset',
                linkedClass: 'UserGroup',
                description: 'Groups this user belongs to. Defines permissions for the user'
            },
            {
                name: 'uuid',
                type: 'string',
                mandatory: true,
                nullable: false,
                readOnly: true,
                description: 'Internal identifier for tracking record history',
                cast: castUUID,
                default: uuidV4
            },
            {
                name: 'createdAt',
                type: 'long',
                mandatory: true,
                nullable: false,
                description: 'The timestamp at which the record was created',
                default: timeStampNow
            },
            {name: 'deletedAt', type: 'long', nullable: false},
            {name: 'history', type: 'link', nullable: false},
            {
                name: 'createdBy', type: 'link', nullable: false, mandatory: false
            },
            {
                name: 'deletedBy', type: 'link', nullable: false, mandatory: false
            },
            {
                name: 'groupRestrictions',
                type: 'linkset',
                linkedClass: 'UserGroup',
                description: 'user groups allowed to interact with this record'
            }
        ],
        indices: [
            {
                name: 'ActiveUserName',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name', 'deletedAt'],
                class: 'User'
            },
            {
                name: 'ActiveUser',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['uuid', 'deletedAt'],
                class: 'User'
            }
        ]
    },
    Source: {
        inherits: ['Evidence', 'V'],
        properties: [
            {
                name: 'name',
                mandatory: true,
                nullable: false,
                description: 'Name of the evidence or source'
            },
            {name: 'version', description: 'The evidence version'},
            {name: 'url', type: 'string'},
            {name: 'description', type: 'string'},
            {
                name: 'usage',
                description: 'Link to the usage/licensing information associated with this evidence'
            }
        ],
        indices: [
            {
                name: 'Source.active',
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name', 'version', 'deletedAt'],
                class: 'Source'
            }
        ],
        paraphrase: rec => rec.name.toString().trim()
    },
    Ontology: {
        expose: {
            QUERY: true, GET: true
        },
        inherits: ['V', 'Biomarker'],
        properties: [
            {
                name: 'source',
                type: 'link',
                mandatory: true,
                nullable: false,
                linkedClass: 'Source',
                description: 'Link to the source from which this record is defined'
            },
            {
                name: 'sourceId',
                mandatory: true,
                nullable: false,
                description: 'The identifier of the record/term in the external source database/system'
            },
            {
                name: 'dependency',
                type: 'link',
                description: 'Mainly for alias records. If this term is defined as a part of another term, this should link to the original term'
            },
            {name: 'name', description: 'Name of the term'},
            {
                name: 'sourceIdVersion',
                description: 'The version of the identifier based on the external database/system'
            },
            {name: 'description', type: 'string'},
            {name: 'longName', type: 'string'},
            {
                name: 'subsets',
                type: 'embeddedset',
                linkedType: 'string',
                description: 'A list of names of subsets this term belongs to',
                cast: item => item.trim().toLowerCase()
            },
            {
                name: 'deprecated',
                type: 'boolean',
                default: false,
                nullable: false,
                mandatory: true,
                description: 'True when the term was deprecated by the external source'
            },
            {name: 'url', type: 'string'}
        ],
        paraphrase: rec => rec.name.toString().trim(),
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
            {
                name: 'journalName',
                description: 'Name of the journal where the article was published'
            },
            {name: 'year', type: 'integer'}
        ],
        paraphrase: rec => `${rec.source}:${rec.sourceId}`
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
                name: 'biotype',
                mandatory: true,
                nullable: false,
                description: 'The biological type of the feature',
                choices: ['gene', 'protein', 'transcript', 'exon', 'chromosome']
            }
        ]
    },
    Position: {
        properties: [
            {
                name: '@class',
                description: 'The database class this record belongs to',
                cast: trimString
            }
        ],
        paraphrase: rec => rec.pos.toString(),
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
                name: 'arm', mandatory: true, nullable: false
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
                name: 'type',
                type: 'link',
                mandatory: true,
                nullable: false,
                linkedClass: 'Vocabulary'
            },
            {name: 'zygosity', choices: ['heterozygous', 'homozygous']},
            {
                name: 'germline',
                type: 'boolean',
                description: 'Flag to indicate if the variant is germline (vs somatic)'
            }
        ],
        isAbstract: true,
        paraphrase: (rec) => {
            let result = `${rec.type} of ${rec.reference1}`;
            if (rec.reference2) {
                result = `${result} and ${rec.reference2}`;
            }
            return result;
        }
    },
    PositionalVariant: {
        inherits: ['Variant'],
        properties: [
            {
                name: 'reference1',
                mandatory: true,
                type: 'link',
                linkedClass: 'Feature',
                nullable: false
            },
            {
                name: 'reference2', type: 'link', linkedClass: 'Feature', nullable: false
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
                name: 'reference1',
                mandatory: true,
                type: 'link',
                linkedClass: 'Ontology',
                nullable: false
            },
            {
                name: 'reference2', type: 'link', linkedClass: 'Ontology', nullable: false
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
        expose: EXPOSE_ALL,
        inherits: ['V'],
        properties: [
            {
                name: 'relevance',
                type: 'link',
                linkedClass: 'Vocabulary',
                mandatory: true,
                nullable: false
            },
            {
                name: 'appliesTo',
                type: 'link',
                linkedClass: 'Ontology',
                mandatory: true,
                notNull: false
            },
            {name: 'description', type: 'string'},
            {
                name: 'reviewStatus',
                type: 'string',
                choices: ['pending', 'not required', 'passed', 'failed']
            },
            {name: 'reviewComment', type: 'string'},
            {
                name: 'sourceId',
                description: 'If the statement is imported from an external source, this is used to track the statement'
            },
            {
                name: 'source',
                description: 'If the statement is imported from an external source, it is linked here',
                linkedClass: 'Source',
                type: 'link'
            }
        ],
        paraphrase: (rec, schema) => {
            const implications = [];
            const support = [];
            for (const edge of rec.in_Implies) {
                const model = schema[edge.out['@class']];
                implications.push(model.paraphraseRecord(edge.out, schema));
            }
            for (const edge of rec.out_SupportedBy) {
                const model = schema[edge.in['@class']];
                support.push(model.paraphraseRecord(edge.in, schema));
            }
            let result = '';
            if (implications.length > 0) {
                result = `Given ${naturalListJoin(implications)}, `;
            }
            result = `${result}${rec.relevance} applies to ${rec.appliesTo}`;
            if (support.length > 0) {
                result = `${result}, which is supported by ${naturalListJoin(support)}`;
            }
            return result;
        }
    },
    AnatomicalEntity: {inherits: ['Ontology']},
    Disease: {inherits: ['Ontology']},
    Pathway: {inherits: ['Ontology']},
    Signature: {inherits: ['Ontology']},
    Vocabulary: {inherits: ['Ontology']},
    CatalogueVariant: {inherits: ['Ontology']}
};


class Property {
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
        this.type = opt.type || 'string';
        this.cast = opt.cast;
        this.description = opt.description;
        this.nullable = opt.nullable === undefined
            ? true
            : !!opt.nullable;
        this.mandatory = opt.mandatory === undefined
            ? false
            : !!opt.mandatory;
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
                    this.cast = castString;
                } else {
                    this.cast = castNullableString;
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
            notNull: !!this.nullable,
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
     */
    constructor(opt) {
        this.name = opt.name;
        this._inherits = opt.inherits || [];
        this._subclasses = opt.subclasses || [];
        this.isEdge = !!opt.isEdge;
        this._edgeRestrictions = opt.edgeRestrictions || null;
        this._paraphrase = opt.paraphrase;
        if (this._edgeRestrictions) {
            this.isEdge = true;
        }
        this.reverseName = opt.reverseName;
        this.isAbstract = !!opt.isAbstract;
        if (this.isAbstract) {
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
        const queue = Array.from(this._subclasses);
        const queryProps = this.properties;
        while (queue.length > 0) {
            const curr = queue.shift();
            for (const prop of Object.values(curr._properties)) {
                if (queryProps[prop.name] === undefined) { // first model to declare is used
                    queryProps[prop.name] = prop;
                }
            }
            queue.push(...curr._subclasses);
        }
        return queryProps;
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
        const optional = Array.from(
            Object.values(this._properties).filter(prop => !prop.mandatory),
            prop => prop.name
        );
        for (const parent of this._inherits) {
            optional.push(...parent.optional);
        }
        return optional;
    }

    get properties() {
        let properties = Object.assign({}, this._properties);
        for (const parent of this._inherits) {
            properties = Object.assign({}, parent.properties, properties);
        }
        return properties;
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
     * Given some orientjs class object, compare the model to the schema definition expected
     * @param {object} oclass
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

        for (const prop of Object.values(properties)) {
            if (opt.addDefaults && record[prop.name] === undefined) {
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
        return formattedRecord;
    }
}


// initialize the schema definition
((schema) => {
    // Add the indicies to the ontology subclasses
    for (const [name, defn] of Object.entries(schema)) {
        if (!defn.inherits || !defn.inherits.includes('Ontology')) {
            continue;
        }
        if (schema[name].indices === undefined) {
            schema[name].indices = [];
        }
        schema[name].indices.push(...[
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
                name: `${name}.nameFull`,
                type: 'FULLTEXT_HASH_INDEX',
                properties: ['name'],
                class: name,
                metadata: {separatorChars: INDEX_SEP_CHARS}
            },
            {
                name: `${name}.sourceIdFull`,
                type: 'FULLTEXT_HASH_INDEX',
                properties: ['sourceId'],
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
        schema[name] = {
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
            schema[name].properties.push(...[
                {name: 'level', type: 'link', linkedClass: 'EvidenceLevel'},
                {name: 'summary', description: 'Generally a quote from the supporting source which describes the pertinent details with resect to the statement it supports'}
            ]);
        }
    }

    // Set the name to match the key
    // initialize the models
    for (const name of Object.keys(schema)) {
        if (name !== 'Permissions') {
            schema.Permissions.properties.push({
                min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', nullable: false, readOnly: false, name
            });
        }
    }
    const models = {};
    for (const [name, model] of Object.entries(schema)) {
        model.name = name;
        const properties = {};
        for (const prop of model.properties || []) {
            properties[prop.name] = new Property(prop);
        }
        models[name] = new ClassModel(Object.assign(
            {properties},
            _.omit(model, ['inherits', 'properties'])
        ));
    }
    // link the inherited models and linked models
    for (const model of Object.values(models)) {
        const defn = schema[model.name];
        for (const parent of defn.inherits || []) {
            if (models[parent] === undefined) {
                throw new Error(`Schema definition error. Expected model ${parent} is not defined`);
            }
            models[model.name]._inherits.push(models[parent]);
            models[parent]._subclasses.push(models[model.name]);
        }
        for (const prop of Object.values(model._properties)) {
            if (prop.linkedClass) {
                if (models[prop.linkedClass] === undefined) {
                    throw new Error(`Schema definition error. Expected model ${prop.linkedClass} is not defined`);
                }
                prop.linkedClass = models[prop.linkedClass];
            }
        }
    }
    Object.assign(SCHEMA_DEFN, models);
})(SCHEMA_DEFN);


/**
 * Split class models into an array or with dependencies
 * will be in an array after the array it depends on
 */
const splitSchemaClassLevels = (schema) => {
    const ranks = {};
    const queue = Object.values(schema);
    while (queue.length > 0) {
        const curr = queue.shift();
        let dependencies = Array.from(curr.inherits || []);
        for (const prop of Object.values(curr.properties)) {
            if (prop.linkedClass) {
                dependencies.push(prop.linkedClass.name);
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
    await SCHEMA_DEFN.Permissions.create(db); // (name, extends, clusters, abstract)
    // create the user class
    await SCHEMA_DEFN.UserGroup.create(db);

    await SCHEMA_DEFN.User.create(db);
    // modify the existing vertex and edge classes to add the minimum required attributes for tracking etc
    const V = await db.class.get('V');
    await Promise.all(Array.from(
        Object.values(SCHEMA_DEFN.V._properties).filter(p => !p.name.startsWith('@')),
        async prop => prop.create(V)
    ));
    const E = await db.class.get('E');
    await Promise.all(Array.from(
        Object.values(SCHEMA_DEFN.E._properties).filter(p => !p.name.startsWith('@')),
        async prop => prop.create(E)
    ));

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
    const classesByLevel = splitSchemaClassLevels(
        _.omit(SCHEMA_DEFN, ['Permissions', 'User', 'UserGroup', 'V', 'E'])
    );

    for (const classList of classesByLevel) {
        if (VERBOSE) {
            console.log(`creating the classes: ${Array.from(classList, cls => cls.name).join(', ')}`);
        }
        await Promise.all(Array.from(classList, async cls => cls.create(db))); // eslint-disable-line no-await-in-loop
    }

    // create the default user groups
    const adminPermissions = {};
    const regularPermissions = {};
    const readOnlyPermissions = {};

    for (const model of Object.values(SCHEMA_DEFN)) {
        // The permissions for operations against a class should be the intersection of the
        // exposed routes and the group type
        const {name} = model;
        const adminGroup = (['Permissions', 'UserGroup', 'User'].includes(model.name));
        adminPermissions[name] = PERMISSIONS.READ;
        regularPermissions[name] = PERMISSIONS.NONE;
        readOnlyPermissions[name] = PERMISSIONS.NONE;

        if (model.expose.QUERY || model.expose.GET) {
            adminPermissions[name] |= PERMISSIONS.READ;
            regularPermissions[name] |= PERMISSIONS.READ;
            readOnlyPermissions[name] |= PERMISSIONS.READ;
        }
        if (model.expose.PATCH || model.expose.UPDATE) {
            adminPermissions[name] |= PERMISSIONS.UPDATE;
            if (!adminGroup) {
                regularPermissions[name] |= PERMISSIONS.UPDATE;
            }
        }
        if (model.expose.POST) {
            adminPermissions[name] |= PERMISSIONS.CREATE;
            if (!adminGroup) {
                regularPermissions[name] |= PERMISSIONS.CREATE;
            }
        }
        if (model.expose.DELETE) {
            adminPermissions[name] |= PERMISSIONS.DELETE;
            if (!adminGroup) {
                regularPermissions[name] |= PERMISSIONS.DELETE;
            }
        }
    }
    if (process.env.VERBOSE === '1') {
        console.log('creating the default user groups');
    }
    const defaultGroups = Array.from([
        {name: 'admin', permissions: adminPermissions},
        {name: 'regular', permissions: regularPermissions},
        {name: 'readOnly', permissions: readOnlyPermissions}
    ], rec => SCHEMA_DEFN.UserGroup.formatRecord(rec, {addDefaults: true}));
    await Promise.all(Array.from(defaultGroups, async x => db.insert().into('UserGroup').set(x).one()));

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
    const classes = await db.class.list();

    for (const cls of classes) {
        if (/^(O[A-Z]|_)/.exec(cls.name)) { // orientdb builtin classes
            continue;
        }
        const model = SCHEMA_DEFN[cls.name];
        if (model === undefined) {
            throw new Error(`The class loaded from the database (${model.name}) is not defined in the SCHEMA_DEFN`);
        }
        model.compareToDbClass(cls); // check that the DB matches the SCHEMA_DEFN
        if (cls.superClass && !model.inherits.includes(cls.superClass)) {
            throw new Error(`The class ${model.name} inherits according to the database (${cls.superClass}) does not match those defined by the schema definition: ${SCHEMA_DEFN[model.name].inherits}`);
        }
    }

    if (VERBOSE) {
        for (const cls of Object.values(SCHEMA_DEFN)) {
            if (cls.isAbstract) {
                continue;
            }
            console.log(`loaded class: ${cls.name} [${cls.inherits}]`);
        }
    }
    if (VERBOSE) {
        console.log('linking models');
    }
    db.schema = SCHEMA_DEFN;
    // set the default record group
    if (VERBOSE) {
        console.log('schema loading complete');
    }
    return SCHEMA_DEFN;
};


module.exports = {
    ClassModel,
    createSchema,
    FUZZY_CLASSES,
    INDEX_SEP_CHARS,
    loadSchema,
    Property,
    SCHEMA_DEFN,
    splitSchemaClassLevels
};
