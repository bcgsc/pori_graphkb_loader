const request = require('request-promise');

const getRecordBy = async (className, where, conn) => {
    let newRecord = await request(conn.request({
        uri: className,
        qs: where
    }));
    if (newRecord.length > 1) {
        throw new Error('expected a single record');
    } else if (newRecord.length == 0) {
        throw new Error('missing record');
    }
    newRecord = newRecord[0];
    return newRecord;
};

/**
 * Add a disease record to the DB
 * @param {} where
 * @param {*} conn
 * @param {*} exists_ok
 */
const addRecord = async (className, where, conn, exists_ok=false) => {
    let opt = conn.request({
        method: 'POST',
        uri: className,
        body: where
    });
    try {
        const newRecord = await request(opt);
        process.stdout.write('.');
        return newRecord;
    } catch (err) {
        if (exists_ok && err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
            process.stdout.write('*');
            return await getRecordBy(className, where, conn);
        }
        throw err;
    }
};

module.exports = {addRecord, getRecordBy};