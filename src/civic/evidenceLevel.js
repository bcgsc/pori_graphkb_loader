/**
 * 1-5 : https://docs.civicdb.org/en/latest/model/evidence/evidence_rating.html
 * A-E : https://docs.civicdb.org/en/latest/model/evidence/level.html
*/
const VOCAB = {
    1: 'Claim is not supported well by experimental evidence. Results are not reproducible, or have very small sample size. No follow-up is done to validate novel claims.',
    2: 'Evidence is not well supported by experimental data, and little follow-up data is available. Publication is from a journal with low academic impact. Experiments may lack proper controls, have small sample size, or are not statistically convincing.',
    3: 'Evidence is convincing, but not supported by a breadth of experiments. May be smaller scale projects, or novel results without many follow-up experiments. Discrepancies from expected results are explained and not concerning.',
    4: 'Strong, well supported evidence. Experiments are well controlled, and results are convincing. Any discrepancies from expected results are well-explained and not concerning.',
    5: 'Strong, well supported evidence from a lab or journal with respected academic standing. Experiments are well controlled, and results are clean and reproducible across multiple replicates. Evidence confirmed using independent methods. The study is statistically well powered.',
    A: 'Proven/consensus association in human medicine.',
    B: 'Clinical trial or other primary patient data supports association.',
    C: 'Individual case reports from clinical journals.',
    D: 'In vivo or in vitro models support association.',
    E: 'Indirect evidence.',
    url: 'https://docs.civicdb.org/en/latest/model/evidence.html',
};

const EVIDENCE_LEVEL_CACHE = {};

/**
 * Fetch an evidence level, and add it if there is not an existing record
 *
 * @param {ApiConnection} conn graphkb API connector
 * @param {object} param1
 * @param {object} param1.rawRecord an EvidenceItem record from CIViC
 * @param {object} param1.source the CIViC source rid in GraphKB
 * @returns {object} an EvidenceLevel recors from GraphKB
 */
const getEvidenceLevel = async (conn, { rawRecord, source, sourceDisplayName }) => {
    // get the evidenceLevel
    let level = `${rawRecord.evidenceLevel}${rawRecord.evidenceRating || ''}`.toLowerCase();

    if (EVIDENCE_LEVEL_CACHE[level] === undefined) {
        level = await conn.addRecord({
            content: {
                description: `${VOCAB[rawRecord.evidenceLevel]} ${VOCAB[rawRecord.evidenceRating] || ''}`,
                displayName: `${sourceDisplayName} ${level.toUpperCase()}`,
                name: level,
                source,
                sourceId: level,
                url: VOCAB.url,
            },
            existsOk: true,
            fetchConditions: {
                AND:
                    [{ sourceId: level }, { name: level }, { source }],
            },
            target: 'EvidenceLevel',

        });
        EVIDENCE_LEVEL_CACHE[level.sourceId] = level;
    } else {
        level = EVIDENCE_LEVEL_CACHE[level];
    }
    return level;
};

module.exports = { getEvidenceLevel };
