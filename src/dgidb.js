const Ajv = require('ajv');

const request = require('request-promise');

const _entrezGene = require('./entrez/gene');
const _chembl = require('./chembl');
const { logger } = require('./logging');
const { checkSpec } = require('./util');
const { rid } = require('./graphkb');

const SOURCE_DEFN = {
    name: 'dgidb',
    displayName: 'DGIdb',
    longName: 'Drug Gene Interaction Database',
    description: 'Mining the druggable genome for personalized medicine',
    usage: 'http://dgidb.org/faq',
};

const ajv = new Ajv();

const recordSpec = ajv.compile({
    type: 'object',
    required: ['entrez_id', 'chembl_id', 'interaction_types', 'id'],
    properties: {
        id: { type: 'string', format: 'uuid' },
        entrez_id: { type: 'number', min: 1 },
        chembl_id: { type: 'string', pattern: '^CHEMBL\\d+$' },
        interaction_types: { type: 'array', items: { type: 'string' } },
    },
});

const BASE_URL = 'http://dgidb.org/api/v2';


const processRecord = async ({ conn, record, source }) => {
    checkSpec(recordSpec, record);
    const {
        entrez_id: entrezId,
        chembl_id: chemblId,
        interaction_types: interactionTypes,
        id,
    } = record;

    const [gene] = await _entrezGene.fetchAndLoadByIds(conn, [entrezId]);
    const drug = await _chembl.fetchAndLoadById(conn, chemblId);

    const interactionType = interactionTypes.map(i => i.toLowerCase().trim()).sort().join(';');

    await conn.addRecord({
        target: 'TargetOf',
        content: {
            out: rid(gene),
            in: rid(drug),
            actionType: interactionType,
            source: rid(source),
            uuid: id, // use the input uuid as the uuid rather than generating one
        },
        existsOk: true,
        fetchExisting: false,
    });
};


const upload = async ({ conn, url = BASE_URL }) => {
    logger.info('creating the source record');
    const source = rid(await conn.addRecord({
        target: 'Source',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
    }));
    const limit = 100;
    let page = `${url}/interactions?count=${limit}&page=1`;
    const counts = { error: 0, skip: 0, success: 0 };

    // pre-cache the entrez genes
    logger.info('pre-loading the entrez gene list');
    await _entrezGene.preLoadCache(conn);
    logger.info('pre-loading the chembl drug list');
    await _chembl.preLoadCache(conn);

    while (page) {
        logger.info(`loading: ${page}`);
        const resp = await request({
            uri: page,
            method: 'GET',
            json: true,
        });
        const { _meta: { links: { next } }, records } = resp;
        page = next;

        // process this batch of records
        for (const record of records) {
            logger.info(`processing ${record.id}`);

            try {
                await processRecord({ conn, record, source });
                counts.success++;
            } catch (err) {
                logger.error(err);
                counts.error++;
            }
        }
    }
    logger.info(JSON.stringify(counts));
};


module.exports = {
    SOURCE_DEFN,
    upload,
    dependencies: [_entrezGene.SOURCE_DEFN.name, _chembl.SOURCE_DEFN.name],
};
