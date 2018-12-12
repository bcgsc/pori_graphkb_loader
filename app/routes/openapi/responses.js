/**
 * Reuseable response (components/responses) definitions for generating the swagger specification
 */
/**
 * @ignore
 */
const Forbidden = {
    description: 'The current user does not have the required permissions to access this content',
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
                properties: {name: {example: 'PermissionError'}}
            }
        }
    }
};
const NotAuthorized = {
    description: 'Authorization failed or insufficient permissions were found',
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error'
            }
        }
    }
};
const RecordExistsError = {
    description: 'The record cannot be created, the record already exists',
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
                properties: {name: {example: 'RecordExistsError'}}
            }
        }
    }
};
const BadInput = {
    description: 'Bad request contains invalid input',
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
                properties: {name: {example: 'AttributeError'}}
            }
        }
    }
};

const RecordNotFound = {
    description: 'The record does not exist',
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error'
            }
        }
    }
};

module.exports = {
    Forbidden, NotAuthorized, RecordExistsError, BadInput, RecordNotFound
};
