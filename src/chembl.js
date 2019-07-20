/**
 * Load therapy recrods from CHEMBL
 */
const Ajv = require('ajv');
const request = require('request-promise');

const {checkSpec, rid} = require('./util');
const {logger} = require('./logging');

const ajv = new Ajv();

const validateDrugRecord = ajv.compile({
    type: 'object',
    required: ['molecule_chembl_id'],
    properties: {
        molecule_chembl_id: {type: 'string', pattern: '^CHEMBL\\d+$'},
        pref_name: {type: 'string'},
        usan_stem_definition: {type: ['string', 'null']}
    }
});

const SOURCE_DEFN = {
    name: 'chembl',
    displayName: 'ChEMBL',
    description: 'ChEMBL is a manually curated database of bioactive molecules with drug-like properties. It brings together chemical, bioactivity and genomic data to aid the translation of genomic information into effective new drugs.',
    url: 'https://www.ebi.ac.uk/chembl',
    usage: 'https://creativecommons.org/licenses/by-sa/3.0'
};

const API = 'https://www.ebi.ac.uk/chembl/api/data/molecule';

const CACHE = {};


/**
 * fetch drug by chemblId and load it into GraphKB
 * @param {ApiConnection} conn
 * @param {string} drugId
 */
const fetchAndLoadById = async (conn, drugId) => {
    if (CACHE[drugId.toLowerCase()]) {
        return CACHE[drugId.toLowerCase()];
    }
    logger.info(`loading: ${API}/${drugId}`);
    const chemblRecord = await request({
        uri: `${API}/${drugId}`,
        json: true
    });
    checkSpec(validateDrugRecord, chemblRecord);
    if (!CACHE.SOURCE) {
        CACHE.SOURCE = await conn.addRecord({
            endpoint: 'sources',
            content: SOURCE_DEFN,
            existsOk: true
        });
    }
    const source = rid(CACHE.SOURCE);
    const record = await conn.addRecord({
        endpoint: 'therapies',
        content: {
            source,
            sourceId: chemblRecord.molecule_chembl_id,
            name: chemblRecord.pref_name
        },
        existsOk: true
    });
    CACHE[record.sourceId] = record;
    if (chemblRecord.usan_stem_definition) {
        try {
            const parent = await conn.addRecord({
                endpoint: 'therapies',
                content: {
                    source,
                    sourceId: chemblRecord.usan_stem_definition,
                    name: chemblRecord.usan_stem_definition,
                    comment: 'usan stem definition'
                },
                existsOk: true
            });

            await conn.addRecord({
                endpoint: 'subclassof',
                content: {
                    source,
                    out: rid(record),
                    in: rid(parent)
                },
                existsOk: true
            });
        } catch (err) {}
    }
    return record;
};


module.exports = {
    fetchAndLoadById,
    SOURCE_DEFN
};
