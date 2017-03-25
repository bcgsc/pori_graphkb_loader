module.exports = function(router, db) {
    // Other route groups could go here, in the future
    router.route('/')
        .get((req, res, next) => {
            res.send('welcome to the knowledgebase api');
        });
    // features
    // events
    // evidence: clinical trial, study, publication, externalDB
    // disease
    // therapy
    // user
};
