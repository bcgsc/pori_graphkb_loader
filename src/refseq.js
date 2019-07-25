/**
 * Import the RefSeq transcripts, ignoring version numbers for now
 * @module importer/refseq
 */
const {
    loadDelimToJson, rid
} = require('./util');
const {logger} = require('./logging');

const _entrez = require('./entrez/gene');

const SOURCE_DEFN = {
    name: 'refseq',
    displayName: 'RefSeq',
    url: 'https://www.ncbi.nlm.nih.gov/refseq',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: 'A comprehensive, integrated, non-redundant, well-annotated set of reference sequences including genomic, transcript, and protein.'
};

/**
 * Parse the tab delimited file to upload features and their relationships
 * For each versioned feature, a generalization (non-versioned) feature is created
 * to facilitate linking from other sources where the version may not be given
 *
 * @param {object} opt options
 * @param {string} opt.filename path to the tab delimited file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const json = await loadDelimToJson(filename);

    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });
    logger.log('info', `Loading ${json.length} gene records`);

    // batch load entrez genes
    await _entrez.preLoadCache(conn);
    await _entrez.fetchAndLoadByIds(conn, json.map(rec => rec.GeneID));

    for (let i=0; i < json.length; i++) {
        const {RNA, GeneID, Protein} = json[i];
        logger.info(`processing (${i} / ${json.length}) ${RNA}`);

        // Load the RNA
        const [rnaName, rnaVersion] = RNA.split('.');
        const general = await conn.addRecord({
            endpoint: 'features',
            content: {
                biotype: 'transcript', source: rid(source), sourceId: rnaName, sourceIdVersion: null
            },
            existsOk: true
        });
        const versioned = await conn.addRecord({
            endpoint: 'features',
            content: {
                biotype: 'transcript', source: rid(source), sourceId: rnaName, sourceIdVersion: rnaVersion
            },
            existsOk: true
        });
        // make the general an alias of the versioned
        await conn.addRecord({
            endpoint: 'generalizationof',
            content: {out: rid(general), in: rid(versioned), source: rid(source)},
            existsOk: true,
            fetchExisting: false
        });

        try {
            const [hgnc] = await _entrez.fetchAndLoadByIds(conn, [GeneID]);
            await conn.addRecord({
                endpoint: 'elementof',
                content: {out: rid(general), in: rid(hgnc), source: rid(source)},
                existsOk: true,
                fetchExisting: false
            });
        } catch (err) {
            logger.log('error', `failed cross-linking from ${general.sourceId} to ${GeneID}`);
            logger.error(err);
        }

        // load the protein
        if (Protein) {
            const [proteinName, proteinVersion] = Protein.split('.');
            const generalProtein = await conn.addRecord({
                endpoint: 'features',
                content: {
                    biotype: 'protein', source: rid(source), sourceId: proteinName, sourceIdVersion: null
                },
                existsOk: true
            });
            const versionedProtein = await conn.addRecord({
                endpoint: 'features',
                content: {
                    biotype: 'protein', source: rid(source), sourceId: proteinName, sourceIdVersion: proteinVersion
                },
                existsOk: true
            });
            // make the general an alias of the versioned
            await conn.addRecord({
                endpoint: 'generalizationof',
                content: {
                    out: rid(generalProtein),
                    in: rid(versionedProtein),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });

            await conn.addRecord({
                endpoint: 'elementof',
                content: {
                    out: rid(generalProtein),
                    in: rid(general),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });

            await conn.addRecord({
                endpoint: 'elementof',
                content: {
                    out: rid(versionedProtein),
                    in: rid(versioned),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
};

module.exports = {uploadFile, SOURCE_DEFN};
