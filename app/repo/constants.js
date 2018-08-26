/**
 * @module app/repo/constants
 */

/**
 * @namespace
 * @property {Number} CREATE permissions for create/insert/post opertations
 * @property {Number} READ permissions for read/get operations
 * @property {Number} UPDATE permissions for update/patch operations
 * @property {Number} DELETE permissions for delete/remove operations
 * @property {Number} NONE no permissions granted
 * @property {Number} ALL all permissions granted
 *
 * @example <caption>getting read/write permissions</caption>
 * > PERMISSIONS.READ | PERMISSIONS.WRITE
 * 0b1100
 *
 * @example <caption>testing permissions</caption>
 * > PERMISSIONS.READ & PERMISSIONS.ALL
 * true
 * > PERMISSIONS.READ & PERMISSIONS.NONE
 * false
 */
const PERMISSIONS = {
    CREATE: 0b1000,
    READ: 0b0100,
    UPDATE: 0b0010,
    DELETE: 0b0001,
    NONE: 0b0000
};
PERMISSIONS.ALL = PERMISSIONS.READ | PERMISSIONS.CREATE | PERMISSIONS.UPDATE | PERMISSIONS.DELETE;
module.exports = {PERMISSIONS};
