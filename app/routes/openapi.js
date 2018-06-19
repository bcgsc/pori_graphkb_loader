/**
 * Generates the openAPI specification for the Graph KB
 */
'use strict';

const ABOUT = `

Knowlegebase is a curated database of variants in cancer and their therapeutic, biological, diagnostic, and prognostic implications according to literature.
The main use of Knowlegebase is to act as the link between the known and published variant information and the expermientally collected data.
It is used in generation of reports as well as building target sequences for the targeted alignment pipeline.

## Authentication

Authentication is managed via tokens. See the [authentication](.#/Authentication) related routes for more information.

## Dynamic Queries


GET requests on the API support regular query paramters as well as using special query operator syntax. These allow the user to
specify operators beyond \`=\` such as \`!\` (not), \`~\` (substring), and \`|\` (OR).
Note that all the urls shown below have not been escaped.

### Using the NOT Operator

Query all diseases where the name does not equal *'cancer'*

\`\`\`
/api/diseases?name=!cancer
\`\`\`

### Using the Contains Operator

When applied to a string value this will look for a substring. If the attribute being
queried is a list, then it will check if the value is in the list.

Query all diseases where the name contains *'pancreatic'*

\`\`\`
/api/diseases?name=~pancreatic
\`\`\`

### Combining the Contains and NOT Operators

Query all diseases where the name does not contain *'breast'*

\`\`\`
/api/diseases?name=!~breast
\`\`\`

### Using the OR operator

Query all diseases where the name is *'breast cancer'* or *'breast carcinoma'*

\`\`\`
/api/diseases?name=breast cancer|breast carcinoma
\`\`\`

### Combining the OR Operator with the NOT Operator

Query all diseases where the name is *'breast cancer'* or is not *'pancreatic cancer'*

\`\`\`
/api/diseases?name=breast cancer|!pancreatic cancer
\`\`\`

### Using subqueries

Since the KB is a graph database, queries can include conditions on related elements with minimal penalty (does not require a join).
As such KB will support querying on related objects using the following syntax

Query all diseases created by the user with the username *'blargh'*

\`\`\`
/api/diseases?createdBy[name]=blargh
\`\`\`
`;


/**
 * Create a OneOf statement to show that links can be the expanded object or just the @rid
 */
const linkOrModel = (model, nullable=false) => {
    const param = {
        type: 'object',
        oneOf: [
            {
                $ref: '#/components/schemas/RID'
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


const PARAMETERS = {
    in: {
        in: 'query',
        name: 'in',
        schema: {$ref: '#/components/schemas/RID'},
        description: 'the record ID of the vertex the edge goes into, the target/destination vertex'
    },
    out: {
        in: 'query',
        name: 'out',
        schema: {$ref: '#/components/schemas/RID'},
        description: 'the record ID of the vertex the edge comes from, the source vertex'
    },
    neighbors: {
        in: 'query',
        name: 'neighbors',
        schema: {
            type: 'integer',
            minimum: 0,
            maximum: 4
        },
        description: 'return neighbors of the selected node(s) up to \'n\' edges away. If this is set to 0, no neighbors will be returned. To collect all immediate neighbors this must be set to 2.'
    },
    returnProperties: {
        in: 'query',
        name: 'returnProperties',
        schema: {
            type: 'string'
        },
        description: 'csv list of attributes to return. Returns the whole record if not specified'
    },
    limit: {
        in: 'query',
        name: 'limit',
        schema: {
            type: 'integer',
            minimum: 1,
            maximum: 1000
        },
        description: 'limits the number of records to return (useful for paginating queries)',
        default: 100
    },
    skip: {
        in: 'query',
        name: 'skip',
        schema: {
            type: 'integer',
            minimum: 1
        },
        description: 'number of records to skip (useful for paginating queries)'
    },
    fuzzyMatch: {
        in: 'query',
        name: 'fuzzyMatch',
        schema: {
            type: 'integer',
            minimum: 0,
            maximum: 4
        },
        description: 'indicates that aliasof and deprecatedby links should be followed when matching ontology terms to \'n\' degrees away'
    },
    ancestors: {
        in: 'query',
        name: 'ancestors',
        schema: {
            type: 'string'
        },
        description: 'csv list of edge class names for which to get all ancestors (follows ingoing edges) of any matched nodes'
    },
    descendants: {
        in: 'query',
        name: 'descendants',
        schema: {
            type: 'string'
        },
        description: 'csv list of edge class names for which to get all descendants (follows outgoing edges) of any matched nodes'
    },
    Authorization: {
        in: 'header',
        name: 'Authorization',
        schema: {
            type: 'string',
            format: 'token'
        },
        description: 'token containing the user information/authentication'
    },
    sourceId: {
        in: 'query',
        name: 'sourceId',
        schema: {type: 'string'},
        description: 'the identifier of the record/term in the external source database/system'
    },
    sourceIdVersion: {
        in: 'query',
        name: 'sourceIdVersion',
        schema: {type: 'string'},
        description: 'the version of the identifier based on the external database/system'
    },
    history: {
        in: 'query',
        name: 'history',
        description: 'previous version of this record',
        schema: {$ref: '#/components/schemas/RecordLink'}
    },
    deletedBy: {
        in: 'query',
        name: 'deletedBy',
        description: 'the user who deleted the record',
        schema: linkOrModel('User', true)
    },
    deletedAt: {
        in: 'query',
        name: 'deletedAt',
        schema: {type: 'integer'},
        nullable: true,
        description: 'the timestamp when the record was deleted'
    },
    createdAt: {
        in: 'query',
        name: 'createdAt',
        schema: {type: 'integer'},
        nullable: false,
        description: 'the timestamp when the record was created'
    }
};


/**
 * Generates the JSON object that represents the openapi specification for this API
 */
const generateSwaggerSpec = (schema) => {
    const docs = {
        openapi: '3.0.0',
        info: {
            title: 'Graph KB',
            version: '0.0.2',
            description: ABOUT
        },
        servers: [{
            url: 'http://kbapi01:8088/api'
        }],
        paths: {
            '/token': {
                post: {
                    summary: 'Generate an authentication token to be used for requests to the KB API server',
                    tags: ['Authentication'],
                    requestBody: {
                        required: true,
                        content: {'application/json': {schema: {
                            type: 'object',
                            properties: {
                                username: {type: 'string', description: 'the username'},
                                password: {type: 'string', description: 'the password associated with this username'}
                            }
                        }}}
                    },
                    responses: {
                        200: {
                            description: 'The user is valid and a token has been generated',
                            content: {'application/json': {schema:{
                                type: 'object',
                                properties: {
                                    kbToken: {
                                        type: 'string',
                                        format: 'token',
                                        description: 'the token for KB API requests'
                                    },
                                    catsToken: {
                                        type: 'string',
                                        format: 'token',
                                        description: 'the token from CATS'
                                    }
                                }
                            }}}
                        },
                        401: {
                            description: 'The credentials were incorrect or not found'
                        }
                    }
                }
            }
        },
        components: {
            schemas: {
                RID: {
                    type: 'string',
                    pattern: '^#\\d+:\\d+$',
                    description: 'Record ID',
                    example: '#44:0'
                },
                RecordLink: {
                    type: 'object',
                    oneOf: [
                        {
                            $ref: '#/components/schemas/RID'
                        },
                        {
                            type: 'object',
                            properties: {'@rid': {$ref: '#/components/schemas/RID'}}
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
                        message: {type: 'string', description: 'the error message'},
                        name: {type: 'string', description: 'the name of the type of error'},
                        stacktrace: {type: 'string', description: 'optionally the error may include a stack trace to aid in debugging'}
                    }
                }
            },
            parameters: Object.assign({}, PARAMETERS),
            responses: {
                NotAuthorized: {
                    description: 'Authorization failed or insufficient permissions were found',
                    content: {'application/json': {schema: {
                        type: 'object',
                        $ref: '#/components/schemas/Error'
                    }}}
                },
                RecordExistsError: {
                    description: 'The record cannot be created, the record already exists',
                    content: {'application/json': {schema: {
                        type: 'object',
                        $ref: '#/components/schemas/Error',
                        properties: {name: {example: 'RecordExistsError'}}
                    }}}
                },
                BadInput: {
                    description: 'Bad request containts invalid input',
                    content: {'application/json': {schema: {
                        type: 'object',
                        $ref: '#/components/schemas/Error',
                        properties: {name: {example: 'AttributeError'}}
                    }}}
                },
                RecordNotFound: {
                    description: 'The record does not exist',
                    content: {'application/json': {schema: {
                        $ref: '#/components/schemas/Error'
                    }}}
                },
            }
        },
        tags: [
            {name: 'User', description: 'Administrative operations for adding, editing, and removing users'}
        ]
    };
    // simple routes
    for (let model of Object.values(schema)) {

        let specOnly = false;
        if (model.isAbstract || model.name === 'Position' || model.inherits.includes('Position') || ['UserGroup', 'V', 'E', 'Vocabulary', 'Statement', 'Permissions'].includes(model.name)) {
            specOnly = true;
        }
        // create the model in the schemas section
        docs.components.schemas[model.name] = {
            type: 'object',
            properties: {}
        };

        if (! specOnly) {
            docs.paths[model.routeName] = {};
            docs.paths[model.routeName].post = {
                summary: `create a new ${model.name} record`,
                tags: [model.name],
                parameters: [
                    {$ref: '#/components/parameters/Authorization'}
                ],
                requestBody: {
                    required: true,
                    content: {'application/json': {schema: {$ref: `#/components/schemas/${model.name}`}}}
                },
                responses: {
                    201: {
                        description: 'A new record was created',
                        content: {'application/json': {schema: {
                            type: 'object',
                            properties: {
                                result: {$ref: `#/components/schemas/${model.name}`}
                            }
                        }}},
                        links: {
                            getById: {
                                parameters: {rid: '$response.body#/result.@rid'},
                                operationId: `get${model.routeName}__rid_`,
                                description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [GET \`${model.routeName}/{rid}\`](.#/${model.name}/get${model.routeName}__rid_) requests`
                            },
                            patchById: {
                                parameters: {rid: '$response.body#/result.@rid'},
                                operationId: `get${model.routeName}__rid_`,
                                description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [PATCH \`${model.routeName}/{rid}\`](.#/${model.name}/patch${model.routeName}__rid_) requests`
                            },
                            deleteById: {
                                parameters: {rid: '$response.body#/result.@rid'},
                                operationId: `delete${model.routeName}__rid_`,
                                description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [DELETE \`${model.routeName}/{rid}\`](.#/${model.name}/delete${model.routeName}__rid_) requests`
                            }
                        }
                    },
                    401: {$ref: '#/components/responses/NotAuthorized'},
                    400: {$ref: '#/components/responses/BadInput'},
                    409: {$ref: '#/components/responses/RecordExistsError'}
                }
            };
            docs.paths[model.routeName].get = {
                summary: `get a list of ${model.name} records`,
                tags: [model.name],
                parameters: Array.from(['limit', 'fuzzyMatch', 'ancestors', 'descendants', 'skip', 'neighbors', 'returnProperties', 'Authorization'], (p) => {
                    return {$ref: `#/components/parameters/${p}`};
                }),
                responses: {
                    200: {
                        content: {'application/json': {schema: {
                            type: 'object',
                            properties: {result: {
                                type: 'array',
                                items: {$ref: `#/components/schemas/${model.name}`}
                            }}
                        }}},
                        links: {
                            getById: {
                                parameters: {rid: '$response.body#/result[].@rid'},
                                operationId: `get${model.routeName}__rid_`,
                                description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [GET \`${model.routeName}/{rid}\`](.#/${model.name}/get${model.routeName}__rid_) requests`
                            },
                            patchById: {
                                parameters: {rid: '$response.body#/result[].@rid'},
                                operationId: `get${model.routeName}__rid_`,
                                description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [PATCH \`${model.routeName}/{rid}\`](.#/${model.name}/patch${model.routeName}__rid_) requests`
                            },
                            deleteById: {
                                parameters: {rid: '$response.body#/result[].@rid'},
                                operationId: `delete${model.routeName}__rid_`,
                                description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [DELETE \`${model.routeName}/{rid}\`](.#/${model.name}/delete${model.routeName}__rid_) requests`
                            }
                        }
                    },
                    401: {$ref: '#/components/responses/NotAuthorized'},
                    400: {$ref: '#/components/responses/BadInput'}
                }
            };
            docs.paths[`${model.routeName}/{rid}`] = {};
            docs.paths[`${model.routeName}/{rid}`].patch = {
                summary: `update an existing ${model.name} record`,
                tags: [model.name],
                parameters: [
                    {$ref: '#/components/parameters/Authorization'},
                    {
                        in: 'path',
                        name: 'rid',
                        schema: {$ref: '#/components/schemas/RID'},
                        description: 'the record identifier',
                        example: '#34:1'
                    }
                ],
                responses: {
                    200: {content: {'application/json': {schema: {
                        type: 'object',
                        properties: {result: {
                            $ref: `#/components/schemas/${model.name}`
                        }}
                    }}}},
                    401: {$ref: '#/components/responses/NotAuthorized'},
                    400: {$ref: '#/components/responses/BadInput'},
                    404: {$ref: '#/components/responses/RecordNotFound'},
                    409: {$ref: '#/components/responses/RecordExistsError'}
                }
            };
            docs.paths[`${model.routeName}/{rid}`].delete = {
                summary: `delete an existing ${model.name} record`,
                tags: [model.name],
                parameters: [
                    {$ref: '#/components/parameters/Authorization'},
                    {
                        in: 'path',
                        name: 'rid',
                        schema: {$ref: '#/components/schemas/RID'},
                        description: 'the record identifier',
                        example: '#34:1'
                    }
                ],
                responses: {
                    200: {content: {'application/json': {schema: {
                        type: 'object',
                        properties: {result: {
                            $ref: `#/components/schemas/${model.name}`
                        }}
                    }}}},
                    401: {$ref: '#/components/responses/NotAuthorized'},
                    400: {$ref: '#/components/responses/BadInput'},
                    404: {$ref: '#/components/responses/RecordNotFound'},
                }
            };
            docs.paths[`${model.routeName}/{rid}`].get = {
                summary: `get a particular ${model.name} record`,
                tags: [model.name],
                parameters: [
                    {$ref: '#/components/parameters/Authorization'},
                    {$ref: '#/components/parameters/neighbors'},
                    {
                        in: 'path',
                        name: 'rid',
                        schema: {$ref: '#/components/schemas/RID'},
                        description: 'the record identifier',
                        example: '#34:1'
                    }
                ],
                responses: {
                    200: {content: {'application/json': {schema: {
                        type: 'object',
                        properties: {result: {
                            $ref: `#/components/schemas/${model.name}`
                        }}
                    }}}},
                    401: {$ref: '#/components/responses/NotAuthorized'},
                    400: {$ref: '#/components/responses/BadInput'},
                    404: {$ref: '#/components/responses/RecordNotFound'},
                    409: {$ref: '#/components/responses/RecordExistsError'}
                }
            };
        }
        for (let prop of Object.values(model.properties)) {
            const isList = /(list|set)/g.exec(prop.type) ? true : false;
            const isLink = prop.type.includes('link') ? true : false;

            if (! specOnly) {
                if (docs.components.parameters[prop.name] !== undefined) {
                    docs.paths[model.routeName].get.parameters.push({$ref: `#/components/parameters/${prop.name}`});
                } else {
                    const param = {
                        name: prop.name,
                        in: 'query',
                        schema: {}
                    };
                    docs.paths[model.routeName].get.parameters.push(param);
                    if (isLink && isList) {
                        param.schema.$ref = '#/components/schemas/RecordList';
                    } else if (isLink) {
                        param.schema.$ref = '#/components/schemas/RecordLink';
                    } else {
                        param.schema.type = prop.type;
                    }
                }
            }
            if (prop.mandatory && !model.defaults[prop.name] && (!['deletedBy', 'createdBy'].includes(prop.name))) {
                if (docs.components.schemas[model.name].required === undefined) {
                    docs.components.schemas[model.name].required = [];
                }
                docs.components.schemas[model.name].required.push(prop.name);
            }
            let propDefn = {};
            docs.components.schemas[model.name].properties[prop.name] = propDefn;

            if (/(list|set)/g.exec(prop.type)) {
                propDefn.type = 'array';
                propDefn.items = {};
                propDefn = propDefn.items;
            }
            if (prop.name === 'subsets') {
                propDefn.type = 'string';
            } else if (prop.linkedModel) {
                if (prop.type.includes('embedded')) {
                    propDefn.$ref = `#/components/schemas/${prop.linkedModel.name}`;
                } else {
                    Object.assign(propDefn, linkOrModel(prop.linkedModel.name));
                }
            } else if (prop.type.includes('link')) {
                propDefn.$ref = '#/components/schemas/RID';
            } else {
                propDefn.type = prop.type === 'long' ? 'integer' : prop.type;
            }
        }
    }
    return docs;
};

module.exports = {generateSwaggerSpec};