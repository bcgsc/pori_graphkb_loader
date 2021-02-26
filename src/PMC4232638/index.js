const readXlsxFile = require('read-excel-file/node');

const { logger } = require('../logging');
const { rid } = require('../graphkb');
const _pubmed = require('../entrez/pubmed');


const uploadFile = async ({ conn, filename, errorLogPrefix }) => {
    logger.info('retrieve the publication');
    const publication = rid((await _pubmed.fetchAndLoadByIds(conn, ['PMC4232638']))[0]);
    const rawData = await readXlsxFile(filename, { sheet: 'Additional file 2' });
    const header = [];
    let lastSuperHeader;

    for (let i = 0; i < rawData[0].length; i++) {
        const superCol = rawData[1][i];
        const col = rawData[2][i];

        if (superCol !== null) {
            lastSuperHeader = superCol;
        }
        if (!col) {
            header.push(superCol);
        } else {
            header.push(`${lastSuperHeader} - ${col}`);
        }
    }
    const rows = [];

    for (const rawRow of rawData.slice(3)) {
        const row = {};
        rawRow.forEach((v, i) => {
            if (v !== '----' && v !== null) {
                row[header[i]] = v;
            }
        });

        if (row['Functional classification'] === 'non-neutral') {
            rows.push(row);
        }
    }
    console.log('total functional statements', rows.length);
    // console.log(rawData[2]);
    console.log('possible GoFs', rows.filter(row => row['Functional categories for oncogenes/ new cancer genes - Ability to immortalize or transform human or murine cells (e.g. MCF10A, BaF3, NIH3T3), anchorage-independent growth'] === 'yes' && row.Type === 'Oncogene').length);
    console.log('possible LoFs', rows.filter(row => row['Functional categories for oncogenes/ new cancer genes - Ability to immortalize or transform human or murine cells (e.g. MCF10A, BaF3, NIH3T3), anchorage-independent growth'] === 'yes' && row.Type === 'Tumour Suppressor').length);
};

module.exports = {
    SOURCE_DEFN: {}, kb: true, uploadFile,
};
