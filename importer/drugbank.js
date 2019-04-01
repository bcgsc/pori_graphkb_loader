/**
 * | | |
 * | --- | --- |
 * | Source | DrugBank |
 * | About |  https://www.drugbank.ca/about |
 * | Source Type | Ontology |
 * | Data Example| https://www.drugbank.ca/releases/5-1-1/downloads/all-full-database |
 * | Data Format| XML |
 *
 * Module to load the DrugBank data from the XML download
 *
 * @example <caption>Example record (Converted to JSON)</caption>
 *{ '$': { type: 'biotech', created: '2005-06-13', updated: '2018-03-02' },
 *  'drugbank-id': [ { _: 'DB00001', '$': [Object] }, 'BTD00024', 'BIOD00024' ],
 *  name: [ 'Lepirudin' ],
 *  description:
 *   [ 'Lepirudin is identical to natural hirudin except for substitution of leucine for isoleucine at the N-terminal end of the molecule and the absence of a sulfate group on the tyrosine at position 63. It is produced via yeast cells. Bayer ceased the production of lepirudin (Refludan) effective May 31, 2012.' ],
 *  'cas-number': [ '138068-37-8' ],
 *  unii: [ 'Y43GF64R34' ],
 *  state: [ 'liquid' ],
 *  groups: [ { group: [Array] } ],
 *  'general-references': [ { articles: [Array], textbooks: [Array], links: [Array] } ],
 *  'synthesis-reference': [ '' ],
 *  indication: [ 'For the treatment of heparin-induced thrombocytopenia' ],
 *  pharmacodynamics:
 *   [ 'Lepirudin is used to break up clots and to reduce thrombocytopenia. It binds to thrombin and prevents thrombus or clot formation. It is a highly potent, selective, and essentially irreversible inhibitor of thrombin and clot-bond thrombin. Lepirudin requires no cofactor for its anticoagulant action. Lepirudin is a recombinant form of hirudin, an endogenous anticoagulant found in medicinal leeches.' ],
 *  'mechanism-of-action':
 *   [ 'Lepirudin forms a stable non-covalent complex with alpha-thrombin, thereby abolishing its ability to cleave fibrinogen and initiate the clotting cascade. The inhibition of thrombin prevents the blood clotting cascade. ' ],
 *  toxicity:
 *   [ 'In case of overdose (eg, suggested by excessively high aPTT values) the risk of bleeding is increased.' ],
 *  metabolism:
 *   [ 'Lepirudin is thought to be metabolized by release of amino acids via catabolic hydrolysis of the parent drug. However, con-clusive data are not available. About 48% of the administration dose is excreted in the urine which consists of unchanged drug (35%) and other fragments of the parent drug.' ],
 *  absorption: [ 'Bioavailability is 100% following injection.' ],
 *  'half-life': [ 'Approximately 1.3 hours' ],
 *  'protein-binding': [ '' ],
 *  'route-of-elimination':
 *   [ 'Lepirudin is thought to be metabolized by release of amino acids via catabolic hydrolysis of the parent drug. About 48% of the administration dose is excreted in the urine which consists of unchanged drug (35%) and other fragments of the parent drug.' ],
 *  'volume-of-distribution':
 *   [ '* 12.2 L [Healthy young subjects (n = 18, age 18-60 years)]\r\n* 18.7 L [Healthy elderly subjects (n = 10, age 65-80 years)]\r\n* 18 L [Renally impaired patients (n = 16, creatinine clearance below 80 mL/min)]\r\n* 32.1 L [HIT patients (n = 73)]' ],
 *  clearance:
 *   [ '* 164 ml/min [Healthy 18-60 yrs]\r\n* 139 ml/min [Healthy 65-80 yrs]\r\n* 61 ml/min [renal impaired]\r\n* 114 ml/min [HIT (Heparin-induced thrombocytopenia)]' ],
 *  classification:
 *   [ { description: [Array],
 *       'direct-parent': [Array],
 *       kingdom: [Array],
 *       superclass: [Array],
 *       class: [Array],
 *       subclass: [Array] } ],
 *  salts: [ '' ],
 *  synonyms: [ { synonym: [Array] } ],
 *  products: [ { product: [Array] } ],
 *  'international-brands': [ '' ],
 *  mixtures: [ { mixture: [Array] } ],
 *  packagers: [ { packager: [Array] } ],
 *  manufacturers: [ { manufacturer: [Array] } ],
 *  prices: [ { price: [Array] } ],
 *  categories: [ { category: [Array] } ],
 *  'affected-organisms': [ { 'affected-organism': [Array] } ],
 *  dosages: [ { dosage: [Array] } ],
 *  'atc-codes': [ { 'atc-code': [Array] } ],
 *  'ahfs-codes': [ '' ],
 *  'pdb-entries': [ '' ],
 *  'fda-label':
 *   [ '//s3-us-west-2.amazonaws.com/drugbank/fda_labels/DB00001.pdf?1265924858' ],
 *  msds:
 *   [ '//s3-us-west-2.amazonaws.com/drugbank/msds/DB00001.pdf?1368416245' ],
 *  patents: [ { patent: [Array] } ],
 *  'food-interactions': [ '' ],
 *  'drug-interactions': [ { 'drug-interaction': [Array] } ],
 *  sequences: [ { sequence: [Array] } ],
 *  'experimental-properties': [ { property: [Array] } ],
 *  'external-identifiers': [ { 'external-identifier': [Array] } ],
 *  'external-links': [ { 'external-link': [Array] } ],
 *  pathways: [ { pathway: [Array] } ],
 *  reactions: [ '' ],
 *  'snp-effects': [ '' ],
 *  'snp-adverse-drug-reactions': [ '' ],
 *  targets: [ { target: [Array] } ],
 *  enzymes: [ '' ],
 *  carriers: [ '' ],
 *  transporters: [ '' ] }
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
