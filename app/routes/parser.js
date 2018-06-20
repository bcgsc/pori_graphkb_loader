const HTTP_STATUS = require('http-status-codes');
const {parsePosition} = require('./../parser/position');
const {parse} = require('./../parser/variant');


const addParserRoutes = (router) => {

    router.post('/parser/variant', async (req, res) => {
        try {
            const parsed = parse(req.body.content);
            res.status(HTTP_STATUS.OK).json({result: parsed});
        } catch (err) {
            res.status(HTTP_STATUS.BAD_REQUEST).json(err);
        }
    });
};

module.exports = {addParserRoutes};
