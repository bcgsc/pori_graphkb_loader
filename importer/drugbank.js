/**
 * Module to load the DrugBank data from the XML download
 * @module importer/drugbank
 */

const _ = require('lodash');
const {
    loadXmlToJson, rid
} = require('./util');
const {logger} = require('./logging');

const SOURCE_DEFN = {
    name: 'drugbank',
    usage: 'https://www.drugbank.ca/legal/terms_of_use',
    url: 'https://www.drugbank.ca',
    description: 'The DrugBank database is a unique bioinformatics and cheminformatics resource that combines detailed drug data with comprehensive drug target information.'
};

// Lists most of the commonly required 'Tags' and Attributes
const HEADER = {
    unii: 'unii',
    superclasses: 'atc-codes',
    superclass: 'atc-code',
    ident: 'drugbank-id',
    mechanism: 'mechanism-of-action'
};


/**
 * Given the input XML file, load the resulting parsed ontology into GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input XML file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({filename, conn}) => {
    logger.info('Loading the external drugbank data');
    const xml = await loadXmlToJson(filename);

    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });
    logger.info(`uploading ${xml.drugbank.drug.length} records`);

    const ATC = {};
    let fdaSource;
    try {
        fdaSource = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            where: {name: 'FDA'}
        });
    } catch (err) {
        logger.warn('Unable to find fda source record. Will not attemp cross-reference links');
    }
    const fdaMissingRecords = new Set();

    for (const drug of xml.drugbank.drug) {
        let atcLevels = [];
        try {
            atcLevels = Array.from(
                drug[HEADER.superclasses][0][HEADER.superclass][0].level,
                x => ({name: x._, sourceId: x.$.code.toLowerCase()})
            );
        } catch (err) {}
        try {
            const body = {
                source: rid(source),
                sourceId: drug[HEADER.ident][0]._,
                name: drug.name[0],
                sourceIdVersion: drug.$.updated,
                description: drug.description[0],
                mechanismOfAction: drug[HEADER.mechanism][0]
            };
            if (drug.categories[0] && drug.categories[0].category) {
                body.subsets = [];
                for (const cat of Object.values(drug.categories[0].category)) {
                    body.subsets.push(cat.category[0]);
                }
            }
            const record = await conn.addRecord({
                endpoint: 'therapies',
                content: body,
                existsOk: true,
                fetchConditions: _.omit(body, ['subsets', 'mechanismOfAction', 'description'])
            });
            // create the categories
            for (const atcLevel of atcLevels) {
                if (ATC[atcLevel.sourceId] === undefined) {
                    const level = await conn.addRecord({
                        endpoint: 'therapies',
                        content: {
                            source: rid(source),
                            name: atcLevel.name,
                            sourceId: atcLevel.sourceId
                        },
                        existsOk: true
                    });
                    ATC[level.sourceId] = level;
                }
            }
            if (atcLevels.length > 0) {
                // link the current record to the lowest subclass
                await conn.addRecord({
                    endpoint: 'subclassof',
                    content: {
                        source: rid(source),
                        out: rid(record),
                        in: rid(ATC[atcLevels[0].sourceId])
                    },
                    existsOk: true,
                    fetchExisting: false
                });
                // link the subclassing
                for (let i = 0; i < atcLevels.length - 1; i++) {
                    await conn.addRecord({
                        endpoint: 'subclassof',
                        content: {
                            source: rid(source),
                            out: rid(ATC[atcLevels[i].sourceId]),
                            in: rid(ATC[atcLevels[i + 1].sourceId])
                        },
                        existsOk: true,
                        fetchExisting: false
                    });
                }
            }
            // link to the FDA UNII
            if (fdaSource) {
                for (const unii of drug[HEADER.unii]) {
                    let fdaRec;
                    try {
                        if (!unii || !unii.trim()) {
                            continue;
                        }
                        fdaRec = await conn.getUniqueRecordBy({
                            endpoint: 'therapies',
                            where: {source: rid(fdaSource), sourceId: unii.trim()}
                        });
                    } catch (err) {
                        fdaMissingRecords.add(unii);
                    }
                    if (fdaRec) {
                        await conn.addRecord({
                            endpoint: 'crossreferenceof',
                            content: {
                                source: rid(source), out: rid(record), in: rid(fdaRec)
                            },
                            existsOk: true,
                            fetchExisting: false
                        });
                    }
                }
            }
        } catch (err) {
            let label;
            try {
                label = drug[HEADER.ident][0]._;
            } catch (err) {}  // eslint-disable-line
            logger.error(err);
            logger.error(`Unable to process record ${label}`);
        }
    }

    if (fdaMissingRecords.size) {
        logger.warn(`Unable to retrieve ${fdaMissingRecords.size} fda records for cross-linking`);
    }
};

module.exports = {uploadFile, dependencies: ['fda'], SOURCE_DEFN};
