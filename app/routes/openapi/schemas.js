
const PutativeEdge = {
    type: 'object',
    properties: {
        target: {$ref: '#/components/schemas/@rid'}
    },
    additionalProperties: true,
    required: ['target'],
    description: 'An edge to be created',
    example: {target: '#41:2'}
};

const dependency = {
    $ref: '#/components/schemas/RecordLink',
    nullable: true,
    description: 'For an ontology term, a dependency is defined if the information defining the term was collected as a side-effect of creating another term.'
};

const deprecated = {
    type: 'boolean',
    description: 'For an ontology term, indicates that according to the source, the current term is deprecated',
    nullable: false,
    default: false
};

const source = {
    $ref: '#/components/schemas/SourceLink',
    description: 'The link to the source which is responsible for contributing this ontology term'
};

const SourceLink = {
    description: 'A direct link to source record. Can be the record ID of the linked source record in the form of a string or the record itself',
    oneOf: [
        {
            $ref: '#/components/schemas/@rid'
        },
        {
            type: 'object',
            $ref: '#/components/schemas/Source'
        }
    ]
};

const EdgeList = {
    description: 'A mapping of record IDs to objects representing additional edge attributes'
};

const RecordLink = {
    description: 'A direct link to another record. Can be the record ID of the linked record in the form of a string or the record itself',
    oneOf: [
        {
            $ref: '#/components/schemas/@rid'
        },
        {
            type: 'object',
            properties: {'@rid': {$ref: '#/components/schemas/@rid'}},
            additionalProperties: true
        }
    ]
};

const UserLink = {
    description: 'A direct link to user record. Can be the record ID of the linked user record in the form of a string or the record itself',
    oneOf: [
        {
            $ref: '#/components/schemas/@rid'
        },
        {
            $ref: '#/components/schemas/User'
        }
    ]
};

const OntologyLink = {
    description: 'A direct link to ontology term record. Can be the record ID of the linked ontology record in the form of a string or the record itself',
    oneOf: [
        {
            $ref: '#/components/schemas/@rid'
        },
        {
            $ref: '#/components/schemas/Ontology'
        }
    ]
};

const VocabularyLink = {
    description: 'A direct link to vocabulary term record. Can be the record ID of the linked vocabulary record in the form of a string or the record itself',
    oneOf: [
        {
            $ref: '#/components/schemas/@rid'
        },
        {
            $ref: '#/components/schemas/vocabulary'
        }
    ]
};

const FeatureLink = {
    description: 'A direct link to feature record. Can be the record ID of the linked feature record in the form of a string or the record itself',
    oneOf: [
        {
            $ref: '#/components/schemas/@rid'
        },
        {
            $ref: '#/components/schemas/Feature'
        }
    ]
};

const RecordList = {
    type: 'array',
    description: 'A list of record IDs',
    items: {$ref: '#/components/schemas/RecordLink'}
};

const Error = {
    type: 'object',
    properties: {
        message: {type: 'string', description: 'The error message'},
        name: {type: 'string', description: 'The name of the type of error'},
        stacktrace: {
            type: 'array',
            description: 'Optionally, the error may include a stack trace to aid in debugging',
            items: {type: 'string'}
        }
    }
};

module.exports = {
    dependency,
    deprecated,
    EdgeList,
    Error,
    FeatureLink,
    OntologyLink,
    PutativeEdge,
    RecordLink,
    RecordList,
    source,
    SourceLink,
    UserLink,
    VocabularyLink
};
