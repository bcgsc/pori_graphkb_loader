
module.exports = function(router, db) {
  // Other route groups could go here, in the future
  router.route('/')
    .get((req, res, next) => {
        res.send('welcom to the knowledgebase api');
    });
};
