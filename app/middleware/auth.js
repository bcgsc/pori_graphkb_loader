const HTTP_STATUS = require('http-status-codes');
const jwt = require('jsonwebtoken');

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
        const decoded = jwt.verify(token, keys.private);
        req.user = decoded.user;
    } catch (err) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
    }
    // TODO: verify the user against the gsc ACL
    // TODO: then verify the user against the kb list of users
    next();
};

const generateToken = async (user, expires) => {
    return await jwt.sign(user, keys.private, {expiresIn: expires || TOKEN_TIMEOUT});
};

module.exports = {generateToken, checkToken, keys};
