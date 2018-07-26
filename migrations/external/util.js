const request = require('request-promise');
const jc = require('json-cycle');

const convertNulls = (where) => {
    const queryParams = {};
    for (const param of Object.keys(where)) {
        if (where[param] === null) {
            queryParams[param] = 'null';
        } else if (typeof where[param] === 'object') {
            queryParams[param] = convertNulls(where[param]);
        } else {
            queryParams[param] = where[param];
        }
    }
    return queryParams;
};

const getRecordBy = async (className, where, conn, sortFunc = () => 0) => {
    const queryParams = convertNulls(where);
    let newRecord;
    try {
        newRecord = await request(conn.request({
            uri: className,
            qs: Object.assign({neighbors: 1}, queryParams)
        }));
        newRecord = jc.retrocycle(newRecord.result);
    } catch (err) {
        throw err;
    }
    newRecord.sort(sortFunc);
    if (newRecord.length > 1) {
        if (sortFunc(newRecord[0], newRecord[1]) === 0) {
            throw new Error(`\nexpected a single ${className} record: ${
                where.name || where.sourceId || Object.keys(where)}`);
        }
    } else if (newRecord.length === 0) {
        throw new Error(`\nmissing ${className} record: ${where.name || where.sourceId || Object.entries(where)} (${where.sourceId})`);
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
const addRecord = async (className, where, conn, existsOk = false, getWhere = null) => {
    const opt = conn.request({
        method: 'POST',
        uri: className,
        body: where
    });
    try {
        const newRecord = await request(opt);
        process.stdout.write(where.out && where.in
            ? '-'
            : '.');
        return newRecord.result;
    } catch (err) {
        if (existsOk && err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
            process.stdout.write(where.out && where.in
                ? '='
                : '*');
            return getRecordBy(className, getWhere || where, conn);
        }
        throw err;
    }
};


const orderPreferredOntologyTerms = (term1, term2) => {
    if (term1.deprecated && !term2.deprecated) {
        return 1;
    } if (term2.deprecated && !term1.deprecated) {
        return -1;
    } if (term1.dependency == null & term2.dependency != null) {
        return -1;
    } if (term2.dependency == null & term1.dependency != null) {
        return 1;
    }
    return 0;
};


const preferredDiseases = (term1, term2) => {
    const sourceRank = {
        oncotree: 0,
        'disease ontology': 1
    };

    if (orderPreferredOntologyTerms(term1, term2) === 0) {
        if (term1.source.name !== term2.source.name) {
            const rank1 = sourceRank[term1.source.name] === undefined
                ? 2
                : sourceRank[term1.source.name];
            const rank2 = sourceRank[term2.source.name] === undefined
                ? 2
                : sourceRank[term2.source.name];
            if (rank1 !== rank2) {
                return rank1 < rank2
                    ? -1
                    : 1;
            }
        }
        return 0;
    }
    return orderPreferredOntologyTerms(term1, term2);
};

const preferredDrugs = (term1, term2) => {
    const sourceRank = {
        drugbank: 0,
        ncit: 1
    };

    if (orderPreferredOntologyTerms(term1, term2) === 0) {
        if (term1.source.name !== term2.source.name) {
            const rank1 = sourceRank[term1.source.name] === undefined
                ? 2
                : sourceRank[term1.source.name];
            const rank2 = sourceRank[term2.source.name] === undefined
                ? 2
                : sourceRank[term2.source.name];
            if (rank1 !== rank2) {
                return rank1 < rank2
                    ? -1
                    : 1;
            }
        }
        return 0;
    }
    return orderPreferredOntologyTerms(term1, term2);
};


const getPubmedArticle = async (pmid) => {
    // try getting the title from the pubmed api
    const opt = {
        method: 'GET',
        uri: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
        qs: {
            id: pmid,
            retmode: 'json',
            db: 'pubmed'
        },
        headers: {Accept: 'application/json'},
        json: true
    };
    try {
        let pubmedRecord = await request(opt);
        if (pubmedRecord && pubmedRecord.result && pubmedRecord.result[pmid]) {
            pubmedRecord = pubmedRecord.result[pmid];
            const article = {
                sourceId: pmid,
                name: pubmedRecord.title,
                journalName: pubmedRecord.fulljournalname
            };
            // sortpubdate: '1992/06/01 00:00'
            const match = /^(\d\d\d\d)\//.exec(pubmedRecord.sortpubdate);
            if (match) {
                article.year = parseInt(match[1], 10);
            }
            return article;
        }
    } catch (err) {}
    throw new Error(`failed to retrieve pubmed article (${pmid})`);
};


const convertOwlGraphToJson = (graph, idParser) => {
    const initialRecords = {};
    for (const statement of graph.statements) {
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
    // const initialRecords = require(filename);

    // transform all NCIT codes to std format
    for (const record of Object.values(initialRecords)) {
        nodesByCode[record.code] = record;
        for (const predicate of Object.keys(record)) {
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

module.exports = {
    addRecord, getRecordBy, convertOwlGraphToJson, orderPreferredOntologyTerms, getPubmedArticle, preferredDiseases, preferredDrugs
};
