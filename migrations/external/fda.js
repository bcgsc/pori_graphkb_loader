/**
 * | | |
 * | --- | --- |
 * | Source | FDA |
 * | About | https://www.fda.gov/ForIndustry/DataStandards/SubstanceRegistrationSystem-UniqueIngredientIdentifierUNII/default.htm |
 * | Source Type | Ontology |
 * | Data Example| https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip |
 * | Data Format| Tab Delimited |
 *
 * Import the UNII for drugs from the FDA
 *
 * @module migrations/external/fda
 */

const {
    addRecord, getRecordBy, orderPreferredOntologyTerms, loadDelimToJson, rid
} = require('./util');


const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const jsonList = await loadDelimToJson(filename);
    const source = await addRecord('sources', {name: 'FDA', url: 'https://fdasis.nlm.nih.gov/srs'}, conn, {existsOk: true});
    let ncitSource;
    try {
        ncitSource = await getRecordBy('sources', {name: 'NCIT'}, conn);
    } catch (err) {
        process.stdout.write('x');
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
        if (ncitSource && record.NCIT.length) {
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

module.exports = {uploadFile};
