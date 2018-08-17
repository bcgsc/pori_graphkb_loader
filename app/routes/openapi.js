/**
 * Generates the openAPI specification for the Graph KB
 * @module app/routes/openapi
 */


const _ = require('lodash');

const ABOUT = `

Knowlegebase is a curated database of variants in cancer and their therapeutic, biological, diagnostic, and prognostic implications according to literature.
The main use of Knowlegebase is to act as the link between the known and published variant information and the expermientally collected data.
It is used in generation of reports as well as building target sequences for the targeted alignment pipeline.

## Authentication

Authentication is managed via tokens. See the [authentication](.#/Authentication) related routes for more information.

## Dynamic Queries

### Comparison Operators

GET requests on the API support regular query paramters as well as using special query operator syntax. These allow the user to
specify operators beyond \`=\` such as \`!\` (not), \`~\` (substring), and \`|\` (OR).
Note that all the urls shown below have not been escaped.

#### Using the NOT Operator

Query all diseases where the name does not equal *'cancer'*

\`\`\`
/api/<version>/diseases?name=!cancer
\`\`\`

#### Using the Contains Operator

When applied to a string value this will look for a substring, specifically prefixes or full words. This will not apply to suffixes.

Query all diseases where the name contains *'pancreatic'*

\`\`\`
/api/<version>/diseases?name=~pancreatic
\`\`\`

It is worth noting that when the contains operator is applied to fields using a full text index (i.e. ontology names) that the
query will check for starting prefixes and may not find substrings which are in the middle of a word.

#### Combining the Contains and NOT Operators

Query all diseases where the name does not contain *'breast'*

\`\`\`
/api/<version>/diseases?name=!~breast
\`\`\`

#### Using the OR operator

Query all diseases where the name is *'breast cancer'* or *'breast carcinoma'*

\`\`\`
/api/<version>/diseases?name=breast cancer|breast carcinoma
\`\`\`

#### Combining the OR Operator with the NOT Operator

Query all diseases where the name is *'breast cancer'* or is not *'pancreatic cancer'*

\`\`\`
/api/<version>/diseases?name=breast cancer|!pancreatic cancer
\`\`\`

### Using Subqueries

Since the KB is a graph database, queries can include conditions on related elements with minimal penalty (does not require a join).
As such KB will support querying on related objects using the following syntax

Query all diseases created by the user with the username *'blargh'*

\`\`\`
/api/<version>/diseases?createdBy[name]=blargh
\`\`\`

### Query by Related Edges

It can be useful to query a class based on its related vertices rather than its immeadiate properties.
For example, a user might be interested in all statements that are related to disease 'pancreatic cancer'

\`\`\`
/api/<version>/statements?implies[v][name]=pancreatic cancer&implies[v][fuzzyMatch]=3
\`\`\`

The above will match all statements implied by pancreatic cancer or any of its aliased/deprecated terms.

A simpler query can also allow the user to query based on the immediate edge properties.

\`\`\`
/api/<version>/statements?supportedBy[level][name]=4a
\`\`\`

The above would return all statments supported by evidence with an evidence level of 4a

### Query Using Special Query Parameters

#### Neighbors

The \`neighbors\` query parameter can be used to retrieve related records after a selection statement.
For example if you wish to expand all links on a given record, this can be done as below

\`\`\`
/api/<version>/diseases?neighbors=1
\`\`\`

#### OR properties

The \`or\` query parameter can be used to set a top-level OR. For example, querying diseases by sourceId
OR by name could be done in a single query using this query parameter

\`\`\`
/api/<version>/diseases?sourceId=blargh&name=blargh&or=sourceId,name
\`\`\`

`;

const STUB = {
    openapi: '3.0.0',
    info: {
        title: 'Graph KB',
        version: process.env.npm_package_version,
        description: ABOUT
    },
    paths: {
        '/parser/variant': {
            post: {
                summary: 'Given a variant description, check the formatting and return the parsed result where possible',
                tags: ['Parser'],
                parameters: [
                    {$ref: '#/components/parameters/Content-Type'},
                    {$ref: '#/components/parameters/Accept'}
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    content: {type: 'string', description: 'the variant description'}
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'The variant is valid and has been parsed',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    $ref: '#/components/schemas/PositionalVariant'
                                }
                            }
                        }
                    },
                    400: {
                        $ref: '#/components/responses/BadInput'
                    }
                }
            }
        },
        '/statements': {
            post: {
                summary: 'Add a new statement',
                tags: ['Statement'],
                parameters: [
                    {$ref: '#/components/parameters/Content-Type'},
                    {$ref: '#/components/parameters/Accept'},
                    {$ref: '#/components/parameters/Authorization'}
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                allOf: [{$ref: '#/components/schemas/Statement'}],
                                type: 'object',
                                required: ['impliedBy', 'appliesTo', 'relevance', 'supportedBy'],
                                properties: {
                                    impliedBy: {
                                        type: 'array',
                                        items: {$ref: '#/components/schemas/PutativeEdge'},
                                        description: 'A list of putative edges to be created'
                                    },
                                    supportedBy: {
                                        type: 'array',
                                        items: {$ref: '#/components/schemas/PutativeEdge'},
                                        description: 'A list of putative edges to be created'
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: {
                        description: 'A new record was created',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        result: {$ref: '#/components/schemas/Statement'}
                                    }
                                }
                            }
                        },
                        links: {
                            getById: {
                                parameters: {rid: '$response.body#/result.@rid'},
                                operationId: 'get_statements__rid_',
                                description: 'The `@rid` value returned in the response can be used as the `rid` parameter in [GET `/statements/{rid}`](.#/Statement/get_statements__rid_) requests'
                            },
                            patchById: {
                                parameters: {rid: '$response.body#/result.@rid'},
                                operationId: 'patch_statements__rid_',
                                description: 'The `@rid` value returned in the resnse can be used as the `rid` parameter in [PATCH `/statements/{rid}`](.#/Statement/patch_statements__rid_) requests'
                            },
                            deleteById: {
                                parameters: {rid: '$response.body#/result.@rid'},
                                operationId: 'delete_statements__rid_',
                                description: 'The `@rid` value returned in the response can be used as the `rid` parameter in [DELETE `/statements/{rid}`](.#/Statement/delete_statements__rid_) requests'
                            }
                        }
                    },
                    401: {$ref: '#/components/responses/NotAuthorized'},
                    400: {$ref: '#/components/responses/BadInput'},
                    409: {$ref: '#/components/responses/RecordExistsError'},
                    403: {$ref: '#/components/responses/Forbidden'}
                }
            }
        },
        '/token': {
            post: {
                summary: 'Generate an authentication token to be used for requests to the KB API server',
                tags: ['Authentication'],
                parameters: [
                    {$ref: '#/components/parameters/Content-Type'},
                    {$ref: '#/components/parameters/Accept'}
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: {type: 'string', description: 'The username'},
                                    password: {type: 'string', description: 'The password associated with this username'}
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'The user is valid and a token has been generated',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        kbToken: {
                                            type: 'string',
                                            format: 'token',
                                            description: 'The token for KB API requests'
                                        },
                                        catsToken: {
                                            type: 'string',
                                            format: 'token',
                                            description: 'The token from CATS'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    401: {
                        description: 'The credentials were incorrect or not found'
                    }
                }
            }
        },
        '/schema': {
            get: {
                summary: 'Returns a JSON representation of the current database schema',
                tags: ['Metadata'],
                parameters: [
                    {$ref: '#/components/parameters/Accept'}
                ],
                responses: {
                    200: {
                        content: {'application/json': {schema: {type: 'object'}}}
                    }
                }
            }
        },
        '/spec': {
            get: {
                summary: 'Returns this specification',
                tags: ['Metadata'],
                responses: {
                    200: {}
                }
            }
        }
    },
    components: {
        schemas: {
            '@rid': {
                type: 'string',
                pattern: '^#\\d+:\\d+$',
                description: 'Record ID',
                example: '#44:0'
            },
            PutativeEdge: {
                type: 'object',
                properties: {
                    target: {$ref: '#/components/schemas/@rid'}
                },
                additionalProperties: true,
                required: ['target'],
                description: 'An edge to be created',
                example: {target: '#41:2'}
            },
            dependency: {
                $ref: '#/components/schemas/RecordLink',
                nullable: true,
                description: 'For an ontology term, a dependency is defined if the information defining the term was collected as a side-effect of creating another term.'
            },
            deprecated: {
                type: 'boolean',
                description: 'For an ontology term, indicates that according to the source, the current term is deprecated',
                nullable: false,
                default: false
            },
            source: {
                $ref: '#/components/schemas/SourceLink',
                description: 'The link to the source which is responsible for contributing this ontology term'
            },
            SourceLink: {
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
            },
            EdgeList: {
                description: 'A mapping of record IDs to objects representing additional edge attributes'
            },
            RecordLink: {
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
            },
            UserLink: {
                description: 'A direct link to user record. Can be the record ID of the linked user record in the form of a string or the record itself',
                oneOf: [
                    {
                        $ref: '#/components/schemas/@rid'
                    },
                    {
                        $ref: '#/components/schemas/User'
                    }
                ]
            },
            OntologyLink: {
                description: 'A direct link to ontology term record. Can be the record ID of the linked ontology record in the form of a string or the record itself',
                oneOf: [
                    {
                        $ref: '#/components/schemas/@rid'
                    },
                    {
                        $ref: '#/components/schemas/Ontology'
                    }
                ]
            },
            VocabularyLink: {
                description: 'A direct link to vocabulary term record. Can be the record ID of the linked vocabulary record in the form of a string or the record itself',
                oneOf: [
                    {
                        $ref: '#/components/schemas/@rid'
                    },
                    {
                        $ref: '#/components/schemas/vocabulary'
                    }
                ]
            },
            FeatureLink: {
                description: 'A direct link to feature record. Can be the record ID of the linked feature record in the form of a string or the record itself',
                oneOf: [
                    {
                        $ref: '#/components/schemas/@rid'
                    },
                    {
                        $ref: '#/components/schemas/Feature'
                    }
                ]
            },
            RecordList: {
                type: 'array',
                description: 'A list of record IDs',
                items: {$ref: '#/components/schemas/RecordLink'}
            },
            Error: {
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
            }
        },
        parameters: {
            sourceId: {
                in: 'query',
                name: 'sourceId',
                schema: {type: 'string'},
                description: 'The identifier of the record/term in the external source database/system'
            },
            sourceIdVersion: {
                in: 'query',
                name: 'sourceIdVersion',
                schema: {type: 'string'},
                description: 'The version of the identifier based on the external database/system'
            },
            in: {
                in: 'query',
                name: 'in',
                schema: {$ref: '#/components/schemas/RID'},
                description: 'The record ID of the vertex the edge goes into, the target/destination vertex'
            },
            out: {
                in: 'query',
                name: 'out',
                schema: {$ref: '#/components/schemas/RID'},
                description: 'The record ID of the vertex the edge comes from, the source vertex'
            }
        },
        responses: {
            Forbidden: {
                description: 'The current user does not have the required permissions to access this content',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error',
                            properties: {name: {example: 'PermissionError'}}
                        }
                    }
                }
            },
            NotAuthorized: {
                description: 'Authorization failed or insufficient permissions were found',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error'
                        }
                    }
                }
            },
            RecordExistsError: {
                description: 'The record cannot be created, the record already exists',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error',
                            properties: {name: {example: 'RecordExistsError'}}
                        }
                    }
                }
            },
            BadInput: {
                description: 'Bad request contains invalid input',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error',
                            properties: {name: {example: 'AttributeError'}}
                        }
                    }
                }
            },
            RecordNotFound: {
                description: 'The record does not exist',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error'
                        }
                    }
                }
            }
        }
    },
    tags: [
        {name: 'User', description: 'Administrative operations for adding, editing, and removing users'}
    ]
};


/**
 * Create a OneOf statement to show that links can be the expanded object or just the @rid
 *
 * @param {string} model the model/table name
 * @param {boolean} nullable indicates if the value can be null
 *
 * @returns {object} the swagger parameter schema description
 */
const linkOrModel = (model, nullable = false) => {
    const param = {
        type: 'object',
        oneOf: [
            {
                $ref: '#/components/schemas/@rid'
            },
            {
                $ref: `#/components/schemas/${model}`
            }
        ]
    };
    if (nullable) {
        param.nullable = true;
    }
    return param;
};


const GENERAL_QUERY_PARAMS = {
    neighbors: {
        in: 'query',
        name: 'neighbors',
        schema: {
            type: 'integer',
            minimum: 0,
            maximum: 4
        },
        description: 'Return neighbors of the selected node(s) up to \'n\' edges away. If this is set to 0, no neighbors will be returned. To collect all immediate neighbors this must be set to 2.'
    },
    activeOnly: {
        in: 'query',
        name: 'activeOnly',
        schema: {
            type: 'boolean',
            default: true
        },
        description: 'Limit the query to active records only (records that have not been deleted)'
    },
    returnProperties: {
        in: 'query',
        name: 'returnProperties',
        schema: {
            type: 'string'
        },
        description: 'CSV list of attributes to return. Returns the whole record if not specified'
    },
    limit: {
        in: 'query',
        name: 'limit',
        schema: {
            type: 'integer',
            minimum: 1,
            maximum: 1000
        },
        description: 'Limits the number of records to return (useful for paginating queries)',
        default: 100
    },
    skip: {
        in: 'query',
        name: 'skip',
        schema: {
            type: 'integer',
            minimum: 1
        },
        description: 'Number of records to skip (useful for paginating queries)'
    },
    deletedAt: {
        in: 'query',
        name: 'deletedAt',
        schema: {type: 'integer'},
        nullable: true,
        description: 'The timestamp when the record was deleted'
    },
    createdAt: {
        in: 'query',
        name: 'createdAt',
        schema: {type: 'integer'},
        nullable: false,
        description: 'The timestamp when the record was created'
    },
    or: {
        in: 'query',
        name: 'or',
        schema: {type: 'string'},
        nullable: false,
        description: 'CSV list of class properties which should be joined as an OR statment instead of the default AND'
    }
};


const ONTOLOGY_QUERY_PARAMS = {
    subsets: {
        in: 'query',
        name: 'subsets',
        schema: {
            type: 'string'
        },
        description: 'Check if an ontology term belongs to a given subset'
    },
    fuzzyMatch: {
        in: 'query',
        name: 'fuzzyMatch',
        schema: {
            type: 'integer',
            minimum: 0,
            maximum: 4
        },
        description: 'Indicates that aliasof and deprecatedby links should be followed when matching ontology terms to \'n\' degrees away'
    },
    ancestors: {
        in: 'query',
        name: 'ancestors',
        schema: {
            type: 'string'
        },
        description: 'CSV list of edge class names for which to get all ancestors (follows ingoing edges) of any matched nodes'
    },
    descendants: {
        in: 'query',
        name: 'descendants',
        schema: {
            type: 'string'
        },
        description: 'CSV list of edge class names for which to get all descendants (follows outgoing edges) of any matched nodes'
    }
};


const BASIC_HEADER_PARAMS = {
    Authorization: {
        in: 'header',
        name: 'Authorization',
        schema: {
            type: 'string',
            format: 'token'
        },
        required: true,
        description: 'Token containing the user information/authentication'
    },
    Accept: {
        in: 'header',
        name: 'Accept',
        schema: {
            type: 'string',
            enum: ['application/json']
        },
        required: true,
        description: 'The content type you expect to recieve. Currently only supports application/json'
    },
    'Content-Type': {
        in: 'header',
        name: 'Content-Type',
        schema: {
            type: 'string',
            enum: ['application/json']
        },
        required: true,
        description: 'The content type you expect to send. Currently only supports application/json'
    }
};


/**
 * Given a class model, generate the swagger documentation for the POST route
 */
const describePost = (model) => {
    const links = {};
    if (model.expose.GET) {
        links.getById = {
            parameters: {rid: '$response.body#/result.@rid'},
            operationId: `get_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [GET \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/get_${
                model.routeName.slice(1)
            }__rid_) requests`
        };
    }
    if (model.expose.PATCH) {
        links.patchById = {
            parameters: {rid: '$response.body#/result.@rid'},
            operationId: `patch_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [PATCH \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/patch_${
                model.routeName.slice(1)
            }__rid_) requests`
        };
    }
    if (model.expose.DELETE) {
        links.deleteById = {
            parameters: {rid: '$response.body#/result.@rid'},
            operationId: `delete_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [DELETE \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/delete_${
                model.routeName.slice(1)
            }__rid_) requests`
        };
    }
    const post = {
        summary: `create a new ${model.name} record`,
        tags: [model.name],
        parameters: Array.from(Object.values(BASIC_HEADER_PARAMS), p => ({$ref: `#/components/parameters/${p.name}`})),
        requestBody: {
            required: true,
            content: {'application/json': {schema: {$ref: `#/components/schemas/${model.name}`}}}
        },
        responses: {
            201: {
                description: 'A new record was created',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                result: {$ref: `#/components/schemas/${model.name}`}
                            }
                        }
                    }
                },
                links
            },
            401: {$ref: '#/components/responses/NotAuthorized'},
            400: {$ref: '#/components/responses/BadInput'},
            409: {$ref: '#/components/responses/RecordExistsError'},
            403: {$ref: '#/components/responses/Forbidden'}
        }
    };
    return post;
};

/**
 * Given a class model, generate the swagger documentation for the GET route
 */
const describeGet = (model) => {
    const get = {
        summary: `get a list of ${model.name} records`,
        tags: [model.name],
        parameters: Array.from(_.concat(
            model.inherits.includes('Ontology') || model.name === 'Ontology'
                ? Object.values(ONTOLOGY_QUERY_PARAMS)
                : [],
            Object.values(GENERAL_QUERY_PARAMS),
            Object.values(BASIC_HEADER_PARAMS)
        ), p => ({$ref: `#/components/parameters/${p.name}`})),
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                result: {
                                    type: 'array',
                                    items: {$ref: `#/components/schemas/${model.name}`}
                                }
                            }
                        }
                    }
                },
                links: {}
            },
            401: {$ref: '#/components/responses/NotAuthorized'},
            400: {$ref: '#/components/responses/BadInput'},
            403: {$ref: '#/components/responses/Forbidden'}
        }
    };

    if (model.expose.GET) {
        get.responses[200].links.getById = {
            parameters: {rid: '$response.body#/result[].@rid'},
            operationId: `get_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [GET \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/get_${
                model.routeName.slice(1)
            }__rid_) requests`
        };
    }
    if (model.expose.PATCH) {
        get.responses[200].links.patchById = {
            parameters: {rid: '$response.body#/result[].@rid'},
            operationId: `patch_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [PATCH \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/patch_${
                model.routeName.slice(1)
            }__rid_) requests`
        };
    }
    if (model.expose.DELETE) {
        get.responses[200].links.deleteById = {
            parameters: {rid: '$response.body#/result[].@rid'},
            operationId: `delete_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [DELETE \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/delete_${
                model.routeName.slice(1)
            }__rid_) requests`
        };
    }

    for (const prop of Object.values(model.properties)) {
        const isList = !!/(list|set)/g.exec(prop.type);
        const isLink = !!prop.type.includes('link');

        const param = {
            name: prop.name,
            in: 'query',
            schema: {}
        };
        if (prop.description) {
            param.description = prop.description;
        }
        get.parameters.push(param);
        if (isLink && isList) {
            param.schema.$ref = '#/components/schemas/RecordList';
        } else if (isLink) {
            param.schema.$ref = '#/components/schemas/RecordLink';
        } else if (prop.name === '@rid') {
            param.schema.$ref = '#/components/schemas/@rid';
        } else {
            param.schema.type = prop.type;
        }
        if (prop.choices) {
            param.schema.enum = prop.choices;
        }
    }

    return get;
};

/**
 * Given a class model, generate the swagger documentation for the OPERATION/:id route where
 * OPERATION can be delete, patch, etc.
 */
const describeOperationByID = (model, operation = 'delete') => {
    const description = {
        summary: `${operation} an existing ${model.name} record`,
        tags: [model.name],
        parameters: _.concat(Array.from(Object.values(BASIC_HEADER_PARAMS), p => ({$ref: `#/components/parameters/${p.name}`})),
            [{
                in: 'path',
                name: 'rid',
                schema: {$ref: '#/components/schemas/@rid'},
                description: 'The record identifier',
                example: '#34:1',
                required: true
            }]),
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                result: {
                                    $ref: `#/components/schemas/${model.name}`
                                }
                            }
                        }
                    }
                }
            },
            401: {$ref: '#/components/responses/NotAuthorized'},
            400: {$ref: '#/components/responses/BadInput'},
            404: {$ref: '#/components/responses/RecordNotFound'},
            403: {$ref: '#/components/responses/Forbidden'}
        }
    };
    if (operation !== 'delete') {
        description.responses[409] = {$ref: '#/components/responses/RecordExistsError'};
    }
    if (operation === 'get') {
        description.parameters.push({$ref: '#/components/parameters/neighbors'});
    }
    return description;
};


/**
 * Generates the JSON object that represents the openapi specification for this API
 *
 * @param {object} schema the database schema loaded from loadSchema
 * @see loadSchema
 *
 * @returns {object} the JSON object representing the swagger API specification
 */
const generateSwaggerSpec = (schema, metadata) => {
    metadata = Object.assign({port: 8088, host: process.env.HOSTNAME}, metadata);
    const docs = Object.assign({}, STUB);
    docs.servers = [{
        url: `http://${metadata.host}:${metadata.port}/api/v${process.env.npm_package_version}`
    }];
    docs.components.parameters = Object.assign(
        docs.components.parameters,
        GENERAL_QUERY_PARAMS,
        BASIC_HEADER_PARAMS,
        ONTOLOGY_QUERY_PARAMS
    );

    // simple routes
    for (const model of Object.values(schema)) {
        // create the model in the schemas section
        docs.components.schemas[model.name] = {
            type: 'object',
            properties: {}
        };

        if (Object.values(model.expose).some(x => x) && docs.paths[model.routeName] === undefined) {
            docs.paths[model.routeName] = {};
        }
        if (model.expose.QUERY && !docs.paths[model.routeName].get) {
            docs.paths[model.routeName].get = describeGet(model);
        }
        if (model.expose.POST && !docs.paths[model.routeName].post) {
            docs.paths[model.routeName].post = describePost(model);
        }
        if (model.expose.GET || model.expose.PATCH || model.expose.DELETE) {
            if (!docs.paths[`${model.routeName}/{rid}`]) {
                docs.paths[`${model.routeName}/{rid}`] = {};
            }
            if (model.expose.PATCH && !docs.paths[`${model.routeName}/{rid}`].patch) {
                docs.paths[`${model.routeName}/{rid}`].patch = describeOperationByID(model, 'patch');
            }
            if (model.expose.DELETE && !docs.paths[`${model.routeName}/{rid}`].delete) {
                docs.paths[`${model.routeName}/{rid}`].delete = describeOperationByID(model, 'delete');
            }
            if (model.expose.GET && !docs.paths[`${model.routeName}/{rid}`].get) {
                docs.paths[`${model.routeName}/{rid}`].get = describeOperationByID(model, 'get');
            }
        }
        // for all model properties add a query parameter to the main GET request. Also add to the model components spec
        for (const prop of Object.values(model.properties)) {
            const isList = !!/(list|set)/g.exec(prop.type);

            if (prop.mandatory && prop.default === undefined && prop.generateDefault === undefined) {
                if (docs.components.schemas[model.name].required === undefined) {
                    docs.components.schemas[model.name].required = [];
                }
                docs.components.schemas[model.name].required.push(prop.name);
            }
            if (docs.components.schemas[prop.name]) {
                docs.components.schemas[model.name].properties[prop.name] = {$ref: `#/components/schemas/${prop.name}`};
                continue;
            }
            let propDefn = {};
            docs.components.schemas[model.name].properties[prop.name] = propDefn;

            if (isList) {
                propDefn.type = 'array';
                propDefn.items = {};
                propDefn = propDefn.items;
            }
            if (prop.name === 'subsets') {
                propDefn.type = 'string';
            } else if (prop.linkedClass) {
                if (prop.type.includes('embedded')) {
                    propDefn.$ref = `#/components/schemas/${prop.linkedClass.name}`;
                } else if (docs.components.schemas[`${prop.linkedClass.name}Link`]) {
                    propDefn.$ref = `#/components/schemas/${prop.linkedClass.name}Link`;
                } else {
                    Object.assign(propDefn, linkOrModel(prop.linkedClass.name));
                }
            } else if (prop.type.includes('link')) {
                propDefn.$ref = '#/components/schemas/RecordLink';
                propDefn.description = docs.components.schemas.RecordLink.description;
            } else {
                propDefn.type = prop.type === 'long'
                    ? 'integer'
                    : prop.type;
            }
            if (prop.choices) {
                propDefn.enum = prop.choices;
            }
        }
    }
    // sort the route parameters, first by required and then alpha numerically
    for (const route of Object.keys(docs.paths)) {
        for (const defn of Object.values(docs.paths[route])) {
            if (!defn.parameters) {
                continue;
            }
            defn.parameters.sort((p1, p2) => {
                if (p1.$ref) {
                    let pname = p1.$ref.split('/');
                    pname = pname[pname.length - 1];
                    p1 = Object.assign({}, docs.components.parameters[pname], p1);
                }
                if (p2.$ref) {
                    let pname = p2.$ref.split('/');
                    pname = pname[pname.length - 1];
                    p2 = Object.assign({}, docs.components.parameters[pname], p2);
                }
                if (p1.required && !p2.required) {
                    return -1;
                } if (!p1.required && p2.required) {
                    return 1;
                } if (p1.name < p2.name) {
                    return -1;
                } if (p1.name > p2.name) {
                    return 1;
                }
                return 0;
            });
        }
    }
    return docs;
};

module.exports = {generateSwaggerSpec};
