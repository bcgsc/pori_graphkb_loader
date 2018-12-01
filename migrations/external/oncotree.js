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
 * @module migrations/external/oncotree
 */

const request = require('request-promise');
const {addRecord, getRecordBy, rid} = require('./util');

const {addRecord, getRecordBy, rid} = require('./util');
const {logger, progress} = require('./logging');

const ONCOTREE_API = 'http://oncotree.mskcc.org/api';
const SOURCE_NAME = 'oncotree';


/**
 * Use the oncotree REST API to pull down ontology information and then load it into the GraphKB API
 *
 * @param {object} opt options
 * @param {ApiRequest} opt.conn the GraphKB API connection object
 * @param {string} opt.url the base url to use in connecting to oncotree
 */
const upload = async (opt) => {
    const {conn} = opt;
    console.log('\nRetrieving the oncotree metadata');
    const versions = await request({
        method: 'GET',
        uri: `${opt.url || ONCOTREE_API}/versions`,
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
        name: SOURCE_NAME,
        version: sourceVersion,
        url: ONCOTREE_API
    }, conn, {existsOk: true, getWhere: {name: SOURCE_NAME, version: sourceVersion}});
    const recordBySourceID = {};
    const subclassof = [];
    let ncitSource;
    try {
        ncitSource = await getRecordBy('sources', {name: 'ncit'}, conn);
    } catch (err) {
        progress('x');
    }

    for (const record of records) {
        const body = {
            source: rid(source),
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
                        await addRecord('aliasof', {out: rid(rec), in: rid(ncitRec), source: rid(source)}, conn);
                    } catch (err) {
                        // don't care. Don't add relationship unless the node exists
                        process.stdout.write('x');
                    }
                }
            }
        }
    }
    console.log('\nAdding subclass relationships');
    for (let {src, tgt} of subclassof) {
        src = rid(recordBySourceID[src]);
        tgt = rid(recordBySourceID[tgt]);
        await addRecord('subclassof', {out: src, in: tgt, source: rid(source)}, conn, {existsOk: true});
    }
    console.log();
};


module.exports = {upload};
