const path = require('path');

/**
 * @constant
 * @type {Number}
 * @default
*/
const DEFAULT_QUERY_LIMIT = 100;
/**
 * @constant
 * @type {Number}
 * @default
*/
const MAX_JUMPS = 4;
/**
 * @constant
 * @type {Number}
 * @default
*/
const MAX_QUERY_LIMIT = 1000;
/**
 * @constant
 * @type {string}
 * @default
*/
const ABOUT_FILE = path.join(__dirname, '../../../doc/about.md');
/**
 * @constant
 * @type {string}
 * @default
*/
const SEARCH_ABOUT = path.join(__dirname, '../../../doc/search.md');
/**
 * @constant
 * @type {string}
 * @default
*/
const QUERY_ABOUT = path.join(__dirname, '../../../doc/query.md');

module.exports = {
    DEFAULT_QUERY_LIMIT, MAX_JUMPS, MAX_QUERY_LIMIT, ABOUT_FILE, SEARCH_ABOUT, QUERY_ABOUT
};
