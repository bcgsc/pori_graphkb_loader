const Ajv = require('ajv');


const _entrezGene = require('../entrez/gene');
const _chembl = require('../chembl');
const { logger } = require('../logging');
const { checkSpec, request } = require('../util');
const { rid } = require('../graphkb');

const { dgidb: SOURCE_DEFN } = require('../sources');
const spec = require('./spec.json');

const ajv = new Ajv();

const recordSpec = ajv.compile(spec);

const BASE_URL = 'https://dgidb.org/api/graphql';


const processRecord = async ({ conn, record, source, counts }) => {
    checkSpec(recordSpec, record);
    const { node: { id, conceptId: chemblId, interactions } } = record;

    const drug = await _chembl.fetchAndLoadById(conn, chemblId.replace('chembl:', ''));

    for (const interaction of interactions) {
        const { gene: { conceptId, name }, interactionTypes } = interaction;
        const interactionType = interactionTypes.map(item => item.type).sort().join(';');

        let geneRid;

        if (conceptId.split(':')[0] === 'hgnc') {
            const hgncRecord = await conn.getUniqueRecordBy({
                filters: { AND: [{displayName: name}, { sourceId: conceptId }, { source: { filters: { name: 'hgnc' }, target: 'Source' } }] },
                returnProperies: ['out_CrossReferenceOf'],
                target: 'Feature',
            });
            geneRid = hgncRecord.out_CrossReferenceOf[0].in;
        } else {
            logger.info(`skip unrecognized concept id: ${conceptId}`);
            counts.skip++;
        }

        if (geneRid !== undefined) {
            logger.info(`success find geneRid ${geneRid}`);
            await conn.addRecord({
                content: {
                    actionType: interactionType,
                    in: rid(drug),
                    out: geneRid,
                    source: rid(source),
                    uuid: id, // use the input uuid as the uuid rather than generating one
                },
                existsOk: true,
                fetchExisting: false,
                target: 'TargetOf',
            });
        }
    }
};


const upload = async ({ conn, url = BASE_URL }) => {
    logger.info('creating the source record');
    const source = rid(await conn.addSource(SOURCE_DEFN));
    const limit = 100;
    const counts = { error: 0, skip: 0, success: 0 };

    logger.info('pre-loading the chembl drug list');
    await _chembl.preLoadCache(conn);
    let endCursor = '',
        hasNextPage = true;

    while (hasNextPage) {
        const resp = await request({
            body: {
                query: `{
                    drugs(first:${limit}${endCursor}) {
                    pageInfo {
                        endCursor
                        hasNextPage
                    }
                    pageCount
                    edges {
                        cursor
                        node {
                        id
                        conceptId
                        interactions {
                            gene {
                            name
                            conceptId
                            longName
                            }
                            interactionTypes {
                            type
                            }
                        }
                        }
                    }
                    }
                }`,
            },
            json: true,
            method: 'POST',
            uri: url,
        });

        const { data: { drugs: { edges, pageInfo } } } = resp;

        endCursor = ` after:"${pageInfo.endCursor}"`;
        hasNextPage = pageInfo.hasNextPage;

        for (const record of edges) {
            logger.info(`processing ${record.cursor}`);
            if (record.cursor == "NDI"){
                logger.info(`processing ${record.cursor}`);
            }
            try {
                await processRecord({ conn, record, source, counts });
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
    dependencies: [_entrezGene.SOURCE_DEFN.name, _chembl.SOURCE_DEFN.name],
    upload,
};
