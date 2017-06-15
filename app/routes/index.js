const {errorJSON} = require('./../db/error');

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
     *           description: will check the depreceated features and not just name matches
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
    router.route('/publication')
        .get((req, res, next) => {
            console.log('GET /publication', req.query);
            repo.model.publication.get(req.query)
                .then((result) => {
                    res.json(result);
                }).catch((err) => {
                    res.json(errorJSON(err));
                });
        });
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
    router.route('/publication/:id')
        .get((req, res, next) => {
            console.log('GET /publication/:id', req.params);
            repo.model.publication.get_by_id(req.params.id)
                .then((result) => {
                    res.send(result)
                }).catch((error) => {
                    console.log(error);
                    res.json(errorJSON(error));
                });
        });
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
};

module.exports = add_routes;
