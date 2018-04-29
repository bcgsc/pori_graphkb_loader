const {types}  = require('orientjs');
const uuidV4 = require('uuid/v4');

const {PERMISSIONS} = require('./constants');
const {createRepoFunctions} = require('./functions');
const {castUUID, timeStampNow} = require('./util');
const cache = require('./cache');
const {select, populateCache} = require('./base');


class ClassModel {

    constructor(opt) {
        this.name = opt.name;
        this._required = opt.required || [];
        this._optional = opt.optional || [];
        this._cast = opt.cast || {};
        this._defaults = opt.defaults || {};
        this._inherits = opt.inherits || [];
        this._edgeRestrictions = opt.edgeRestrictions || null;
        this.isAbstract = opt.isAbstract;
    }

    get isEdge() {
        return this._edgeRestrictions === null ? false : true;
    }

    get inherits() {
        let parents = [];
        for (let model of this._inherits) {
            parents.push(model.name);
            parents.push(...model.inherits);
        }
        return parents;
    }

    get required() {
        let required = [];
        required.push(...this._required);
        for (let parent of this._inherits) {
            required.push(...parent.required);
        }
        return required;
    }

    get optional() {
        let optional = [];
        optional.push(...this._optional);
        for (let parent of this._inherits) {
            optional.push(...parent.optional);
        }
        return optional;
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

    toJSON() {
        return {
            required: this._required,
            optional: this._optional,
            inherits: this.inherits,
            edgeRestrictions: this._edgeRestrictions
        }
    }

    static parseOClass(oclass) {
        const required = [];
        const optional = [];
        const defaults = {};
        const cast = {};
        for (let prop of oclass.properties) {
            if (prop.mandatory) {
                required.push(prop.name);
            } else {
                optional.push(prop.name);
            }
            if (prop.defaultValue) {
                defaults[prop.name] = () => prop.defaultValue;
            }
            if (types[prop.type] === 'Integer') {
                cast[prop.name] = (x) => parseInt(x, 10);
            } else if (types[prop.type] === 'String') {
                cast[prop.name] = (x) => x.toLowerCase();
            }
            if (prop.name === 'uuid') {
                defaults.uuid = uuidV4;
            } else if (prop.name === 'createdAt') {
                defaults.createdAt = timeStampNow;
            }
        }
        return new this({
            name: oclass.name,
            required: required,
            optional: optional,
            defaults: defaults,
            cast: cast,
            isAbstract: oclass.defaultClusterId === -1 ? true : false
        });
    }

    formatRecord(record, opt) {
        // add default options
        opt = Object.assign({
            dropExtra: true,
            addDefaults: false,
            ignoreMissing: false,
            ignoreExtra: false
        }, opt);
        const formattedRecord = Object.assign({}, opt.dropExtra ? {} : record);
        const reqAttr = this.required;
        const optAttr = this.optional;

        if (! opt.ignoreExtra) {
            for (let attr of Object.keys(record)) {
                if (! reqAttr.includes(attr) && ! optAttr.includes(attr)) {
                    throw new Error(`unexpected attribute: ${attr}`);
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
        // check that the required attributes are there
        for (let attr of reqAttr) {
            if (record[attr] === undefined && opt.ignoreMissing) {
                continue;
            }
            if (record[attr] !== undefined) {
                formattedRecord[attr] = record[attr];
            }
            if (formattedRecord[attr] === undefined && ! opt.ignoreMissing) {
                throw Error(`missing required attribute ${attr}`);
            }
            formattedRecord[attr] = formattedRecord[attr];
        }
        // add any optional attributes that were specified
        for (let attr of optAttr) {
            if (record[attr] !== undefined) {
                formattedRecord[attr] = record[attr];
            }
        }
        // try the casting
        for (let attr of Object.keys(this.cast)) {
            if (formattedRecord[attr] != undefined) {
                formattedRecord[attr] = this.cast[attr](formattedRecord[attr]);
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
                        throw Error(`Attribute violates controlled vocabulary stipulation ${formattedRecord[attr]}`);
                    }
                }
            }
        }

        return formattedRecord;
    }
}

/*
 * creates a class in the database
 */
const createClassModel = async (db, model) => {
    model.properties = model.properties || [];
    model.indices = model.indices || [];
    model.isAbstract = model.isAbstract || false;
    model.inherits = model.inherits || null;

    if (model.name === undefined) {
        throw new Error(`required attribute was not defined: clsname=${model.name}`);
    }

    const cls = await db.class.create(model.name, model.inherits, null, model.isAbstract); // create the class first
    await Promise.all(Array.from(model.properties, (prop) => cls.property.create(prop)));
    await Promise.all(Array.from(model.indices, (i) => db.index.create(i)));
    return cls;
}

const createProperties = async (cls, props) => {
    return await Promise.all(Array.from(props, (prop) => cls.property.create(prop)));
}

/*
 * builds the schema in the database
 */
const createSchema = async (db, verbose=false) => {
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
                name: `ActiveUserGroup`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['name'],
                'class':  'UserGroup'
            }
        ]
    });
    const defaultGroups = [
        {name: 'admin', permissions: {V: PERMISSIONS.ALL, E: PERMISSIONS.ALL, User: PERMISSIONS.ALL, UserGroup: PERMISSIONS.ALL}},
        {name: 'readOnly', permissions: {V: PERMISSIONS.READ, E: PERMISSIONS.READ, User: PERMISSIONS.READ, UserGroup: PERMISSIONS.READ}}
    ];
    const groups = await Promise.all(Array.from(defaultGroups, x => db.insert().into('UserGroup').set(x).one() ));
    cache.userGroups = {}
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
            {name: 'history', type: 'link', notNull: true}
        ],
        indices: [
            {
                name: `ActiveUserName`,
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
        {name: 'history', type: 'link', notNull: true}
    ]);
    const E = await db.class.get('E');
    await createProperties(E, [
        {name: 'uuid', type: 'string', mandatory: true, notNull: true, readOnly: true},
        {name: 'createdAt', type: 'long', mandatory: true, notNull: true},
        {name: 'deletedAt', type: 'long'},
        {name: 'createdBy', type: 'link', mandatory: true, notNull: true,  linkedClass: 'User'},
        {name: 'deletedBy', type: 'link', linkedClass: 'User', notNull: true},
        {name: 'history', type: 'link', notNull: true}
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
    if (verbose) {
        console.log(`defined schema for the major base classes`);
    }
    // now create the custom data related classes
    await createClassModel(db, {
        name: 'Feature',
        isAbstract: true,
        properties: [
            {name: 'start', type: 'integer'},
            {name: 'end', type: 'integer'},
            {name: 'biotype', type: 'string', mandatory: true, notNull: true}
        ]
    });
    await db.class.create('Biomarker', null, null, true);  // purely for selection purposes
    if (verbose) {
        console.log(`defining schema for Ontology class`);
    }
    await createClassModel(db, {
        name: 'Ontology',
        inherits: 'V,Biomarker',
        properties: [
            {name: 'source', type: 'string', mandatory: true, type: 'string'},
            {name: 'sourceVersion', type: 'string'},
            {name: 'sourceId', type: 'string'},
            {name: 'name', type: 'string', mandatory: true, notNull: true, type: 'string'},
            {name: 'nameVersion', type: 'string'},
            {name: 'description', type: 'string'},
            {name: 'longName', type: 'string'}
        ],
        indices: [
            {
                name: `Ontology.active`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['source', 'sourceVersion', 'sourceId', 'name', 'deletedAt', 'nameVersion'],
                class:  'Ontology'
            },
            {
                name: 'Ontology.name',
                type: 'NOTUNIQUE_HASH_INDEX',
                properties: ['name'],
                class: 'Ontology'
            }
        ],
        isAbstract: true
    });
    if (verbose) {
        console.log(`defining schema for Ontology subclasses`);
    }
    await Promise.all(Array.from(['MutationSignature', 'Therapy', 'Disease', 'Pathway'], (name) => {
        db.class.create(name, 'Ontology', null, false);
    }));
    await createClassModel(db, {
        name: 'IndependantFeature',
        inherits: 'Ontology,Feature'
    });
    await createClassModel(db, {
        name: 'DependantFeature',
        inherits: 'V,Feature,Biomarker',
        properties: [
            {name: 'source', type: 'string'},
            {name: 'sourceVersion', type: 'string'},
            {name: 'sourceId', type: 'string'},
            {name: 'name', type: 'string', mandatory: true, notNull: true},
            {name: 'nameVersion', type: 'string'},
            {name: 'description', type: 'string'},
            {name: 'longName', type: 'string'},
            {name: 'dependency', type: 'link', linkedClass: 'IndependantFeature', notNull: true}
        ],
        indices: [
            {
                name: `DependantFeature.active`,
                type: 'unique',
                metadata: {ignoreNullValues: false},
                properties: ['source', 'sourceVersion', 'name', 'deletedAt', 'nameVersion', 'dependency'],
                class: 'DependantFeature'
            },
            {
                name: 'DependantFeature.name',
                type: 'NOTUNIQUE_HASH_INDEX',
                properties: ['name'],
                class: 'DependantFeature'
            }
        ]
    });
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
            {name: 'untemplatedSeqSize', type: 'integer'}  // for when we know the number of bases inserted but not what they are
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
                    'zygosity'
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
            }
        ]
    });
    // create the evidence classes
    await createClassModel(db, {
        name: 'Evidence',
        inherits: 'V',
        properties: [
            {name: 'url', type: 'string'},
            {name: 'summary', type: 'string'}
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
            name: 'ExternalSource',
            inherits: 'Evidence',
            properties: [
                {name: 'name', type: 'string', mandatory: true, notNull: true},
                {name: 'version', type: 'string'},
            ],
            indices: [
                {
                    name: 'ExternalSource.activeSource',
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['deletedAt', 'name', 'version'],
                    class: 'ExternalSource'
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
                {name: 'reviewBy', type: 'link', linkedClass: 'User', notNull: true, notNull: true},
                {name: 'reviewAt', type: 'long'},
                {name: 'reviewStatus', type: 'string'},
                {name: 'appliesTo', type: 'link', linkedClass: 'Biomarker', notNull: true, notNull: true}
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
                    name: `Vocabulary.activeTerm`,
                    type: 'unique',
                    metadata: {ignoreNullValues: false},
                    properties: ['deletedAt', 'class', 'property', 'term', 'conditionalProperty', 'conditionalValue'],
                    class:  'Vocabulary'
                }
            ]
        })
    ]);
    // create all the edge classes
    await Promise.all(Array.from(['Infers', 'ElementOf', 'SubClassOf', 'DeprecatedBy', 'AliasOf', 'SupportedBy', 'Implies', 'Cites'], (name) => {
        if (verbose) {
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
        'Biomarker',
        'CategoryVariant',
        'Cites',
        'ClinicalTrial',
        'DependantFeature',
        'DeprecatedBy',
        'Disease',
        'E',
        'ElementOf',
        'ExternalSource',
        'Feature',
        'Implies',
        'IndependantFeature',
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
    if (verbose) {
        console.log('create the custom server functions');
    }
    // now load the custom functions. MUST be es5 or straight sql
    await createRepoFunctions(db);
};



/*
 * loads the schema from the database and then adds additional checks. returns the object of models
 */
const loadSchema = async (db, verbose=false) => {
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
    schema.IndependantFeature._inherits.push(schema.Feature);  // work-around for orientjs not loading all superclasses (only loads the first)
    schema.DependantFeature._inherits.push(schema.Feature);
    for (let cls of ['Variant', 'Ontology', 'DependantFeature']) {
        schema[cls]._inherits.push(schema.Biomarker);
    }

    // defines the source/target classes allowed for each type of edge/relationship
    const edgeRestrictions = {
        AliasOf: [],
        DeprecatedBy: [],
        ElementOf: [
            ['ClinicalTrial', 'Publication'],
            ['Publication', 'ExternalSource'],
            ['ClinicalTrial', 'ExternalSource']
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
        SubClassOf: [],
        SupportedBy: [
            ['Statement', 'Publication'],
            ['Statement', 'ClinicalTrial'],
            ['Statement', 'ExternalSource']
        ]
    };

    // make the ontology base models
    for (let name of ['Disease', 'Pathway', 'Pathway', 'Therapy', 'MutationSignature', 'IndependantFeature', 'DependantFeature']) {
        if (name === 'DependantFeature') {
            edgeRestrictions.ElementOf.push([name, 'IndependantFeature']);
        } else {
            edgeRestrictions.ElementOf.push([name, name]);
        }
        if (name !== 'DependantFeature' && name !== 'IndependantFeature') {
            edgeRestrictions.SubClassOf.push([name, name]);
        }
        edgeRestrictions.AliasOf.push([name, name]);
        edgeRestrictions.DeprecatedBy.push([name, name]);
        edgeRestrictions.Implies.push([name, 'Statement']);
    }

    for (let name of Object.keys(edgeRestrictions)) {
        if (! schema[name]) {
            throw Error(`Did not load the expected class: ${name}`);
        }
        schema[name]._edgeRestrictions = edgeRestrictions[name];
        for (let [source, target] of edgeRestrictions[name] || []) {
            if (! schema[source] || ! schema[target]) {
                throw Error(`Did not load an expected class: ${source}, ${target}`);
            }
        }
    }
    // add the api-level checks?
    schema.V.cast.uuid = castUUID;
    schema.E.cast.uuid = castUUID;
    if (schema.E._edgeRestrictions === null) {
        schema.E._edgeRestrictions = [];
    }
    schema.User.cast.uuid = castUUID;

    if (verbose) {
        for (let cls of Object.values(schema)) {
            if (cls.isAbstract) {
                continue;
            }
            console.log(`loaded class: ${cls.name} [${cls.inherits}]`);
        }
    }
    if (verbose) {
        console.log('populating the cache');
    }
    // load the vocabulary
    await populateCache(db, schema);
    db.models = schema;
    return schema;
};


module.exports = {createSchema, loadSchema, ClassModel};
