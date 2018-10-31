const POST_STATEMENT = {
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
};


const POST_TOKEN = {
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
};


const GET_SCHEMA = {
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
};


const GET_STATS = {
    summary: 'Returns counts for all non-abstract database classes',
    tags: ['Metadata'],
    parameters: [
        {$ref: '#/components/parameters/Accept'},
        {$ref: '#/components/parameters/Authorization'},
        {
            in: 'query',
            name: 'grouping',
            schema: {type: 'string', enum: ['source']},
            description: 'Additional attribute to group by'
        }
    ],
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            result: {
                                type: 'object',
                                additionalProperties: {
                                    type: 'integer',
                                    description: 'The number of records in this grouping (usually just by class)'
                                }
                            }
                        },
                        example: {
                            result: {
                                UserGroup: 17,
                                Permissions: 0,
                                User: 8,
                                Source: 11,
                                EvidenceLevel: 9,
                                ClinicalTrial: 0,
                                Publication: 3347,
                                Therapy: 69382,
                                Feature: 97496,
                                ProteinPosition: 0,
                                CytobandPosition: 0,
                                GenomicPosition: 0,
                                ExonicPosition: 0,
                                IntronicPosition: 0,
                                CdsPosition: 0,
                                PositionalVariant: 3234,
                                CategoryVariant: 545,
                                Statement: 7677,
                                AnatomicalEntity: 25613,
                                Disease: 41569,
                                Pathway: 0,
                                Signature: 0,
                                Vocabulary: 163,
                                CatalogueVariant: 0,
                                AliasOf: 142363,
                                Cites: 0,
                                DeprecatedBy: 15673,
                                ElementOf: 22,
                                Implies: 7957,
                                Infers: 0,
                                OppositeOf: 15,
                                SubClassOf: 66691,
                                SupportedBy: 17582,
                                TargetOf: 0
                            }
                        }
                    }
                }
            }
        },
        401: {$ref: '#/components/responses/NotAuthorized'},
        400: {$ref: '#/components/responses/BadInput'}
    }
};


const POST_PARSE_VARIANT = {
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
};

module.exports = {
    POST_STATEMENT, POST_TOKEN, GET_SCHEMA, GET_STATS, POST_PARSE_VARIANT
};
