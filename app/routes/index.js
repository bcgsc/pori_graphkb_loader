const {errorJSON} = require('./../db/error');

const add_routes = (router, repo) => {
    // Other route groups could go here, in the future
    console.log('add_routes');
    router.route('/')
        .get((req, res, next) => {
            res.send('welcome to the knowledgebase api');
        });
    // features
    // events
    // evidence: clinical trial, study, publication, externalDB
    router.route('/publication')
        .get((req, res, next) => {
            console.log('GET /publication', req.query);
            repo.publication.get(req.query)
                .then((result) => {
                    res.json(result);
                }).catch((err) => {
                    res.json(errorJSON(err));
                });
        });
    router.route('/publication/:id')
        .get((req, res, next) => {
            console.log('GET /publication/:id', req.params);
            repo.publication.get_by_id(req.params.id)
                .then((result) => {
                    res.send(result)
                }).catch((error) => {
                    console.log(error);
                    res.json(errorJSON(error));
                });
        });
    // disease
    // therapy
    // user
};

module.exports = add_routes;
