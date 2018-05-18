const request = require('request-promise');
const _ = require('lodash');

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
 * @param {object} where
 * @param {ApiRequest} conn
 * @param {boolean} exists_ok
 */
const addRecord = async (className, where, conn, exists_ok=false, getIgnore=[]) => {
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
            return await getRecordBy(className, _.omit(where, getIgnore), conn);
        }
        throw err;
    }
};


const convertOwlGraphToJson = (graph, idParser) => {
    const initialRecords = {};
    for (let statement of graph.statements) {
        let src;
        try {
            src = idParser(statement.subject.value);
        } catch (err) {
            continue;
        }
        if (initialRecords[src] === undefined) {
            initialRecords[src] = {code: src};
        }
        if (initialRecords[src][statement.predicate.value] === undefined) {
            initialRecords[src][statement.predicate.value] = [];
        }
        initialRecords[src][statement.predicate.value].push(statement.object.value);
    }
    const nodesByCode = {};
    //const initialRecords = require(filename);

    // transform all NCIT codes to std format
    for (let record of Object.values(initialRecords)) {
        nodesByCode[record.code] = record;
        for (let predicate of Object.keys(record)) {
            if (typeof record[predicate] === 'object' && record[predicate] !== null) {
                const formatted = [];
                for (let item of record[predicate]) {
                    try {
                        item = idParser(item);
                    } catch (err) {
                        // ignore, will be unamed n\d+ nodes
                    }
                    formatted.push(item);
                }
                record[predicate] = formatted;
            }
        }
    }
    return nodesByCode;
};

module.exports = {addRecord, getRecordBy, convertOwlGraphToJson};