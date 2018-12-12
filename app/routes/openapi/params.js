/**
 * Parameter definitions (components/params) for use in generating the swagger specification
 */
/**
 * @ignore
 */
const {MAX_JUMPS, MAX_QUERY_LIMIT, DEFAULT_QUERY_LIMIT} = require('./constants');

const GENERAL_QUERY_PARAMS = {
    neighbors: {
        in: 'query',
        name: 'neighbors',
        schema: {
            type: 'integer',
            minimum: 0,
            maximum: MAX_JUMPS
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
            maximum: MAX_QUERY_LIMIT
        },
        description: 'Limits the number of records to return (useful for paginating queries)',
        default: DEFAULT_QUERY_LIMIT
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


module.exports = {BASIC_HEADER_PARAMS, GENERAL_QUERY_PARAMS, ONTOLOGY_QUERY_PARAMS};
