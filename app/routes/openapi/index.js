/**
 * Generates the openAPI specification for the Graph KB
 */

/**
 * @constant
 * @ignore
 */
const _ = require('lodash');
const fs = require('fs');
const routes = require('./routes');
const responses = require('./responses');
const schemas = require('./schemas');
const {GENERAL_QUERY_PARAMS, BASIC_HEADER_PARAMS, ONTOLOGY_QUERY_PARAMS} = require('./params');
const {
    MAX_QUERY_LIMIT, MAX_JUMPS, ABOUT_FILE, SEARCH_ABOUT, QUERY_ABOUT
} = require('./constants');


const SCHEMA_PREFIX = '#/components/schemas';


const STUB = {
    openapi: '3.0.0',
    info: {
        title: 'GraphKB',
        version: process.env.npm_package_version
    },
    paths: {
        '/statements': {post: routes.POST_STATEMENT},
        '/token': {post: routes.POST_TOKEN},
        '/schema': {get: routes.GET_SCHEMA},
        '/version': {get: routes.GET_VERSION},
        '/search': {get: routes.GET_KEYWORD},
        '/spec': {
            get: {
                summary: 'Returns this specification',
                tags: ['Metadata'],
                responses: {
                    200: {}
                }
            }
        },
        '/stats': {get: routes.GET_STATS}
    },
    components: {
        schemas: Object.assign({
            '@rid': {
                type: 'string',
                pattern: '^#\\d+:\\d+$',
                description: 'Record ID',
                example: '#44:0'
            }
        }, schemas),
        parameters: {
            in: {
                in: 'query',
                name: 'in',
                schema: {$ref: `${SCHEMA_PREFIX}/RID`},
                description: 'The record ID of the vertex the edge goes into, the target/destination vertex'
            },
            out: {
                in: 'query',
                name: 'out',
                schema: {$ref: `${SCHEMA_PREFIX}/RID`},
                description: 'The record ID of the vertex the edge comes from, the source vertex'
            }
        },
        responses
    },
    tags: [
        {name: 'Metadata', description: 'Routes returning data related to the API or DB contents'}
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
                $ref: `${SCHEMA_PREFIX}/@rid`
            },
            {
                $ref: `${SCHEMA_PREFIX}/${model}`
            }
        ]
    };
    if (nullable) {
        param.nullable = true;
    }
    return param;
};


/**
 * Given a class model, generate the swagger documentation for the POST route
 *
 * @param {ClassModel} model the model to build the route for
 * @returns {Object} json representing the openapi spec defn
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
            content: {'application/json': {schema: {$ref: `${SCHEMA_PREFIX}/${model.name}`}}}
        },
        responses: {
            201: {
                description: 'A new record was created',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                result: {$ref: `${SCHEMA_PREFIX}/${model.name}`}
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
 *
 * @param {ClassModel} model the model to build the route for
 * @returns {Object} json representing the openapi spec defn
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
                                    items: {$ref: `${SCHEMA_PREFIX}/${model.name}`}
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
            param.schema.$ref = `${SCHEMA_PREFIX}/RecordList`;
        } else if (isLink) {
            param.schema.$ref = `${SCHEMA_PREFIX}/RecordLink`;
        } else if (prop.name === '@rid') {
            param.schema.$ref = `${SCHEMA_PREFIX}/@rid`;
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
 *
 * @param {ClassModel} model the model to build the route for
 * @returns {Object} json representing the openapi spec defn
 */
const describeOperationByID = (model, operation = 'delete') => {
    const description = {
        summary: `${operation} an existing ${model.name} record`,
        tags: [model.name],
        parameters: _.concat(Array.from(Object.values(BASIC_HEADER_PARAMS), p => ({$ref: `#/components/parameters/${p.name}`})),
            [{
                in: 'path',
                name: 'rid',
                schema: {$ref: `${SCHEMA_PREFIX}/@rid`},
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
                                    $ref: `${SCHEMA_PREFIX}/${model.name}`
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
 * Describe the main search endpoint for complex queries using POST
 */
const describePostSearch = (model) => {
    const body = {
        type: 'object',
        properties: {
            skip: {nullable: true, type: 'integer', min: 0},
            activeOnly: {type: 'boolean', default: true},
            where: {type: 'array', items: {$ref: `${SCHEMA_PREFIX}/Comparison`}},
            returnProperties: {type: 'array', items: {type: 'string'}},
            limit: {type: 'integer', min: 1, max: MAX_QUERY_LIMIT},
            neighbors: {
                type: 'integer',
                min: 0,
                max: MAX_JUMPS,
                description: 'For the final query result, fetch records up to this many links away (warning: may significantly increase query time)'
            }
        }
    };
    const description = {
        summary: `Query ${model.name} records using complex query objects`,
        tags: [model.name],
        parameters: Array.from(Object.values(BASIC_HEADER_PARAMS), p => ({$ref: `#/components/parameters/${p.name}`})),
        requestBody: {
            required: true,
            content: {'application/json': {schema: body}}
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                result: {
                                    type: 'array',
                                    items: {$ref: `${SCHEMA_PREFIX}/${model.name}`}
                                }
                            }
                        }
                    }
                }
            },
            401: {$ref: '#/components/responses/NotAuthorized'},
            400: {$ref: '#/components/responses/BadInput'},
            403: {$ref: '#/components/responses/Forbidden'}
        }
    };
    return description;
};


/**
 * Generates the JSON object that represents the openapi specification for this API
 *
 * @param {Object.<string,ClassModel>} schema the database schema loaded from loadSchema
 * @param {Object} metadata
 * @param {number} metadata.port the port number the API is being served on
 * @param {string} metadata.host the host serving the API
 * @see loadSchema
 *
 * @returns {Object} the JSON object representing the swagger API specification
 */
const generateSwaggerSpec = (schema, metadata) => {
    metadata = Object.assign({port: 8088, host: process.env.HOSTNAME}, metadata);
    const docs = Object.assign({}, STUB);
    docs.servers = [{
        url: `http://${metadata.host}:${metadata.port}/api`
    }];
    docs.components.parameters = Object.assign(
        docs.components.parameters,
        GENERAL_QUERY_PARAMS,
        BASIC_HEADER_PARAMS,
        ONTOLOGY_QUERY_PARAMS
    );
    // Add the MD about section

    const about = Array.from(
        [ABOUT_FILE, QUERY_ABOUT, SEARCH_ABOUT],
        filename => fs.readFileSync(filename).toString()
    ).join('\n\n');
    docs.info.description = about;

    // simple routes
    for (const model of Object.values(schema)) {
        if (model.description) {
            docs.tags.push({name: model.name, description: model.description});
        }
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
            docs.paths[`${model.routeName}/search`] = {post: describePostSearch(model)};
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
        if (model.isAbstract) {
            // should inherit from its concrete subclasses instead
            const oneOf = model.subclasses.map(m => ({$ref: `#/components/schemas/${m.name}`}));
            docs.components.schemas[model.name].oneOf = oneOf;
            continue;
        }
        // for all model properties add a query parameter to the main GET request. Also add to the model components spec
        for (const prop of Object.values(model.properties)) {
            const isList = !!/(list|set)/g.exec(prop.type);
            if (prop.generated) {
                continue;
            }

            if (prop.mandatory && prop.default === undefined && prop.generateDefault === undefined) {
                if (docs.components.schemas[model.name].required === undefined) {
                    docs.components.schemas[model.name].required = [];
                }
                docs.components.schemas[model.name].required.push(prop.name);
            }
            if (docs.components.schemas[prop.name] && model.name !== 'Permissions') {
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
                propDefn.$ref = `${SCHEMA_PREFIX}/RecordLink`;
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
