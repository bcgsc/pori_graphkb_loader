/**
 * Repsonsible for defining and loading the database schema.
 * @module app/repo/schema
 */
const uuidV4 = require('uuid/v4');
const _ = require('lodash');

const {position} = require('knowledgebase-parser');

const {PERMISSIONS} = require('./constants');
const {logger} = require('./logging');
const {
    Property,
    ClassModel,
    EXPOSE_ALL,
    EXPOSE_NONE
} = require('./model');
const {
    castString,
    castToRID,
    castUUID,
    naturalListJoin,
    timeStampNow
} = require('./util');
const {AttributeError} = require('./error');


const FUZZY_CLASSES = ['AliasOf', 'DeprecatedBy'];

const INDEX_SEP_CHARS = ' \r\n\t:;,.|+*/\\=!?[]()'; // default separator chars for orientdb full text hash: https://github.com/orientechnologies/orientdb/blob/2.2.x/core/src/main/java/com/orientechnologies/orient/core/index/OIndexFullText.java


const trimString = x => x.toString().trim();

/**
 * Given some set of positions, create position object to check they are valid
 * and create the breakpoint representation strings from them that are used for indexing
 */
const generateBreakRepr = (start, end) => {
    if (!start && !end) {
        return undefined;
    }
    if ((start && !start['@class']) || (end && !end['@class'])) {
        throw new AttributeError('positions must include the @class attribute to specify the position type');
    }
    const posClass = start['@class'];
    const repr = position.breakRepr(
        position.PREFIX_CLASS[posClass],
        new position[posClass](start),
        end
            ? new position[posClass](end)
            : null
    );
    return repr;
};


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
                name: 'createdBy', type: 'link'
            },
            {
                name: 'deletedBy', type: 'link', nullable: false
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
                nonEmpty: true,
                description: 'The identifier of the record/term in the external source database/system'
            },
            {
                name: 'dependency',
                type: 'link',
                description: 'Mainly for alias records. If this term is defined as a part of another term, this should link to the original term'
            },
            {name: 'name', description: 'Name of the term', nonEmpty: true},
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
        paraphrase: rec => (rec.name || rec.sourceId).toString().trim(),
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
        embedded: true,
        paraphrase: rec => rec.pos.toString(),
        isAbstract: true
    },
    ProteinPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        embedded: true,
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
        embedded: true,
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
        embedded: true,
        properties: [{
            name: 'pos', type: 'integer', min: 1, mandatory: true
        }]
    },
    ExonicPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        embedded: true,
        properties: [{
            name: 'pos', type: 'integer', min: 1, mandatory: true
        }]
    },
    IntronicPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        embedded: true,
        properties: [{
            name: 'pos', type: 'integer', min: 1, mandatory: true
        }]
    },
    CdsPosition: {
        expose: EXPOSE_NONE,
        inherits: ['Position'],
        embedded: true,
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
            {
                name: 'break1Start', type: 'embedded', linkedClass: 'Position', nullable: false
            },
            {name: 'break1End', type: 'embedded', linkedClass: 'Position'},
            {
                name: 'break1Repr',
                type: 'string',
                generated: true,
                default: record => generateBreakRepr(record.break1Start, record.break1End)
            },
            {name: 'break2Start', type: 'embedded', linkedClass: 'Position'},
            {name: 'break2End', type: 'embedded', linkedClass: 'Position'},
            {
                name: 'break2Repr',
                type: 'string',
                generated: true,
                default: record => generateBreakRepr(record.break1Start, record.break1End)
            },
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
                nullable: true
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
            sourceProp.nullable = false;
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
        if (name !== 'Permissions' && !schema[name].embedded) {
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
            models[parent].subclasses.push(models[model.name]);
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
 * @param {Object.<string,ClassModel>} schema mapping of names to class models
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
 * @param {orientjs.Db} db the orientjs database connection object
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
    logger.log('info', 'defined schema for the major base classes');
    // create the other schema classes
    const classesByLevel = splitSchemaClassLevels(
        _.omit(SCHEMA_DEFN, ['Permissions', 'User', 'UserGroup', 'V', 'E'])
    );

    for (const classList of classesByLevel) {
        logger.log('info', `creating the classes: ${Array.from(classList, cls => cls.name).join(', ')}`);
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
    logger.log('info', 'creating the default user groups');
    const defaultGroups = Array.from([
        {name: 'admin', permissions: adminPermissions},
        {name: 'regular', permissions: regularPermissions},
        {name: 'readOnly', permissions: readOnlyPermissions}
    ], rec => SCHEMA_DEFN.UserGroup.formatRecord(rec, {addDefaults: true}));
    await Promise.all(Array.from(defaultGroups, async x => db.insert().into('UserGroup').set(x).one()));

    logger.log('info', 'Schema is Complete');
};


/**
 * Loads the schema from the database and then adds additional checks. returns the object of models.
 * Checks that the schema loaded from the databases matches the schema defined here
 *
 * @param {orientjs.Db} db the orientjs database connection
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

    for (const cls of Object.values(SCHEMA_DEFN)) {
        if (cls.isAbstract) {
            continue;
        }
        logger.log('verbose', `loaded class: ${cls.name} [${cls.inherits}]`);
    }
    logger.log('verbose', 'linking models');
    db.schema = SCHEMA_DEFN;
    // set the default record group
    logger.log('info', 'schema loading complete');
    return SCHEMA_DEFN;
};


module.exports = {
    createSchema,
    FUZZY_CLASSES,
    INDEX_SEP_CHARS,
    loadSchema,
    SCHEMA_DEFN,
    splitSchemaClassLevels
};
