const HTTP_STATUS = require('http-status-codes');
var uuidValidate = require('uuid-validate');
const jc = require('json-cycle');

const {ErrorMixin, AttributeError, NoResultFoundError, MultipleResultsFoundError} = require('./../repo/error');
const {select, create, update, remove} = require('./../repo/base');


class InputValidationError extends ErrorMixin {};

/*
 * check that the parameters passed are expected
 */
const validateParams = async (opt) => {
    const params = Array.from(opt.params) || [];
    const required = opt.required || [];
    const optional = opt.optional || [];
    const allowNone = opt.allowNone !== undefined ? opt.allowNone : true;
    if (Object.keys(params).length == 0 && ! allowNone) {
        throw new InputValidationError('no parameters were specified');
    }
    // check that the required parameters are present
    for (let attr of required) {
        if (params.indexOf(attr) < 0) {
            throw new InputValidationError(`missing required parameter: ${attr}. Found ${params}`);
        }
    }
    // check that all parameters are expected
    for (let attr of params) {
        if (required.indexOf(attr) < 0 && optional.indexOf(attr) < 0) {
            throw new InputValidationError(`unexpected parameter: ${attr}`);
        }
    }
    return true;
};

/*
 * add basic select and create methods for any standard db class
 *
 * can add get/post methods to a router
 *
 * example:
 *      router.route('/feature') = resource({model: <ClassModel>, db: <OrientDB conn>, reqQueryParams: ['source', 'name', 'biotype']});
 */
const resource = async (opt) => {
    const {router, route, model, db} = opt;
    const optQueryParams = opt.optQueryParams || [];
    const reqQueryParams = opt.reqQueryParams || [];

    return {
        get: async (req, res, next) => {
            try {
                validateParams({params: Object.keys(req.query), required: reqQueryParams, optional: optQueryParams});
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                return;
            }
            try {
                const result = await select(db, {from: model.name, where: req.query});
                res.json(jc.decycle(result));
            } catch (err) {
                res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        }
    };
}
const add_resource_routes = (opt) => {
    const {router, route, model, db} = opt;
    const optQueryParams = opt.optQueryParams || [];
    const reqQueryParams = opt.reqQueryParams || [];
    
    router.get(route, 
        async (req, res, next) => {
            try {
                validateParams({params: req.query, required: reqQueryParams, optional: optQueryParams});
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                return;
            }
            try {
                const result = await select(db, {from: model.name, where: req.query});
                res.json(jc.decycle(result));
            } catch (err) {
                res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
    router.post(route, 
        async (req, res, next) => {
            if (! req.user) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'user not given', type: 'PermissionError'});
                return;
            }
            try {
                const user = req.user;
                const result = await create(db, {model: model, content: req.body, user: user});
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json({message: err.message, type: err.name});
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({message: err.message, type: err.name});
                }
            }
        }
    );
    router.put(route, 
        async (req, res, next) => {
            if (! req.user) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'user not given', type: 'PermissionError'});
                return;
            }
            try {
                const user = req.user;
                const result = await update(db, {model: model, content: req.body.content, where: req.body.where, user: user});
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError || err instanceof NoResultFoundError || err instanceof MultipleResultsFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                }
            }
        }
    );
    router.delete(route,
        async (req, res, next) => {
            if (! req.user) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'user not given', type: 'PermissionError'});
                return;
            }
            try {
                const user = req.user;
                const result = await remove(db, {model: model, where: req.body.where, user: user});
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError || err instanceof NoResultFoundError || err instanceof MultipleResultsFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                }
            }
        }
    );
};


const errorToJSON = (err) => {
    const json = {message: err.message};
    for (let attr of Object.keys(err)) {
        json[attr] = err[attr];
    }
    return json;
};


module.exports = {validateParams, add_resource_routes, InputValidationError};
