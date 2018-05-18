const HTTP_STATUS = require('http-status-codes');
var uuidValidate = require('uuid-validate');
const jc = require('json-cycle');
const _ = require('lodash');
const {errorToJSON, looksLikeRID} = require('./util');
const {ErrorMixin, AttributeError, NoRecordFoundError, MultipleRecordsFoundError} = require('./../repo/error');
const {select, create, update, remove} = require('./../repo/base');
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
            const content = req.body.content;
            if (content === undefined) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'expected record details in content attribute of the request body'});
                return;
            }
            let features = [content.reference];

            if (req.body.parse !== undefined) {
                try {
                    Object.assign(content, parse(req.body.parse));
                } catch (err) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                    return;
                }
            }

            if (content.reference == undefined) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'variant must contain a reference object link'});
                return;
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
                        const dbFeature = await create(db, {content: feature, model: schema.IndependantFeature, user: req.user});
                        return dbFeature['@rid'];
                    } catch (err) {
                        console.log('failed to create', feature);
                        const dbFeature = await select(db, {where: feature, exactlyN: 1, model: schema.IndependantFeature});
                        return dbFeature[0]['@rid'];
                    }
                }));
            } catch (err) {
                res.status(500).json(errorToJSON(err));
                return;
            }

            // now parse any positions
            res.status(200).json({message: 'ok so far', features: features, content: content});
        });
};

module.exports = {addVariantRoutes};
