/**
 * Module to load the DrugBank data from the XML download
 * @module importer/drugbank
 */

const Ajv = require('ajv');
const XmlStream = require('xml-stream');
const fs = require('fs');

const {checkSpec} = require('./util');
const {rid} = require('./graphkb');
const _hgnc = require('./hgnc');
const {logger} = require('./logging');
const _chembl = require('./chembl');
const {SOURCE_DEFN: {name: fdaName}} = require('./fda_srs');


const ajv = new Ajv();

const SOURCE_DEFN = {
    displayName: 'DrugBank',
    name: 'drugbank',
    usage: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode',
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

const singleReqProp = (name, spec = {}) => ({
    oneOf: [{type: 'string', maxLength: 0}, {type: ['object', 'null'], required: [name], properties: {[name]: spec}}]
});

/**
 * This defines the expected format of the JSON post transform from xml
 */
const validateDrugbankSpec = ajv.compile({
    type: 'object',
    required: ['drugbank-id', 'name', '$'],
    properties: {
        'drugbank-id': {
            type: 'array',
            items: [{
                type: 'object',
                properties: {
                    $text: {type: 'string', pattern: '^DB\\d+$'}
                }
            }],
            minItems: 1
        },
        name: {type: 'string'},
        $: {
            type: 'object',
            required: ['updated'],
            properties: {
                updated: {type: 'string'}
            }
        },
        description: {type: ['string', 'null']},
        unii: {type: ['string', 'null']},
        'mechanism-of-action': {type: ['string', 'null']},
        categories: singleReqProp(
            'category', {
                type: 'array',
                items: {type: 'object', required: ['category'], properties: {category: {type: 'string'}}}
            }
        ),
        'calculated-properties': singleReqProp('property', {
            type: 'array',
            items: {
                type: 'object',
                required: ['kind', 'value'],
                properties: {
                    type: {type: 'string'},
                    kind: {type: 'string'}
                }
            }
        }),
        'atc-codes': singleReqProp(
            'atc-code', singleReqProp(
                'level', {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['$text', '$'],
                        properties: {
                            $text: {type: 'string'},
                            $: {
                                type: 'object',
                                required: ['code'],
                                properties: {code: {type: 'string'}}
                            }
                        }
                    }
                }
            )
        ),
        targets: singleReqProp(
            'target', {
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
                                                resource: {type: 'string'},
                                                identifier: {type: 'string'}
                                            }
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
            }
        ),
        products: singleReqProp('product', {
            type: 'array',
            items: {
                type: 'object',
                required: ['name'],
                properties: {name: {type: 'string'}}
            }
        }),
        'external-identifiers': singleReqProp(
            'external-identifier', {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['resource', 'identifier'],
                    properties: {
                        resource: {type: 'string'},
                        identifier: {type: 'string'}
                    }
                }
            }
        )
    }
});


const getDrugBankId = record => record['drugbank-id'][0].$text;


const processRecord = async ({
    conn, drug, sources: {current, fda}, ATC
}) => {
    checkSpec(validateDrugbankSpec, drug, getDrugBankId);
    let atcLevels = [];
    try {
        atcLevels = Array.from(
            drug[HEADER.superclasses][0][HEADER.superclass][0].level,
            x => ({name: x.$text, sourceId: x.$.code.toLowerCase()})
        );
    } catch (err) {}
    logger.info(`processing ${getDrugBankId(drug)}`);
    const body = {
        source: rid(current),
        sourceId: getDrugBankId(drug),
        name: drug.name,
        sourceIdVersion: drug.$.updated,
        description: drug.description,
        mechanismOfAction: drug[HEADER.mechanism]
    };
    if (drug.categories[0] && drug.categories[0].category) {
        body.subsets = [];
        for (const cat of Object.values(drug.categories[0].category)) {
            body.subsets.push(cat.category[0]);
        }
    }
    if (drug['calculated-properties']) {
        for (const {kind, value} of drug['calculated-properties'].property) {
            if (kind === 'IUPAC Name') {
                body.iupacName = value;
            } else if (kind === 'Molecular Formula') {
                body.molecularFormula = value;
            }
        }
    }

    const record = await conn.addRecord({
        target: 'Therapy',
        content: body,
        existsOk: true,
        fetchConditions: {
            AND: [
                {name: body.name},
                {source: rid(current)},
                {sourceId: body.sourceId},
                {sourceIdVersion: body.sourceIdVersion}
            ]
        }
    });
    // create the categories
    for (const atcLevel of atcLevels) {
        if (ATC[atcLevel.sourceId] === undefined) {
            const level = await conn.addRecord({
                target: 'Therapy',
                content: {
                    source: rid(current),
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
            target: 'subclassof',
            content: {
                source: rid(current),
                out: rid(record),
                in: rid(ATC[atcLevels[0].sourceId])
            },
            existsOk: true,
            fetchExisting: false
        });
        // link the subclassing
        for (let i = 0; i < atcLevels.length - 1; i++) {
            await conn.addRecord({
                target: 'subclassof',
                content: {
                    source: rid(current),
                    out: rid(ATC[atcLevels[i].sourceId]),
                    in: rid(ATC[atcLevels[i + 1].sourceId])
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
    // process the commerical product names
    const aliases = new Set(
        (drug.products.product || [])
            .map(p => p.name)
            // only keep simple alias names (over 100k otherwise)
            .filter(p => /^[a-zA-Z]\w+$/.exec(p) && p.toLowerCase() !== drug.name.toLowerCase())
    );
    await Promise.all(Array.from(aliases, async (aliasName) => {
        const alias = await conn.addRecord({
            target: 'Therapy',
            content: {
                source: rid(current),
                sourceId: getDrugBankId(drug),
                name: aliasName,
                dependency: rid(record)
            },
            existsOk: true
        });
        // link together
        await conn.addRecord({
            target: 'aliasof',
            content: {out: rid(alias), in: rid(record), source: rid(current)},
            existsOk: true,
            fetchExisting: false
        });
    }));
    // link to the FDA UNII
    if (fda && drug[HEADER.unii]) {
        let fdaRec;
        try {
            fdaRec = await conn.getUniqueRecordBy({
                target: 'Therapy',
                filters: {
                    AND: [
                        {source: rid(fda)},
                        {sourceId: drug[HEADER.unii].trim()}
                    ]
                }
            });
        } catch (err) {
            logger.log('error', `failed cross-linking from ${record.sourceId} to ${drug[HEADER.unii]} (fda)`);
        }
        if (fdaRec) {
            await conn.addRecord({
                target: 'crossreferenceof',
                content: {
                    source: rid(current), out: rid(record), in: rid(fdaRec)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
    // link to ChemBL
    const xrefs = [];
    try {
        xrefs.push(...drug['external-identifiers']['external-identifier']);
    } catch (err) {}
    for (const {resource, identifier} of xrefs) {
        if (resource.toLowerCase() === 'chembl') {
            try {
                const chemblDrug = await _chembl.fetchAndLoadById(conn, identifier);
                await conn.addRecord({
                    target: 'crossreferenceof',
                    content: {out: rid(record), in: rid(chemblDrug), source: rid(current)},
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err) {
                logger.error(err);
            }
        }
    }
    // try to link this drug to hgnc gene targets
    if (drug.targets.target) {
        let interactionType = '';
        try {
            interactionType = drug.targets.target.actions.action.join('/');
        } catch (err) {}

        const genes = [];
        for (const polypeptide of (drug.targets.target.polypeptide || [])) {
            for (const gene of polypeptide['external-identifiers']['external-identifier']) {
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
                target: 'targetof',
                content: {
                    out: rid(gene),
                    source: rid(current),
                    in: rid(record),
                    comment: interactionType
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
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

    const source = await conn.addRecord({
        target: 'Source',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });

    const ATC = {};
    let fdaSource;
    try {
        fdaSource = await conn.getUniqueRecordBy({
            target: 'Source',
            filters: {name: fdaName}
        });
    } catch (err) {
        logger.warn('Unable to find fda source record. Will not attempt cross-reference links');
    }
    const counts = {success: 0, error: 0, skipped: 0};

    const parseXML = new Promise((resolve, reject) => {
        logger.log('info', `loading XML data from ${filename}`);
        const stream = fs.createReadStream(filename);
        const xml = new XmlStream(stream);
        xml.collect('drug drugbank-id');
        xml.collect('drug external-identifier');
        xml.collect('drug synonym');
        xml.collect('drug categories > category');
        xml.collect('drug atc-code level');
        xml.collect('drug target polypeptide');
        xml.collect('drug target actions action');
        xml.collect('drug products product');
        xml.collect('drug calculated-properties property');
        xml.on('endElement: drug', (item) => {
            if (Object.keys(item).length < 3) {
                return;
            }
            xml.pause();
            processRecord({
                conn, sources: {current: source, fda: fdaSource}, drug: item, ATC
            }).then(() => {
                counts.success++;
                xml.resume();
            }).catch((err) => {
                let label;
                try {
                    label = getDrugBankId(item);
                } catch (err2) {}  // eslint-disable-line
                counts.error++;
                logger.error(err);
                logger.error(`Unable to process record ${label}`);
                xml.resume();
            });
        });
        xml.on('end', () => {
            logger.info('Parsing stream complete');
            stream.close();
            resolve();
        });
        xml.on('error', (err) => {
            logger.error('Parsing stream error');
            logger.error(err);
            stream.close();
            reject(err);
        });
    });

    await parseXML;
    logger.log('info', JSON.stringify(counts));
};

module.exports = {uploadFile, dependencies: [fdaName], SOURCE_DEFN};
