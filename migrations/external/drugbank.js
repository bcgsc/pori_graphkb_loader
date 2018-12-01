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
 * @module migrations/external/drugbank
 */

const _ = require('lodash');
const {
    addRecord, getRecordBy, loadXmlToJson, rid
} = require('./util');

const SOURCE_NAME = 'drugbank';


/**
 * Given the input XML file, load the resulting parsed ontology into GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input XML file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({filename, conn}) => {
    console.log('Loading the external drugbank data');
    const xml = await loadXmlToJson(filename);

    const source = await addRecord('sources', {
        name: SOURCE_NAME,
        usage: 'https://www.drugbank.ca/legal/terms_of_use',
        url: 'https://www.drugbank.ca'
    }, conn, {existsOk: true, getWhere: {name: SOURCE_NAME}});
    console.log(`uploading ${xml.drugbank.drug.length} records`);

    const ATC = {};
    let fdaSource;
    try {
        fdaSource = await getRecordBy('sources', {name: 'FDA'}, conn);
    } catch (err) {
        process.stdout.write('?');
    }

    for (const drug of xml.drugbank.drug) {
        let atcLevels = [];
        try {
            atcLevels = Array.from(drug['atc-codes'][0]['atc-code'][0].level, x => ({name: x._, sourceId: x.$.code.toLowerCase()}));
        } catch (err) {}
        try {
            const body = {
                source: rid(source),
                sourceId: drug['drugbank-id'][0]._,
                name: drug.name[0],
                sourceIdVersion: drug.$.updated,
                description: drug.description[0],
                mechanismOfAction: drug['mechanism-of-action'][0]
            };
            if (drug.categories[0] && drug.categories[0].category) {
                body.subsets = [];
                for (const cat of Object.values(drug.categories[0].category)) {
                    body.subsets.push(cat.category[0]);
                }
            }
            const record = await addRecord('therapies', body, conn, {
                existsOk: true,
                getWhere: _.omit(body, ['subsets', 'mechanismOfAction', 'description'])
            });
            // create the categories
            for (const atcLevel of atcLevels) {
                if (ATC[atcLevel.sourceId] === undefined) {
                    const level = await addRecord('therapies', {
                        source: rid(source),
                        name: atcLevel.name,
                        sourceId: atcLevel.sourceId
                    }, conn, {existsOk: true});
                    ATC[level.sourceId] = level;
                }
            }
            if (atcLevels.length > 0) {
                // link the current record to the lowest subclass
                await addRecord('subclassof', {
                    source: rid(source),
                    out: rid(record),
                    in: rid(ATC[atcLevels[0].sourceId])
                }, conn, {existsOk: true});
                // link the subclassing
                for (let i = 0; i < atcLevels.length - 1; i++) {
                    await addRecord('subclassof', {
                        source: rid(source),
                        out: rid(ATC[atcLevels[i].sourceId]),
                        in: rid(ATC[atcLevels[i + 1].sourceId])
                    }, conn, {existsOk: true});
                }
            }
            // link to the FDA UNII
            if (fdaSource) {
                for (const unii of drug.unii) {
                    let fdaRec;
                    try {
                        fdaRec = await getRecordBy('therapies', {source: rid(fdaSource), sourceId: unii}, conn);
                    } catch (err) {
                        process.stdout.write('x');
                    }
                    if (fdaRec) {
                        await addRecord('aliasof', {
                            source: rid(source), out: rid(record), in: rid(fdaRec)
                        }, conn, {existsOk: true});
                    }
                }
            }
        } catch (err) {
            throw err;
        }
    }
    console.log();
};

module.exports = {uploadFile};
