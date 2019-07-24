/**
 * Loader module for the entrez gene utility
 */

const {rid, requestWithRetry, orderPreferredOntologyTerms} = require('./util');
const {logger} = require('./logging');

const DEFAULT_QS = {
    retmode: 'json',
    db: 'gene',
    rettype: 'docsum'
};

const CACHE = {};

const API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const MAX_CONSEC_IDS = 150;

const SOURCE_DEFN = {
    name: 'entrez gene',
    url: 'https://www.ncbi.nlm.nih.gov/gene',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: 'Gene integrates information from a wide range of species. A record may include nomenclature, Reference Sequences (RefSeqs), maps, pathways, variations, phenotypes, and links to genome-, phenotype-, and locus-specific resources worldwide.'
};

/**
 * Given an gene record retrieved from entrez, parse it into its equivalent
 * GraphKB representation
 */
const parseGeneRecord = record => ({
    sourceId: record.uid,
    name: record.name,
    biotype: 'gene',
    description: record.description
});

/**
 * Given some list of entrex Ids, fetch the minimal parsed aricle summaries
 * @param {Array.<string>} geneIdListIn list of entrez ids
 * @param {string} url the base url for the entrez api
 */
const fetchGenesByIds = async (geneIdListIn, url = API) => {
    const allGenes = [];
    const geneIdList = Array.from((new Set(Array.from(geneIdListIn))).values()) // remove dups
        .map(geneId => geneId.toString().trim())
        .filter(geneId => geneId);

    for (let startIndex = 0; startIndex < geneIdList.length; startIndex += MAX_CONSEC_IDS) {
        const geneIdString = geneIdList
            .slice(startIndex, startIndex + MAX_CONSEC_IDS)
            .map(id => id.toString())
            .join(',');

        logger.info(`loading: ${url}?db=gene&id=${geneIdString}`);
        const {result} = await requestWithRetry({
            method: 'GET',
            uri: url,
            qs: {...DEFAULT_QS, id: geneIdString},
            headers: {Accept: 'application/json'},
            json: true
        });

        const genes = Object.values(result)
            .filter(content => !Array.isArray(content))
            .map(parseGeneRecord);
        allGenes.push(...genes);
    }

    return allGenes;
};


/**
 * Given the parsed content of some gene, upload to the api
 * @param {object} gene the gene contents to be uploaded
 * @param {object} opt
 * @param {boolean} opt.cache add the GraphKB Publication record to the cache
 * @param {boolean} opt.fetchFirst attempt to get the record by source Id before uploading it
 */
const uploadGene = async (api, gene, opt = {}) => {
    const {
        cache = true,
        fetchFirst = true
    } = opt;

    const {sourceId} = gene;

    if (cache && CACHE[gene.sourceId]) {
        return CACHE[gene.sourceId];
    } if (fetchFirst) {
        try {
            const record = await api.getUniqueRecordBy({
                endpoint: 'features',
                where: {sourceId}
            });
            if (cache) {
                CACHE[sourceId] = record;
            }
            return record;
        } catch (err) {}
    }
    let entrezSource = cache
        ? CACHE.source
        : null;
    if (!entrezSource) {
        entrezSource = await api.addRecord({
            endpoint: 'sources',
            content: SOURCE_DEFN,
            fetchConditions: {name: SOURCE_DEFN.name},
            existsOk: true
        });
        if (cache) {
            CACHE.source = entrezSource;
        }
    }
    const result = await api.addRecord({
        endpoint: 'features',
        content: {...gene, source: rid(entrezSource), displayName: gene.name.toUpperCase()},
        existsOk: true,
        fetchConditions: {
            sourceId,
            source: rid(entrezSource)
        }
    });
    if (cache) {
        CACHE[sourceId] = result;
    }
    return result;
};

/**
 * Given some list of entrez IDs, return if cached,
 * If they do not exist, grab from the entrez api
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} geneIdList list of entrez IDs
 */
const uploadGenesByGeneId = async (api, geneIdListIn) => {
    const genes = await fetchGenesByIds(geneIdListIn);
    return Promise.all(genes.map(async gene => uploadGene(api, gene)));
};


const fetchAndLoadById = async (conn, geneId) => {
    // try to get the gene from the cache
    if (CACHE[geneId.toLowerCase()]) {
        return CACHE[geneId.toLowerCase()];
    }
    // try to get the gene from the gkb db
    try {
        const gene = await conn.getUniqueRecordBy({
            endpoint: 'features',
            where: {source: {name: SOURCE_DEFN.name}, sourceId: geneId},
            sort: orderPreferredOntologyTerms
        });
        CACHE[gene.sourceId] = gene;
        return gene;
    } catch (err) {}
    // fetch from the external api
    const [gene] = await uploadGenesByGeneId(conn, [geneId]);
    CACHE[gene.souceId] = gene;
    return gene;
};


module.exports = {
    fetchGenesByIds,
    parseGeneRecord,
    uploadGene,
    uploadGenesByGeneId,
    fetchAndLoadById,
    SOURCE_DEFN
};
