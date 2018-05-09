const HTTP_STATUS = require('http-status-codes');
const {parsePosition} = require('./../parser/position');
const {parse} = require('./../parser/variant');
const {errorToJSON} = require('./util');


const addParserRoutes = (router) => {

    router.post('/parser/position/:prefix', async (req, res) => {
        try {
            const pos = parsePosition(req.params.prefix, req.body.content);
            res.status(HTTP_STATUS.OK).json(pos);
        } catch (err) {
            res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
        }
    });

    router.post('/parser/variant', async (req, res) => {
        try {
            const pos = parse(req.body.content);
            res.status(HTTP_STATUS.OK).json(pos);
        } catch (err) {
            res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
        }
    });
};

module.exports = {addParserRoutes};
