/**
 * Import the UNII for drugs from the FDA: https://fdasis.nlm.nih.gov/srs/jsp/srs/uniiListDownload.jsp
 * UNII Data: https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip
 */

const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const {addRecord, getRecordBy, orderPreferredOntologyTerms} = require('./util');

const upload = async (opt) => {
    const {filename, conn} = opt;
    console.log(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    console.log('parsing into json');
    const jsonList = parse(content, {
        delimiter: '\t', escape: null, quote: null, comment: '##', columns: true, auto_parse: true
    });
    const source = await addRecord('sources', {name: 'FDA', url: 'https://fdasis.nlm.nih.gov/srs'}, conn, {existsOk: true});
    let NCIT;
    try {
        NCIT = await getRecordBy('sources', {name: 'NCIT'}, conn);
    } catch (err) {
        console.log(err);
        process.stdout.write('?');
    }
    console.log(`\nloading ${jsonList.length} records`);
    let skipCount = 0;

    for (const record of jsonList) {
        if (record.NCIT.length === 0 && !/\S+[mn][ia]b\b/i.exec(record.PT)) {
            skipCount++;
            continue;
        }
        if (!record.PT.length || !record.UNII.length) {
            skipCount++;
            continue;
        }
        // only load records with at min these 3 values filled out
        const drug = await addRecord('therapies', {
            name: record.PT, sourceId: record.UNII, source: source['@rid']
        }, conn, {existsOk: true});
        if (NCIT && record.NCIT.length) {
            let ncitRec;
            try {
                ncitRec = await getRecordBy('therapies', {source: {name: 'ncit'}, sourceId: record.NCIT}, conn, orderPreferredOntologyTerms);
            } catch (err) {
                process.stdout.write('?');
            }
            if (ncitRec) {
                await addRecord('aliasof', {
                    source: source['@rid'],
                    out: drug['@rid'],
                    in: ncitRec['@rid']
                }, conn, {existsOk: true});
            }
        }
    }
    console.log(`\nskipped ${skipCount} records`);
};

module.exports = {upload};
