const fs = require('fs');
const { logger } = require('../logging');
const { request } = require('../util');

const uri = 'https://civicdb.org/api/graphql';


const queryApiV2 = async (opt) => {
    try {
        return await request({
            body: { ...opt },
            json: true,
            method: 'POST',
            uri,
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
};


const getAllPages = async (opt) => {
    const allPages = [];
    let hasNextPage = true;

    while (hasNextPage) {
        const page = await queryApiV2(opt);
        allPages.push({ ...page });
        opt.variables = { ...opt.variables, after: page.data.evidenceItems.pageInfo.endCursor };
        hasNextPage = page.data.evidenceItems.pageInfo.hasNextPage;
    }
    return allPages;
};


const getEvidenceItems = async (filter) => {
    try {
        const query = fs.readFileSync(`${process.cwd()}/src/civic/evidenceItemsQuery.graphql`).toString();
        const pagesize = 25;
        const allPages = await getAllPages({ query, variables: { ...filter, first: pagesize } });

        // Concatenate nodes
        const nodes = [];
        allPages.forEach(el => {
            nodes.push(...el.data.evidenceItems.nodes);
        });
        const data = { ...allPages[0] };
        data.data.evidenceItems.nodes = nodes;

        // For now, Write data to file & log infos
        fs.writeFileSync(`${process.cwd()}/src/civic/evidenceItemsData.json`, JSON.stringify(data));
        logger.info(`
            totalCount: ${data.data.evidenceItems.totalCount}
            pagesize: ${pagesize}
            pageCount: ${data.data.evidenceItems.pageCount}
        `);
        return data;
    } catch (err) {
        logger.error(err);
        throw err;
    }
};


// Querring CIVIC v2 Api
const filter = { diseaseId: 20 };
getEvidenceItems(filter)
    .then(data => {
        logger.info(`
            NbNodes: ${data.data.evidenceItems.nodes.length}
        `);
    });


module.exports = {
    getAllPages,
    getEvidenceItems,
    queryApiV2,
};
