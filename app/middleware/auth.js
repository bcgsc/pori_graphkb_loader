const HTTP_STATUS = require('http-status-codes');
const jwt = require('jsonwebtoken');
const request = require('request-promise');
const moment = require('moment');
const {AuthenticationError} = require('./../repo/error');
const {getUserByName} = require('./../repo/base');

const keys = {};
const SERVICE_NAME = 'kb';
const CATS_URI = 'https://cats01.bcgsc.ca:8001/api/1.0/authentication' || process.env.KB_CATS_URI;
const TOKEN_TIMEOUT = 60 * 60 * 8;  // default timeout is 8 hours


/**
 * Retrieve a token from the central authentication server (CATS) which is used to verify the username and password exist in our ldap system
 */
const catsToken = async (username, password) => {
    try {
        const response = await request({
            uri: CATS_URI,
            method: 'POST',
            body: {username: username, password: password, service: SERVICE_NAME},
            json: true,
            headers: {
                'Content-type': 'application/json',
                'Accept': 'application/json'
            }
        });
        if (response === undefined) {  // happens with ldap timeout error
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
 */
const generateToken = async (db, username, exp) => {
    const user = await getUserByName(db, username);
    if (exp == undefined) {
        return await jwt.sign({user}, keys.private, {expiresIn: TOKEN_TIMEOUT});
    } else {
        return await jwt.sign({user, exp}, keys.private);
    }
};

/*
 * TODO: authenticate the header token
 * - check that the token is valid/active
 * - check the user is allowed permission to the given endpoint
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
        req.user = decoded.user;
        return next();
    } catch (err) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
    }
};


module.exports = {generateToken, checkToken, keys, catsToken};
