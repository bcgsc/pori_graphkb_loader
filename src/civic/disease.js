const { orderPreferredOntologyTerms } = require('../graphkb');

/**
 * Given a CIViC EvidenceItem record with its disease property,
 * returns the corresponding disease record from GraphKB
 *
 * @param {ApiConnection} conn graphkb API connector
 * @param {object} param1
 * @param {object} param1.rawRecord the EvidenceItem from CIViC
 * @returns {object} the disease record from GraphKB
 */
const getDisease = async (conn, { rawRecord }) => {
    let disease;

    // Get corresponding GraphKB Disease by it's doid (disease ontology id)
    if (rawRecord.disease) {
        let diseaseQueryFilters = {};

        if (rawRecord.disease.doid) {
            diseaseQueryFilters = {
                AND: [
                    { sourceId: `doid:${rawRecord.disease.doid}` },
                    { source: { filters: { name: 'disease ontology' }, target: 'Source' } },
                ],
            };
        } else {
            diseaseQueryFilters = { name: rawRecord.disease.name };
        }

        disease = await conn.getUniqueRecordBy({
            filters: diseaseQueryFilters,
            sort: orderPreferredOntologyTerms,
            target: 'Disease',
        });
    }
    return disease;
};

module.exports = {
    getDisease,
};
