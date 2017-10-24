const jc = require('json-cycle');
const {ErrorMixin, NoResultFoundError} = require('./../repo/error.js');
const HTTP_STATUS = require('http-status-codes');
var uuidValidate = require('uuid-validate');


class QueryParameterError extends ErrorMixin {};


const validateQueryParams = (inputParams, allowedParams, allowNone=false) => {
    return new Promise((resolve, reject) => {
        if (Object.keys(inputParams).length == 0 && ! allowNone) {
            throw new QueryParameterError('no parameters were specified');
        } else {
            for (let key of Object.keys(inputParams)) {
                if (allowedParams.indexOf(key) < 0) {
                    throw new QueryParameterError(`invalid parameter '${key}' is not allowed. Allow parameters include: ${allowedParams}`);
                }
            }
        }
        resolve();
    });
};

const add_routes = (router, repo) => {
    // Other route groups could go here, in the future
    console.log('add_routes');
    router.route('/')
        .get((req, res, next) => {
            res.send('welcome to the knowledgebase api');
        });
	/**
	 * @swagger
     * /match:
     *     post:
     *       summary:
     *         parses an event expression and matches the result against the entire database
     *       parameters:
     *         - in: query
     *           name: minMatchLevel
     *           type: integer
     *           description: the level of match to return
     *           default: 0
     *         - in: query
     *           name: followDepreceatedFeatures
     *           type: boolean
     *           description: will check the deprecated features and not just name matches
     *           default: false
     *         - in: query
     *           name: followAliasOfFeatures
     *           type: boolean
     *           description: will check the alias representations of features and not just name matches
     *           default: false
     *         - in: body
     *           name: eventExpressions
     *           required: true
     *           schema:
     *             type: array
     *             items:
     *               type: string
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     */
    /**
     * @swagger
     * /publication:
	 *  get:
	 *    parameters:
	 *      - in: query
	 *        name: year
	 *        type: integer
	 *      - in: query
	 *        name: journalName
	 *        type: string
	 *      - in: query
	 *        name: pubmed
	 *        type: string
	 *      - in: query
	 *        name: activeOnly
	 *        type: boolean
	 *        default: true
	 *        description: return active (not deleted) entries only
	 *    responses:
	 *      '200':
	 *        description: successful operation
	 *      '400':
	 *        description: input error
	 *      '403':
	 *        description: access denied
	 *  post:
	 *    responses:
	 *      '200':
	 *        description: successful operation
	 *      '400':
	 *        description: input error
	 *      '403':
	 *        description: access denied
     */ 
    /**
     * @swagger
     * /publication/{uuid}:
     *     get:
     *       parameters:
     *         - in: path
     *           name: uuid
     *           required: true
     *           type: string
     *           description: the internal identifier
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     *     put:
     *       parameters:
     *         - in: path
     *           name: uuid
     *           required: true
     *           type: string
     *           description: the internal identifier
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     */
    /**
     * @swagger
     * /feature:
     *     get:
     *       summary: search features
     *       responses:
     *         '200':
     *           description: successful operation
     *           schema:
     *             type: array
     *             items:
     *               $ref: '#/definitions/Feature'
     *         '400':
     *           description: Invalid query parameter
     *       produces:
     *         - application/json
     *       parameters:
     *         - in: query
     *           name: source
     *           type: string
     *         - in: query
     *           name: biotype
     *           type: string
     *         - in: query
     *           name: name
     *           type: string
     *         - in: query
     *           name: activeOnly
     *           type: boolean
     *           default: true
     *           description: return active (not deleted) entries only
     *     post:
     *       parameters:
     *         - in: body
     *           name: newFeature
     *           description: new feature to be added
     *           required: true
     *           schema:
     *             $ref: '#/definitions/Feature'
     *       responses:
     *         '200':
     *           description: successful operation
     *           schema:
     *             $ref: '#/definitions/Feature'
     *         '400':
     *           description: request input error
     *         '403':
     *           description: access denied
     */
    router.route('/feature')
        .get(async (req, res, next) => {
            try {
                await validateQueryParams(req.query, ['source', 'name', 'biotype']);
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST);
                res.json(err);
            }
            try {
                const result = await repo.models.feature.select(req.query);
                res.json(jc.decycle(result));
            } catch (err) {
                res.status(HTTP_STATUS.SERVER_ERROR);
                res.json(err);
            }
        });
    /**
     * @swagger
     * /feature/{uuid}:
     *     get:
     *       produces:
     *         - application/json
     *       parameters:
     *         - in: path
     *           name: uuid
     *           required: true
     *           type: string
     *           description: the internal identifier
     *         - in: query
     *           name: activeOnly
     *           type: boolean
     *           default: true
     *           description: return active (not deleted) entries only
     *       responses:
     *         '200':
     *           description: successful operation
     *           schema:
     *             $ref: '#/definitions/Feature'
     *         '400':
     *           description: bad uuid
     *         '403':
     *           description: access denied
     *     put:
     *       summary: updates a node by uuid
     *       produces:
     *         - application/json
     *       parameters:
     *         - in: path
     *           name: uuid
     *           required: true
     *           type: string
     *           description: the internal identifier
     *         - in: body
     *           name: newFeature
     *           required: true
     *           schema:
     *             $ref: '#/definitions/Feature'
     *       responses:
     *         '200':
     *           description: successful operation
     *           schema:
     *             $ref: '#/definitions/Feature'
     *         '400':
     *           description: request input error
     *         '403':
     *           description: access denied
     */
    router.route('/feature/:id')
        .get(async (req, res, next) => {
            if (! uuidValidate(req.params.id)) {
                res.status(HTTP_STATUS.BAD_REQUEST);
                res.json({message: HTTP_STATUS.getStatusText(HTTP_STATUS.BAD_REQUEST)});
            }
            try {
                const result = await repo.models.feature.selectExactlyOne({uuid: req.params.id, deleted_at: null});
                res.status(HTTP_STATUS.OK);
                res.json(jc.decycle(result.content));
            } catch (err) {
                if (err instanceof NoResultFoundError) {
                    res.status(HTTP_STATUS.NOT_FOUND);
                } else {
                    res.status(HTTP_STATUS.SERVER_ERROR);
                }
                res.json(err);
            }
        });
    /**
     * @swagger
     * /disease:
     *     get:
     *       parameters:
     *         - in: query
     *           name: name
     *           type: string
     *         - in: query
     *           name: doid
     *           type: integer
     *         - in: query
     *           name: activeOnly
     *           type: boolean
     *           default: true
     *           description: return active (not deleted) entries only
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     *     post:
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     */
    /**
     * @swagger
     * /disease/{uuid}:
     *     get:
     *       parameters:
     *         - in: path
     *           name: uuid
     *           required: true
     *           type: string
     *           description: the internal identifier
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     *     put:
     *       parameters:
     *         - in: path
     *           name: uuid
     *           required: true
     *           type: string
     *           description: the internal identifier
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     */
    /**
     * @swagger
     * /therapy:
     *     get:
     *       parameters:
     *         - in: query
     *           name: name
     *           type: string
     *         - in: query
     *           name: activeOnly
     *           type: boolean
     *           default: true
     *           description: return active (not deleted) entries only
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     *     post:
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     */
    /**
     * @swagger
     * /therapy/{uuid}:
     *     get:
     *       parameters:
     *         - in: path
     *           name: uuid
     *           required: true
     *           type: string
     *           description: the internal identifier
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     *     put:
     *       parameters:
     *         - in: path
     *           name: uuid
     *           required: true
     *           type: string
     *           description: the internal identifier
     *       responses:
     *         '200':
     *           description: successful operation
     *         '400':
     *           description: input error
     *         '403':
     *           description: access denied
     */
    
    router.route('/statement/:id')
        .get((req, res, next) => {
            console.log('GET /statement/:id', req.params);
            repo.models.statement.selectExactlyOne({uuid: req.params.id, deleted_at: null})
                .then((result) => {
                    console.log('query returned', result.rid);
                    res.json(jc.decycle(result.content));
                }).catch((error) => {
                    console.log('error:', error.name, error.message);
                    if (error instanceof NoResultFoundError) {
                        res.status(404).json(error);
                    } else {
                        res.status(500).json(error);
                    }
                });
        });
    router.route('/statement')
        .get((req, res, next) => {
            console.log('GET /statement', req.query);
            validateQueryParams(req.query, ['relevance'])
                .then(() => {
                    // activeOnly=false, exactlyN=null, ignoreAtPrefixed=false, fetchPlan={'*': 1}
                    return repo.models.statement.select(req.query, true, null, false, {'out_*': 3});
                }).then((result) => {
                    console.log('query returned', result.length, 'results');
                    res.json(jc.decycle(result));
                }).catch((error) => {
                    console.log('error:', error.name, error.message);
                    res.status(400).json(error);
                });
        });

    // add the match endpoint
    router.route('/match')
        .post((req, res, next) => {
        
        });
};

module.exports = add_routes;
