/**
 * Module to import variant information from http://www.docm.info/api
 */
const request = require('request-promise');
const {
    addRecord, getRecordBy, orderPreferredOntologyTerms, getPubmedArticle
} = require('./util');

const SOURCE_NAME = 'database of curated mutations (docm)';
const BASE_URL = 'http://www.docm.info/api/v1/variants';


/**
 * Parse DOCM specific protein notation into standard HGVS
 */
const parseDocmVariant = (variant) => {
    let match;
    if (match = /^p\.([A-Z]+)(\d+)-$/.exec(variant)) {
        const [, seq] = match;
        const pos = parseInt(match[2], 10);
        if (seq.length === 1) {
            return `p.${seq}${pos}del${seq}`;
        }
        return `p.${seq[0]}${pos}_${seq[seq.length - 1]}${pos + seq.length - 1}del${seq}`;
    } if (match = /^p\.([A-Z][A-Z]+)(\d+)([A-WYZ]+)$/.exec(variant)) { // ignore X since DOCM appears to use it to mean frameshift
        let [, refseq, pos, altSeq] = match;
        pos = parseInt(match[2], 10);
        let prefix = 0;
        for (let i = 0; i < refseq.length && i < altSeq.length; i++) {
            if (altSeq[i] !== refseq[i]) {
                break;
            }
            prefix++;
        }
        pos += prefix;
        refseq = refseq.slice(prefix);
        altSeq = altSeq.slice(prefix);
        if (refseq.length !== 0 && altSeq.length !== 0) {
            if (refseq.length > 1) {
                return `p.${refseq[0]}${pos}_${refseq[refseq.length - 1]}${pos + refseq.length - 1}del${refseq}ins${altSeq}`;
            }
            return `p.${refseq[0]}${pos}del${refseq}ins${altSeq}`;
        }
    }
    return variant;
};

const processRecord = async (opt) => {
    const {
        conn, pubmedSource, source, record
    } = opt;
    // get the feature by name
    const gene = await getRecordBy('features', {source: {name: 'hgnc'}, name: record.gene}, conn, orderPreferredOntologyTerms);
    // get the record details
    const details = await request({
        method: 'GET',
        json: true,
        uri: `${BASE_URL}/${record.hgvs}.json`
    });
    const counts = {error: 0, success: 0, skip: 0};

    // get the variant
    let variant = (await request(conn.request({
        method: 'POST',
        uri: 'parser/variant',
        body: {content: parseDocmVariant(record.amino_acid)}
    }))).result;
    const variantType = await getRecordBy('vocabulary', {name: variant.type}, conn);
    const defaults = {
        untemplatedSeq: null,
        break1Start: null,
        break1End: null,
        break2Start: null,
        break2End: null,
        refSeq: null,
        truncation: null,
        zygosity: null,
        germline: null
    };
    variant.reference1 = gene['@rid'];
    variant.type = variantType['@rid'];
    // create the variant
    variant = await addRecord('positionalvariants', variant, conn, {existsOk: true, getWhere: Object.assign(defaults, variant)});

    for (const diseaseRec of details.diseases) {
        if (!diseaseRec.tags || diseaseRec.tags.length !== 1) {
            counts.skip++;
            continue;
        }
        try {
            // get the vocabulary term
            const relevance = await getRecordBy('vocabulary', {name: diseaseRec.tags[0]}, conn);
            // get the disease by name
            const disease = await getRecordBy('diseases', {
                sourceId: `doid:${diseaseRec.doid}`,
                name: diseaseRec.disease,
                source: {name: 'disease ontology'}
            }, conn, orderPreferredOntologyTerms);
            // get the pubmed article
            let publication;
            try {
                publication = await getRecordBy('publications', {sourceId: diseaseRec.source_pubmed_id, source: {name: 'pubmed'}}, conn);
            } catch (err) {
                publication = await getPubmedArticle(diseaseRec.source_pubmed_id);
                publication = await addRecord('publications', Object.assign(publication, {
                    source: pubmedSource['@rid']
                }), conn, {existsOk: true});
            }
            // now create the statement
            await addRecord('statements', {
                impliedBy: [{target: disease['@rid']}, {target: variant['@rid']}],
                supportedBy: [{target: publication['@rid'], source: source['@rid']}],
                relevance: relevance['@rid'],
                appliesTo: disease['@rid'],
                source: source['@rid'],
                reviewStatus: 'not required'
            }, conn, {
                existsOk: true,
                getWhere: {
                    implies: {direction: 'in', v: [disease['@rid'], variant['@rid']]},
                    supportedBy: {v: [publication['@rid']], direction: 'out'},
                    relevance: relevance['@rid'],
                    appliesTo: disease['@rid'],
                    source: source['@rid'],
                    reviewStatus: 'not required'
                }
            });
            counts.success++;
        } catch (err) {
            console.log(err.error || err);
            counts.error++;
        }
    }
    return counts;
};


const upload = async (conn) => {
    // load directly from their api:
    console.log(`loading: ${BASE_URL}.json`);
    const recordsList = await request({
        method: 'GET',
        json: true,
        uri: `${BASE_URL}.json`
    });
    console.log(`loaded ${recordsList.length} records`);
    // add the source node
    const source = await addRecord('sources', {
        name: SOURCE_NAME,
        usage: 'http://www.docm.info/terms',
        url: 'http://www.docm.info'
    }, conn, {existsOk: true, getWhere: {name: SOURCE_NAME}});
    const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, {existsOk: true});

    const counts = {error: 0, success: 0, skip: 0};

    for (const record of recordsList) {
        if (record.drug_interactions) {
            console.log(record);
        }
        try {
            const updates = await processRecord({
                conn, source, record, pubmedSource
            });
            counts.success += updates.success;
            counts.error += updates.error;
            counts.skip += updates.skip;
        } catch (err) {
            counts.error++;
            console.log(err.error || err);
        }
    }
    console.log('\n', counts);
};

module.exports = {upload};
