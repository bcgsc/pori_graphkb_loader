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
    router.route('/publication/:id')
        .get((req, res, next) => {
            console.log('GET /publication/:id', req.params.id);
            if (req.params.id === undefined) {
                res.json({msg: 'publications can be selected by node id'});
            } else {
                repo.publication.get_by_id(req.params.id)
                    .then((entry) => {
                        res.send(entry);
                    }).catch((err) => {
                        res.send({error: err});
                    });
            }
        });
    // disease
    // therapy
    // user
};

export default add_routes;
