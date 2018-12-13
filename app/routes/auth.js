const jwt = require('jsonwebtoken');
const jc = require('json-cycle');
const form = require('form-urlencoded').default;
const request = require('request-promise');
const HTTP_STATUS = require('http-status-codes');

const {getUserByName} = require('./../repo/base');
const {logger} = require('./../repo/logging');
const {AuthenticationError, PermissionError} = require('./../repo/error');

const TOKEN_TIMEOUT = 60 * 60 * 8; // default timeout is 8 hours

/**
 * Look up a username in the database and generate a token for this user
 *
 * @param {orientjs.Db} db the database connection object
 * @param {string} username
 * @param {string} key the private key file contents
 * @param exp the expiry time/date
 *
 * @returns {string} the token
 */
const generateToken = async (db, username, key, exp = null) => {
    const user = jc.decycle(await getUserByName(db, username));
    if (exp === null) {
        return jwt.sign({user}, key, {expiresIn: TOKEN_TIMEOUT});
    }
    return jwt.sign({user, exp}, key);
};


/**
 * Given a username and password, authenticate against keycloak and return the token
 *
 * @param {string} username the user name
 * @param {string} password the password
 * @param {object} keycloakSettings
 * @param {string} keycloakSettings.clientID key cloak client id
 * @param {string} keycloakSettings.uri the url to post to, to retrieve the token
 *
 * @returns {string} the token
 */
const fetchKeyCloakToken = async (username, password, keycloakSettings) => {
    const {uri, clientID} = keycloakSettings;
    logger.log('debug', `[POST] ${uri}`);
    const resp = JSON.parse(await request({
        method: 'POST',
        uri,
        body: form({
            client_id: clientID, grant_type: 'password', username, password
        }),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    }));
    return resp;
};

/**
 * Verify the token and ensure the user has the appropriate role to access GraphKB
 *
 * @param {string} token the token to be parsed
 * @param {string} key the public key file contents to use to verify the token
 * @param {string} role the role that should be encoded into the token to allow access
 *
 * @returns {object} the parsed content of the key cloak token
 */
const validateKeyCloakToken = (token, key, role) => {
    let parsed;
    try {
        jwt.verify(token, key, {algorithms: ['RS256']});
        parsed = jwt.decode(token);
    } catch (err) {
        throw new AuthenticationError(err);
    }
    if (parsed.realm_access.roles && parsed.realm_access.roles.includes(role)) {
        return parsed;
    }
    throw new PermissionError(`Insufficient permissions. User must have the role: ${role}`);
};

/**
 * Add the post token route to the input router
 *
 * @param {orientjs.db} db the database connection
 * @param {express.Router} router the router to add the route to
 * @param {object} config
 * @param {string} config.privateKey the key file contents for generating and signing tokens (private key file)
 * @param {object} config.keycloak keycloak configurable settings
 * @param {string} config.keycloak.uri the uri to post to to get a token from keycloak
 * @param {string} config.keycloak.role the required keycloak role
 * @param {string} config.keycloak.clientID the keycloak client ID for the post body in getting tokens
 * @param {string} config.keycloak.publicKey the content of the public key file used for verifying keycloak tokens
 */
const addPostToken = ({router, db, config}) => {
    const {keycloak, privateKey, disableAuth} = config;
    router.route('/token').post(async (req, res) => {
        // generate a token to return to the user
        if ((req.body.username === undefined || req.body.password === undefined) && req.body.keyCloakToken === undefined) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'body requires both username and password to generate a token or an external keycloak token (keyCloakToken)'});
        }
        // passed a token already
        let {keyCloakToken} = req.body;
        if (keyCloakToken === undefined) {
            if (req.body.username === undefined || req.body.password === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'body requires both username and password to generate a token or an external keycloak token (keyCloakToken)'});
            }
            // get the keyCloakToken
            if (!disableAuth) {
                try {
                    keyCloakToken = await fetchKeyCloakToken(req.body.username, req.body.password, keycloak);
                } catch (err) {
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
                }
            }
        }
        // verify the keyCloakToken
        let kcTokenContent;
        if (!disableAuth) {
            try {
                kcTokenContent = validateKeyCloakToken(keyCloakToken, keycloak.publicKey, keycloak.role);
            } catch (err) {
                if (err instanceof PermissionError) {
                    return res.status(HTTP_STATUS.FORBIDDEN).json(err);
                }
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
            }
        } else {
            kcTokenContent = {preferred_username: req.body.username, exp: null};
        }

        // kb-level authentication
        let token;
        try {
            token = await generateToken(db, kcTokenContent.preferred_username, privateKey, kcTokenContent.exp);
        } catch (err) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
        }
        return res.status(HTTP_STATUS.OK).json({kbToken: token, keyCloakToken});
    });
};

module.exports = {addPostToken, generateToken};
