const request = require('request-promise');
const _ = require('lodash');
const jc = require('json-cycle');

const getRecordBy = async (className, where, conn, sortFunc=(x, y) => 0) => {
    let newRecord = await request(conn.request({
        uri: className,
        qs: Object.assign({neighbors: 1}, where)
    }));
    newRecord = jc.retrocycle(newRecord.result);
    newRecord.sort(sortFunc);
    if (newRecord.length > 1) {
        if (sortFunc(newRecord[0], newRecord[1]) == 0) {
            throw new Error(`expected a single ${className} record: ${where.name || where.sourceId || where}`);
        }
    } else if (newRecord.length == 0) {
        throw new Error(`missing ${className} record: ${where.name || where.sourceId || Object.entries(where)}`);
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
        return newRecord.result;
    } catch (err) {
        if (exists_ok && err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
            process.stdout.write('*');
            return await getRecordBy(className, _.omit(where, getIgnore), conn);
        }
        throw err;
    }
};


const orderPreferredOntologyTerms = (term1, term2) => {
    if (term1.deprecated && ! term2.deprecated) {
        return 1;
    } else if (term2.deprecated && ! term1.deprecated) {
        return -1;
    } else if (term1.dependency == null & term2.dependency != null) {
        return -1;
    } else if (term2.dependency == null & term1.dependency != null) {
        return 1;
    }
    return 0;
};


const getPubmedArticle = async (pmid) => {

    // try getting the title from the pubmed api
    opt = {
        method: 'GET',
        uri: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
        qs: {
            id: pmid,
            retmode: 'json',
            db: 'pubmed'
        },
        headers: {Accept: 'application/json'},
        json: true
    }
    try {
        pubmedRecord = await request(opt);
        if (pubmedRecord && pubmedRecord.result && pubmedRecord.result[pmid]) {
            pubmedRecord = pubmedRecord.result[pmid];
            let article = {
                sourceId: pmid,
                name: pubmedRecord.title,
                journalName: pubmedRecord.fulljournalname
            };
            //sortpubdate: '1992/06/01 00:00'
            let match = /^(\d\d\d\d)\//.exec(pubmedRecord.sortpubdate);
            if (match) {
                article.year = parseInt(match[1]);
            }
            return article;
        }
    } catch (err) {}
    throw new Error(`failed to retrieve pubmed article (${pmid})`);
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

module.exports = {addRecord, getRecordBy, convertOwlGraphToJson, orderPreferredOntologyTerms, getPubmedArticle};