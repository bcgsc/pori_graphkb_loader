
const parseNullQueryParams = async (req, res, next) => {
    Object.keys(req.query).map((k) => {
        if (req.query[k] === 'null') {
            req.query[k] = null;
        }
    });
    next();
};

module.exports = {parseNullQueryParams};
