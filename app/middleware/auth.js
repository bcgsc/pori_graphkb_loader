/**
 * Module resposible for authentication and authroization related middleware functions
 */
/**
 * @ignore
 */
const HTTP_STATUS = require('http-status-codes');
const jwt = require('jsonwebtoken');
const jc = require('json-cycle');
const request = require('request-promise');
const moment = require('moment');

const {constants: {PERMISSIONS}} = require('@bcgsc/knowledgebase-schema');

const {AuthenticationError, PermissionError} = require('./../repo/error');
const {getUserByName} = require('./../repo/base');

const keys = {};
const SERVICE_NAME = 'kb';
const CATS_URI = process.env.KB_CATS_URI || 'https://cats01.bcgsc.ca:8000/api/1.0/authentication';
const TOKEN_TIMEOUT = 60 * 60 * 8; // default timeout is 8 hours


/**
 * Retrieve a token from the central authentication server (CATS) which is used to verify the
 * username and password exist in our ldap system
 * @param {string} username
 * @param {string} password
 */
const catsToken = async (username, password) => {
    try {
        const response = await request({
            uri: CATS_URI,
            method: 'POST',
            body: {username, password, service: SERVICE_NAME},
            json: true,
            headers: {
                'Content-type': 'application/json',
                Accept: 'application/json'
            }
        });
        if (response === undefined) { // happens with ldap timeout error
            throw new AuthenticationError('no body was returned');
        }
        // check if the token has expired
        const cats = jwt.decode(response.message);
        if (moment().unix() >= cats.exp) {
            throw new jwt.TokenExpiredError({message: 'token has expired', exp: cats.exp});
        }
        return {token: response.message, user: cats.user, exp: cats.exp};
    } catch (err) {
        throw new AuthenticationError(err.response || err);
    }
};

/**
 * Look up a username in the database and generate a token for this user
 *
 * @param {orientjs.Db} db the database connection object
 * @param {string} username
 * @param exp the expiry time/date
 */
const generateToken = async (db, username, exp = null) => {
    const user = jc.decycle(await getUserByName(db, username));
    if (exp === null) {
        return jwt.sign({user}, keys.private, {expiresIn: TOKEN_TIMEOUT});
    }
    return jwt.sign({user, exp}, keys.private);
};

/*
 * checks that the token is valid/active
 */
const checkToken = async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
    const token = req.header('Authorization');
    if (token === undefined) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({message: 'did not find authorized token', name: 'PermissionError'});
    }
    try {
        const decoded = jwt.verify(token, keys.private);
        req.user = decoded.user; // eslint-disable-line no-param-reassign
        return next();
    } catch (err) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
    }
};


/**
 * Check that the user has permissions for the intended operation on a given route
 * Note that to do this, model and user need to already be assigned to the request
 */
const checkClassPermissions = async (req, res, next) => {
    const {model, user} = req;
    let operation = req.method;
    if (req.url.endsWith('/search')) {
        operation = 'GET';
    }
    const mapping = {
        GET: PERMISSIONS.READ,
        UPDATE: PERMISSIONS.UPDATE,
        DELETE: PERMISSIONS.DELETE,
        POST: PERMISSIONS.CREATE,
        PATCH: PERMISSIONS.UPDATE
    };
    for (const group of user.groups) {
        // Default to no permissions
        const permissions = group.permissions[model.name] === undefined
            ? PERMISSIONS.NONE
            : group.permissions[model.name];
        if (mapping[operation] & permissions) {
            return next();
        }
    }
    return res.status(HTTP_STATUS.FORBIDDEN).json(new PermissionError(
        `The user ${user.name} does not have sufficient permissions to perform a ${operation} operation on class ${model.name}`
    ));
};

module.exports = {
    generateToken, checkToken, keys, catsToken, checkClassPermissions
};
