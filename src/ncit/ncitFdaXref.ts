/**
 * Loads the xref file defined here: https://evs.nci.nih.gov/ftp1/FDA/UNII/Archive/
 * which defines a mapping of NCIt to UNII terms
 */

import { loadDelimToJson } from '../util';
import { logger } from '../logging';
import sourceDefns from '../sources';
import { rid, orderPreferredOntologyTerms } from '../graphkb';


const COLUMNS = {
    ncitCode: 'NCI Concept Code',
    unii: 'FDA UNII Code (use for SPL)',
};


const uploadFile = async ({ conn, filename }) => {
    const data = (await loadDelimToJson(filename));
    logger.info(`loading ${data.length} mappings`);

    const fdaSourceRecord = await conn.addSource(sourceDefns.fdaSrs);

    const ncitSourceRecord = await conn.addSource(sourceDefns.ncit);

    const ncitBySourceId = {};
    const fdaBySourceId = {};
    const counts = { error: 0, success: 0 };

    for (const relationship of data) {
        const ncitCode = relationship[COLUMNS.ncitCode];
        const unii = relationship[COLUMNS.unii];

        if (!ncitBySourceId[ncitCode]) {
            try {
                ncitBySourceId[ncitCode] = await conn.getUniqueRecordBy({
                    filters: {
                        AND: [
                            { sourceId: ncitCode },
                            { source: rid(ncitSourceRecord) },
                        ],
                    },
                    sort: orderPreferredOntologyTerms,
                    target: 'Therapy',
                });
            } catch (err) {
                logger.error(err);
                counts.error++;
                continue;
            }
        }

        if (!fdaBySourceId[unii]) {
            try {
                fdaBySourceId[unii] = await conn.getUniqueRecordBy({
                    filters: {
                        AND: [
                            { sourceId: unii },
                            { source: rid(fdaSourceRecord) },
                        ],
                    },
                    sort: orderPreferredOntologyTerms,
                    target: 'Therapy',
                });
            } catch (err) {
                counts.error++;
                logger.error(err);
                continue;
            }
        }

        try {
            await conn.addRecord({
                content: {
                    in: rid(fdaBySourceId[unii]),
                    out: rid(ncitBySourceId[ncitCode]),
                    source: rid(ncitSourceRecord),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'CrossReferenceOf',
            });
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};


export { uploadFile };
