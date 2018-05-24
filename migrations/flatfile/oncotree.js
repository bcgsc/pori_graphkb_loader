/**
 * Module for Loading content from the oncotree wep API
 */

const request = require('request-promise');
const {addRecord, getRecordBy} = require('./util');


const ONCOTREE_API = 'http://oncotree.mskcc.org/api';


const uploadOncoTree = async (conn) => {
    console.log('\nretrieving the oncotree metadata');
    const versions = await request({
        method: 'GET',
        uri: `${ONCOTREE_API}/versions`,
        json: true
    });
    let stable;
    for (let version of versions) {
        if (version.api_identifier === 'oncotree_latest_stable') {
            stable = version;
            break;
        }
    }
    if (stable === undefined) {
        throw new Error('Could not find the latest stable release metadata information');
    }
    const sourceVersion = stable.release_date;
    console.log(`retrieving the entries for version: ${sourceVersion}`);
    const records = await request({
        method: 'GET',
        uri: `${ONCOTREE_API}/tumorTypes`,
        json: true
    });
    const recordBySourceID = {};
    const subclassof = [];
    for (let record of records) {
        const body = {
            source: 'oncotree',
            sourceVersion: sourceVersion,
            name: record.name,
            sourceId: record.code
        };
        const rec = await addRecord('diseases', body, conn, true);
        recordBySourceID[rec.sourceId] = rec;
        if (record.parent != null) {
            subclassof.push({src: record.code.toLowerCase(), tgt: record.parent.toLowerCase()});
        }
        if (record.externalReferences && record.externalReferences['NCI']) {
            for (let ncitID of record.externalReferences['NCI']) {
                ncitID = `ncit:${ncitID.toLowerCase()}`;
                try {
                    const ncitRec = await getRecordBy('diseases', {source: 'ncit', sourceId: ncitID}, conn);
                    await addRecord('aliasof', {out: rec['@rid'], in: ncitRec['@rid'], source: 'oncotree'}, conn);
                } catch (err) {
                    // don't care. Don't add relationship unless the node exists
                    process.stdout.write('x');
                }
            }
        }
    }
    console.log('\nAdding subclass relationships');
    for (let {src, tgt} of subclassof) {
        src = recordBySourceID[src]['@rid'];
        tgt = recordBySourceID[tgt]['@rid'];
        await addRecord('subclassof', {out: src, in: tgt, source: 'oncotree'}, conn, true);
    }
    console.log();
};


module.exports = {uploadOncoTree};