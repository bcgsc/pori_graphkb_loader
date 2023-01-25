

const { error: { ErrorMixin } } = require('@bcgsc-pori/graphkb-parser');

class NotImplementedError extends ErrorMixin { }


/**
 * Extract the appropriate GraphKB relevance term from a CIViC evidence record
 */
const translateRelevance = (evidenceType, evidenceDirection, significance) => {
    if (evidenceDirection === 'DOES_NOT_SUPPORT') {
        switch (evidenceType) { // eslint-disable-line default-case
            case 'DIAGNOSTIC': {
                // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                // "The experiment or study does not support the variant’s impact on diagnosis of disease or subtype"
                switch (significance) { // eslint-disable-line default-case
                    case 'NEGATIVE': {
                        // 2 cases
                        break;
                    }

                    case 'POSITIVE': {
                        // 11 cases
                        break;
                    }
                }
                break;
            }

            case 'FUNCTIONAL': {
                // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                // "The experiment or study does not support this variant causing alteration or non-alteration of the gene product function"
                switch (significance) { // eslint-disable-line default-case
                    case 'DOMINANT_NEGATIVE': {
                        // 83 cases to address
                        break;
                    }

                    case 'GAIN_OF_FUNCTION': {
                        // 11 cases to address
                        break;
                    }

                    case 'LOSS_OF_FUNCTION': {
                        // 2 cases to address
                        break;
                    }

                    case 'NEOMORPHIC': {
                        // 6 cases
                        break;
                    }

                    case 'UNALTERED_FUNCTION': {
                        // No case so far
                        break;
                    }

                    case 'UNKNOWNED': {
                        // 1 case (to address?)
                        break;
                    }
                }
                break;
            }

            case 'ONCOGENIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'ONCOGENICITY': {
                        // 3 cases to address
                        // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                        // "The experiment or study may contribute to a benign classification (final determination at the Assertion level)"
                        break;
                    }

                    case 'PROTECTIVENESS': {
                        // No cases so far
                        break;
                    }
                }
                break;
            }

            case 'PREDICTIVE': {
                // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                // "The experiment or study does not support, or was inconclusive of an interaction between the variant and a drug"
                switch (significance) { // eslint-disable-line default-case
                    case 'ADVERSE_RESPONSE': {
                        // 1 case to address
                        break;
                    }

                    case 'NA': {
                        // 2 cases
                        // According to https://civic.readthedocs.io/en/latest/model/evidence/significance.html
                        // "Variant does not inform clinical interepretation"
                        break;
                    }

                    case 'REDUCED_SENSITIVITY': {
                        // 2 cases to address
                        break;
                    }

                    case 'RESISTANCE': {
                        return 'no resistance';
                    }

                    case 'SENSITIVITYRESPONSE': {
                        return 'no response';
                    }
                }
                break;
            }

            case 'PREDISPOSING': {
                switch (significance) { // eslint-disable-line default-case
                    case 'LIKELY_PATHOGENIC': {
                        // 1 case to address. Should not append according to CIViC docs
                        break;
                    }

                    case 'POSITIVE': {
                        // 1 case. Should not append according to CIViC docs
                        break;
                    }

                    case 'PREDISPOSITION': {
                        // 2 cases to address
                        // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                        // "The experiment or study may contribute to a benign classification (final determination at the Assertion level)"
                        break;
                    }

                    case 'PROTECTIVENESS': {
                        // No case so far
                        break;
                    }
                }
                break;
            }

            case 'PROGNOSTIC': {
                // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                // "The experiment or study does not support a prognostic association between variant and outcome"
                switch (significance) { // eslint-disable-line default-case
                    case 'BETTER_OUTCOME': {
                        // 4 case to address.
                        break;
                    }

                    case 'NA': {
                        // 38 cases (to address?)
                        // According to https://civic.readthedocs.io/en/latest/model/evidence/significance.html
                        // "The N/A option can be used to imply that the variant does not have an impact on patient prognosis."
                        break;
                    }

                    case 'POOR_OUTCOME': {
                        // 34 cases
                        break;
                    }
                }
                break;
            }
        }
    } else if (evidenceDirection === 'SUPPORTS') {
        switch (evidenceType) { // eslint-disable-line default-case
            // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
            // "The experiment or study supports variant’s impact on the diagnosis of disease or subtype"
            case 'DIAGNOSTIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'NA': {
                        // 9 cases (to address? 'POSITIVE' implied?). Should not append according to CIViC docs
                        break;
                    }

                    case 'NEGATIVE': {
                        return 'opposes diagnosis';
                    }

                    case 'POSITIVE': {
                        return 'favours diagnosis';
                    }
                }
                break;
            }

            case 'FUNCTIONAL': {
                // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                // "The experiment or study supports this variant causing alteration or non-alteration of the gene product function"
                switch (significance) { // eslint-disable-line default-case
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
                        // No case so far
                        break;
                    }
                }
                break;
            }

            case 'ONCOGENIC': {
                switch (significance) { // eslint-disable-line default-case
                    case 'ONCOGENICITY': {
                        // 92 cases.
                        // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                        // "The experiment or study may contribute to an oncogenic classification (final determination at the Assertion level)"
                        // So far, only OncoKB and IPRKB had statement of relevance 'oncogenic'.
                        // Needs confirmation !!
                        return 'oncogenic';
                    }

                    case 'PROTECTIVENESS': {
                        // No case so far
                        break;
                    }
                }
                break;
            }

            case 'PREDICTIVE': {
                // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                // "The experiment or study supports this variant’s response to a drug"
                switch (significance) { // eslint-disable-line default-case
                    case 'ADVERSE_RESPONSE': {
                        return 'adverse response';
                    }

                    case 'NA': {
                        // According to https://civic.readthedocs.io/en/latest/model/evidence/significance.html
                        // "Variant does not inform clinical interepretation"
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
                }
                break;
            }

            case 'PREDISPOSING': {
                switch (significance) { // eslint-disable-line default-case
                    case 'LIKELY_PATHOGENIC': {
                        // 23 cases. Should not append according to CIViC docs
                        return 'likely pathogenic';
                    }

                    case 'NA': {
                        // 3 cases. Should not append according to CIViC docs
                        // Similar to 'UNCERTAIN_SIGNIFICANCE' ?
                        // Needs confirmation !!
                        return 'likely predisposing';
                    }

                    case 'PATHOGENIC': {
                        // 13 cases. Should not append according to CIViC docs
                        return 'pathogenic';
                    }

                    case 'POSITIVE': {
                        // 3 cases. Should not append according to CIViC docs
                        return 'predisposing';
                    }

                    case 'PREDISPOSITION': {
                        // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                        // "The experiment or study may contribute to a pathogenic classification (final determination at the Assertion level)"
                        return 'predisposing';
                    }

                    case 'PROTECTIVENESS': {
                        // No case so far
                        break;
                    }

                    case 'UNCERTAIN_SIGNIFICANCE': {
                        // 1267 cases. Should not append according to CIViC docs
                        return 'likely predisposing';
                    }
                }
                break;
            }

            case 'PROGNOSTIC': {
                // According to https://docs.civicdb.org/en/latest/model/evidence/direction.html
                // "The experiment or study supports a variant’s impact on prognostic outcome"
                switch (significance) { // eslint-disable-line default-case
                    case 'BETTER_OUTCOME': {
                        return 'favourable prognosis';
                    }

                    case 'NA': {
                        // 9 cases (to address?)
                        // According to https://civic.readthedocs.io/en/latest/model/evidence/significance.html
                        // "The N/A option can be used to imply that the variant does not have an impact on patient prognosis."
                        break;
                    }

                    case 'POOR_OUTCOME': {
                        return 'unfavourable prognosis';
                    }

                    case 'POSITIVE': {
                        // 1 case. Should not append according to CIViC docs
                        return 'favourable prognosis';
                    }
                }
                break;
            }
        }
    }

    // Addressing some NAs combinations
    if (evidenceDirection === 'NA' && significance === 'NA') {
        switch (evidenceType) { // eslint-disable-line default-case
            case 'PREDISPOSING': {
                // 1116 cases. Should not append according to CIViC docs
                // Similar to 'SUPPORT'+'PREDISPOSING'+'UNCERTAIN_SIGNIFICANCE' ?
                return 'likely predisposing'; // Needs confirmation !! Used to be tested as an error
            }

            case 'ONCOGENIC': {
                // 166 cases (to address?)
                // Similar to 'SUPPORT'+'ONCOGENIC'+'ONCOGENICITY' ?
                // Needs confirmation !!
                return 'oncogenic';
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
const getRelevance = async ({ rawRecord, conn }) => {
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
