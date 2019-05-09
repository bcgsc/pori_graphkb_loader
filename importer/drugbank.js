/**
 * Module to load the DrugBank data from the XML download
 * @module importer/drugbank
 */

const _ = require('lodash');
const Ajv = require('ajv');

const {
    loadXmlToJson, rid, checkSpec
} = require('./util');
const _hgnc = require('./hgnc');
const {logger} = require('./logging');

const ajv = new Ajv();

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

const singleItemArray = (spec = {}) => ({
    type: 'array', maxItems: 1, minItems: 1, items: {type: 'string', ...spec}
});

const singleReqProp = (name, spec = {}) => ({
    type: 'array',
    maxitems: 1,
    minItems: 1,
    items: {
        type: ['object', 'null'], required: [name], properties: {[name]: spec}
    }
});

/**
 * This defines the expected format of the JSON post transform from xml
 */
const validateDrugbankSpec = ajv.compile({
    type: 'object',
    required: ['drugbank-id', 'name'],
    properties: {
        'drugbank-id': {
            type: 'array',
            items: [{
                type: 'object',
                properties: {
                    _: {type: 'string', pattern: '^DB\\d+$'}
                }
            }],
            minItems: 1
        },
        name: singleItemArray(),
        updated: singleItemArray(),
        description: singleItemArray({type: ['string', 'null']}),
        unii: singleItemArray({type: ['string', 'null']}),
        'mechanism-of-action': singleItemArray({type: ['string', 'null']}),
        categories: singleReqProp(
            'category', {
                type: 'array',
                items: {type: 'object', properties: {category: singleItemArray()}}
            }
        ),
        'atc-codes': singleReqProp(
            'atc-code', singleReqProp(
                'level', {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['_', 'code'],
                        properties: {
                            _: {type: 'string'},
                            code: singleItemArray()
                        }
                    }
                }
            )
        ),
        targets: singleReqProp(
            'target', {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['actions'],
                    properties: {
                        actions: singleReqProp('action', {type: 'array', items: {type: 'string'}}),
                        polypeptide: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    'external-identifiers': singleReqProp(
                                        'external-identifier', {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                required: ['resource', 'identifier'],
                                                properties: {
                                                    resource: singleItemArray(),
                                                    identifier: singleItemArray()
                                                }
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        )

    }
});


const getDrugBankId = record => record['drugbank-id'][0]._;


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
        logger.warn('Unable to find fda source record. Will not attempt cross-reference links');
    }
    const fdaMissingRecords = new Set();
    const counts = {success: 0, error: 0};

    for (const drug of xml.drugbank.drug) {
        try {
            checkSpec(validateDrugbankSpec, drug, getDrugBankId);
        } catch (err) {
            logger.log('error', err);
            counts.error++;
        }
        let atcLevels = [];
        try {
            atcLevels = Array.from(
                drug[HEADER.superclasses][0][HEADER.superclass][0].level,
                x => ({name: x._, sourceId: x.code[0].toLowerCase()})
            );
        } catch (err) {}
        try {
            const body = {
                source: rid(source),
                sourceId: drug[HEADER.ident][0]._,
                name: drug.name[0],
                sourceIdVersion: drug.updated[0],
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
                for (const unii of (drug[HEADER.unii] || []).filter(u => u)) {
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
                        logger.log('error', `failed cross-linking from ${record.sourceId} to ${unii} (fda)`);
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
            // try to link this drug to hgnc gene targets
            try {
                const interactionType = drug.targets[0].target[0].actions[0].action.join('/');
                const genes = [];
                for (const polypeptide of drug.targets[0].target[0].polypeptide) {
                    for (const gene of polypeptide['external-identifiers'][0]['external-identifier']) {
                        if (gene.resource[0] === 'HUGO Gene Nomenclature Committee (HGNC)') {
                            genes.push(gene.identifier[0]);
                        }
                    }
                }

                for (const identifier of genes) {
                    const gene = await _hgnc.fetchAndLoadBySymbol({
                        conn, symbol: identifier, paramType: 'hgnc_id'
                    });
                    await conn.addRecord({
                        endpoint: 'targetof',
                        content: {
                            out: rid(gene),
                            source: rid(source),
                            in: rid(record),
                            comment: interactionType
                        },
                        existsOk: true,
                        fetchExisting: false
                    });
                }
            } catch (err) {} // will throw error if this is not filled out
            counts.success++;
        } catch (err) {
            let label;
            try {
                label = getDrugBankId(drug);
            } catch (err) {}  // eslint-disable-line
            counts.error++;
            logger.error(err);
            console.error(err);
            logger.error(`Unable to process record ${label}`);
        }
    }

    if (fdaMissingRecords.size) {
        logger.warn(`Unable to retrieve ${fdaMissingRecords.size} fda records for cross-linking`);
    }
    logger.log('info', JSON.stringify(counts));
};

module.exports = {uploadFile, dependencies: ['fda'], SOURCE_DEFN};
