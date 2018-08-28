/**
 * | | |
 * | --- | --- |
 * | Source | OncoTree |
 * | About | http://oncotree.mskcc.org/#/home |
 * | Source Type | Ontology |
 * | Data Example| Direct API Access |
 * | Data Format| JSON |
 *
 *
 * Module for Loading content from the oncotree web API
 */

const request = require('request-promise');
const {addRecord, getRecordBy} = require('./util');


const ONCOTREE_API = 'http://oncotree.mskcc.org/api';


const uploadOncoTree = async (conn) => {
    console.log('\nRetrieving the oncotree metadata');
    const versions = await request({
        method: 'GET',
        uri: `${ONCOTREE_API}/versions`,
        json: true
    });
    let stable;
    for (const version of versions) {
        if (version.api_identifier === 'oncotree_latest_stable') {
            stable = version;
            break;
        }
    }
    if (stable === undefined) {
        throw new Error('Could not find the latest stable release metadata information');
    }
    const sourceVersion = stable.release_date;
    console.log(`Retrieving the entries for version: ${sourceVersion}`);
    const records = await request({
        method: 'GET',
        uri: `${ONCOTREE_API}/tumorTypes`,
        json: true
    });
    const source = await addRecord('sources', {
        name: 'oncotree',
        version: sourceVersion,
        url: ONCOTREE_API
    }, conn, {existsOk: true, getWhere: {name: 'oncotree'}});
    const recordBySourceID = {};
    const subclassof = [];
    let ncitSource;
    try {
        ncitSource = await getRecordBy('sources', {name: 'ncit'}, conn);
    } catch (err) {
        process.stdout.write('?');
    }

    for (const record of records) {
        const body = {
            source: source['@rid'],
            name: record.name,
            sourceId: record.code
        };
        const rec = await addRecord('diseases', body, conn, {existsOk: true});
        recordBySourceID[rec.sourceId] = rec;
        if (record.parent != null) {
            subclassof.push({src: record.code.toLowerCase(), tgt: record.parent.toLowerCase()});
        }
        if (ncitSource) {
            if (record.externalReferences && record.externalReferences.NCI) {
                for (let ncitID of record.externalReferences.NCI) {
                    ncitID = ncitID.toLowerCase();
                    try {
                        const ncitRec = await getRecordBy('diseases', {source: {name: 'ncit'}, sourceId: ncitID}, conn);
                        await addRecord('aliasof', {out: rec['@rid'], in: ncitRec['@rid'], source: source['@rid']}, conn);
                    } catch (err) {
                        // don't care. Don't add relationship unless the node exists
                        process.stdout.write('?');
                    }
                }
            }
        }
    }
    console.log('\nAdding subclass relationships');
    for (let {src, tgt} of subclassof) {
        src = recordBySourceID[src]['@rid'];
        tgt = recordBySourceID[tgt]['@rid'];
        await addRecord('subclassof', {out: src, in: tgt, source: source['@rid']}, conn, {existsOk: true});
    }
    console.log();
};


module.exports = {uploadOncoTree};
