const HTTP_STATUS = require('http-status-codes');
const {errorToJSON, looksLikeRID} = require('./util');
const {
    select, create
} = require('./../repo/base');
const {VERBOSE} = require('./../repo/util');
const {parse} = require('./../parser/variant');


const addVariantRoutes = (opt) => {
    const {router, schema, db} = opt;
    if (VERBOSE) {
        console.log('addVariantRoutes');
    }

    router.post('/variants',
        async (req, res) => {
            // ensure that all the dependencies exist, or create them if they do not
            const {content} = req.body;
            if (content === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    {message: 'expected record details in content attribute of the request body'}
                );
            }
            let features = [content.reference];

            if (req.body.parse !== undefined) {
                try {
                    Object.assign(content, parse(req.body.parse));
                } catch (err) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
            }

            if (content.reference === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    {message: 'variant must contain a reference object link'}
                );
            }
            if (content.reference2 !== undefined && content.reference !== content.reference2) {
                features.push(content.reference2);
            }
            try {
                features = await Promise.all(Array.from(features, async (feature) => {
                    if (looksLikeRID(feature)) {
                        return feature;
                    }
                    try {
                        const dbFeature = await create(
                            db, {content: feature, model: schema.IndependantFeature, user: req.user}
                        );
                        return dbFeature['@rid'];
                    } catch (err) {
                        console.log('failed to create', feature);
                        const dbFeature = await select(
                            db, {where: feature, exactlyN: 1, model: schema.IndependantFeature}
                        );
                        return dbFeature[0]['@rid'];
                    }
                }));
            } catch (err) {
                return res.status(500).json(errorToJSON(err));
            }

            // now parse any positions
            return res.status(200).json({message: 'ok so far', features, content});
        });
};

module.exports = {addVariantRoutes};
