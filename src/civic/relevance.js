//const { error: { ErrorMixin } } = require('@bcgsc-pori/graphkb-parser');
const {ParsingError, ErrorMixin, InputValidationError } = require('@bcgsc-pori/graphkb-parser');

class NotImplementedError extends ErrorMixin { }

const RELEVANCE_CACHE = {};


/**
 * Extract the appropriate GraphKB relevance term from a CIViC evidence record
 */
const translateRelevance = (evidenceType, evidenceDirection, significance) => {
    if (evidenceDirection === 'DOES_NOT_SUPPORT') {
        switch (evidenceType) {
            case 'DIAGNOSTIC': {
                switch (significance) {
                    case 'NEGATIVE': {
                        break;
                    }

                    case 'POSITIVE': {
                        break;
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'FUNCTIONAL': {
                switch (significance) {
                    case 'DOMINANT_NEGATIVE': {
                        return 'no dominant negative';
                    }

                    case 'GAIN_OF_FUNCTION': {
                        return 'no gain of function';
                    }

                    case 'LOSS_OF_FUNCTION': {
                        break;
                    }

                    case 'NEOMORPHIC': {
                        return 'no neomorphic';
                    }

                    case 'UNALTERED_FUNCTION': {
                        break;
                    }

                    case 'UNKNOWNED': {
                        break;
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'ONCOGENIC': {
                switch (significance) {
                    case 'ONCOGENICITY': {
                        return 'likely benign';
                    }

                    case 'PROTECTIVENESS': {
                        break;
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'PREDICTIVE': {
                switch (significance) {
                    case 'ADVERSE_RESPONSE': {
                        break;
                    }

                    case 'NA': {
                        break;
                    }

                    case 'REDUCED_SENSITIVITY': {
                        break;
                    }

                    case 'RESISTANCE': {
                        return 'no resistance';
                    }

                    case 'SENSITIVITYRESPONSE': {
                        return 'no response';
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'PREDISPOSING': {
                switch (significance) {
                    case 'PREDISPOSITION': {
                        break;
                    }

                    case 'PROTECTIVENESS': {
                        break;
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'PROGNOSTIC': {
                switch (significance) {
                    case 'BETTER_OUTCOME': {
                        break;
                    }

                    case 'NA': {
                        break;
                    }

                    case 'POOR_OUTCOME': {
                        break;
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            default: {
                break;
            }
        }
    } else if (evidenceDirection === 'SUPPORTS') {
        switch (evidenceType) {
            case 'DIAGNOSTIC': {
                switch (significance) {
                    case 'NEGATIVE': {
                        return 'opposes diagnosis';
                    }

                    case 'POSITIVE': {
                        return 'favours diagnosis';
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'FUNCTIONAL': {
                switch (significance) {
                    case 'DOMINANT_NEGATIVE': {
                        return 'dominant negative';
                    }

                    case 'GAIN_OF_FUNCTION': {
                        return 'gain of function';
                    }

                    case 'LOSS_OF_FUNCTION': {
                        return 'loss of function';
                    }

                    case 'NEOMORPHIC': {
                        return 'neomorphic';
                    }

                    case 'UNALTERED_FUNCTION': {
                        return 'unaltered function';
                    }

                    case 'UNKNOWNED': {
                        break;
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'ONCOGENIC': {
                switch (significance) {
                    case 'ONCOGENICITY': {
                        return 'likely oncogenic';
                    }

                    case 'PROTECTIVENESS': {
                        break;
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'PREDICTIVE': {
                switch (significance) {
                    case 'ADVERSE_RESPONSE': {
                        return 'adverse response';
                    }

                    case 'NA': {
                        break;
                    }

                    case 'REDUCED_SENSITIVITY': {
                        return 'reduced sensitivity';
                    }

                    case 'RESISTANCE': {
                        return 'resistance';
                    }

                    case 'SENSITIVITYRESPONSE': {
                        return 'sensitivity';
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'PREDISPOSING': {
                switch (significance) {
                    case 'LIKELY_PATHOGENIC': { // Deprecated term
                        return 'likely pathogenic';
                    }

                    case 'PATHOGENIC': { // Deprecated term
                        return 'pathogenic';
                    }

                    case 'POSITIVE': { // Deprecated term
                        return 'predisposing';
                    }

                    case 'PREDISPOSITION': {
                        return 'likely predisposing';
                    }

                    case 'PROTECTIVENESS': {
                        return 'likely protective';
                    }

                    case 'UNCERTAIN_SIGNIFICANCE': { // Deprecated term
                        return 'likely predisposing';
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            case 'PROGNOSTIC': {
                switch (significance) {
                    case 'BETTER_OUTCOME': {
                        return 'favourable prognosis';
                    }

                    case 'NA': {
                        break;
                    }

                    case 'POOR_OUTCOME': {
                        return 'unfavourable prognosis';
                    }

                    default: {
                        break;
                    }
                }
                break;
            }

            default: {
                break;
            }
        }
    }

    // Addressing some NAs combinations
    if (evidenceDirection === 'NA' && significance === 'NA') { // Deprecated term for both field
        switch (evidenceType) {
            case 'PREDISPOSING': {
                return 'likely predisposing';
            }

            case 'ONCOGENIC': {
                return 'likely oncogenic';
            }

            default: {
                break;
            }
        }
    }

    // If combination of evidenceDirection, evidenceType and significance not supported
    throw new NotImplementedError(
        `unable to process relevance (${JSON.stringify(
            { evidenceDirection, evidenceType, significance },
        )})`,
    );
};

/**
 * Convert the CIViC relevance types to GraphKB terms
 */
const getRelevance = async (conn, { rawRecord }) => {
    // translate the type to a GraphKB vocabulary term
    let relevance = translateRelevance(
        rawRecord.evidenceType,
        rawRecord.evidenceDirection,
        rawRecord.significance,
    ).toLowerCase();

    if (RELEVANCE_CACHE[relevance] === undefined) {
        relevance = await conn.getVocabularyTerm(relevance);
        RELEVANCE_CACHE[relevance.name] = relevance;
    } else {
        relevance = RELEVANCE_CACHE[relevance];
    }
    return relevance;
};

module.exports = {
    getRelevance,
    translateRelevance,
};
