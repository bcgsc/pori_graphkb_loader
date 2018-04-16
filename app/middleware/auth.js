const HTTP_STATUS = require('http-status-codes');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const NodeRAS = require('node-rsa');

const keys = {};
const TOKEN_TIMEOUT = 120;
/*
 * TODO: authenticate the header token
 * - check that the token is valid/active
 * - check the user is allowed permission to the given endpoint
 */
const checkToken = async (req, res, next) => {
    const token = req.header('Authorization');
    if (token === undefined) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({message: 'did not find authorized token', type: 'PermissionError'});
    }
    try {
        const decoded = jwt.verify(token, keys.key);
        req.user = decoded.user;
    } catch (err) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({message: 'bad token', type: 'PermissionError'});
    }
    next();
};

const generateToken = async (user, expires) => {
    return await jwt.sign(user, keys.key, {expiresIn: expires || TOKEN_TIMEOUT});
};


const readKey = async (keyfile) => {
    try {
        const data = fs.readFileSync(keyfile);
    } catch (err) {
        console.err(`Error in reading the private key file for setting up tokens: ${keyfile}`);
        throw err;
    }
    
};

module.exports = {generateToken, checkToken, keys};
