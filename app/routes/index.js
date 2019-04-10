
const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');

const {error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');

const openapi = require('./openapi');
const util = require('./util');
const {logger} = require('./../repo/logging');
const {constants: {MAX_LIMIT, MAX_NEIGHBORS}, util: {castRangeInt, castBoolean}} = require('./../repo/query');
const {
    MIN_WORD_SIZE
} = require('./query');
const {selectByKeyword, selectFromList} = require('../repo/commands');
const {NoRecordFoundError} = require('../repo/error');


const addKeywordSearchRoute = (opt) => {
    const {
        router, db
    } = opt;
    logger.log('verbose', 'NEW ROUTE [GET] /search');

    router.get('/search',
        async (req, res) => {
            const {
                keyword, neighbors, limit, skip, orderBy, orderByDirection, count, ...other
            } = req.query;

            const options = {user: req.user};
            try {
                if (limit !== undefined) {
                    options.limit = castRangeInt(limit, 1, MAX_LIMIT);
                }
                if (neighbors !== undefined) {
                    options.neighbors = castRangeInt(neighbors, 0, MAX_NEIGHBORS);
                }
                if (skip !== undefined) {
                    options.skip = castRangeInt(skip, 0);
                }
                if (orderBy) {
                    options.orderBy = orderBy.split(',').map(prop => prop.trim());
                }
                if (orderByDirection) {
                    options.orderByDirection = `${orderByDirection}`.trim().toUpperCase();
                    if (!['ASC', 'DESC'].includes(options.orderByDirection)) {
                        throw new AttributeError(`Bad value (${options.orderByDirection}). orderByDirection must be one of ASC or DESC`);
                    }
                }
                if (count) {
                    options.count = castBoolean(count);
                }
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
            }

            if (Object.keys(other).length) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'Invalid query parameter',
                    invalidParams: other
                });
            }
            if (keyword === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'keyword query parameter is required'
                });
            }
            const wordList = keyword.split(/\s+/);

            if (wordList.some(word => word.length < MIN_WORD_SIZE)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    `Word "${keyword}" is too short to query with ~ operator. Must be at least ${
                        MIN_WORD_SIZE
                    } letters after splitting on whitespace characters`
                ));
            }
            try {
                const result = await selectByKeyword(db, wordList, options);
                return res.json(jc.decycle({result}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    logger.log('debug', err);
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
};


const addGetRecordsByList = ({router, db}) => {
    router.get('/records',
        async (req, res) => {
            const {
                rid = '', neighbors, activeOnly, ...other
            } = req.query;

            const options = {user: req.user};
            try {
                if (neighbors !== undefined) {
                    options.neighbors = castRangeInt(neighbors, 0, MAX_NEIGHBORS);
                }
                if (activeOnly !== undefined) {
                    options.activeOnly = castBoolean(activeOnly);
                }
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
            }
            if (Object.keys(other).length) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: `Invalid query parameter(s) (${Object.keys(other).join(', ')})`,
                    invalidParams: other
                });
            }

            try {
                const result = await selectFromList(db, rid.split(',').map(r => r.trim()), options);
                return res.json(jc.decycle({result}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    logger.log('debug', err);
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                if (err instanceof NoRecordFoundError) {
                    logger.log('debug', err);
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                }
                logger.log('error', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
        });
};

module.exports = {
    openapi, util, addKeywordSearchRoute, addGetRecordsByList
};
