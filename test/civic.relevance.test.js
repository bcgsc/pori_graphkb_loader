const { translateRelevance } = require('../src/civic/relevance');

describe('translateRelevance', () => {
    test.each([
        ['DOES_NOT_SUPPORT', 'FUNCTIONAL', 'DOMINANT_NEGATIVE', 'no dominant negative'],
        ['DOES_NOT_SUPPORT', 'FUNCTIONAL', 'GAIN_OF_FUNCTION', 'no gain of function'],
        ['DOES_NOT_SUPPORT', 'FUNCTIONAL', 'NEOMORPHIC', 'no neomorphic'],
        ['DOES_NOT_SUPPORT', 'ONCOGENIC', 'ONCOGENICITY', 'likely benign'],
        ['DOES_NOT_SUPPORT', 'PREDICTIVE', 'RESISTANCE', 'no resistance'],
        ['DOES_NOT_SUPPORT', 'PREDICTIVE', 'SENSITIVITYRESPONSE', 'no response'],
        ['SUPPORTS', 'DIAGNOSTIC', 'NEGATIVE', 'opposes diagnosis'],
        ['SUPPORTS', 'DIAGNOSTIC', 'POSITIVE', 'favours diagnosis'],
        ['SUPPORTS', 'FUNCTIONAL', 'DOMINANT_NEGATIVE', 'dominant negative'],
        ['SUPPORTS', 'FUNCTIONAL', 'GAIN_OF_FUNCTION', 'gain of function'],
        ['SUPPORTS', 'FUNCTIONAL', 'LOSS_OF_FUNCTION', 'loss of function'],
        ['SUPPORTS', 'FUNCTIONAL', 'NEOMORPHIC', 'neomorphic'],
        ['SUPPORTS', 'FUNCTIONAL', 'UNALTERED_FUNCTION', 'unaltered function'],
        ['SUPPORTS', 'ONCOGENIC', 'ONCOGENICITY', 'likely oncogenic'],
        ['SUPPORTS', 'PREDICTIVE', 'ADVERSE_RESPONSE', 'adverse response'],
        ['SUPPORTS', 'PREDICTIVE', 'REDUCED_SENSITIVITY', 'reduced sensitivity'],
        ['SUPPORTS', 'PREDICTIVE', 'RESISTANCE', 'resistance'],
        ['SUPPORTS', 'PREDICTIVE', 'SENSITIVITYRESPONSE', 'sensitivity'],
        ['SUPPORTS', 'PREDISPOSING', 'LIKELY_PATHOGENIC', 'likely pathogenic'],
        ['SUPPORTS', 'PREDISPOSING', 'PATHOGENIC', 'pathogenic'],
        ['SUPPORTS', 'PREDISPOSING', 'POSITIVE', 'predisposing'],
        ['SUPPORTS', 'PREDISPOSING', 'PREDISPOSITION', 'likely predisposing'],
        ['SUPPORTS', 'PREDISPOSING', 'PROTECTIVENESS', 'likely protective'],
        ['SUPPORTS', 'PREDISPOSING', 'UNCERTAIN_SIGNIFICANCE', 'likely predisposing'],
        ['SUPPORTS', 'PROGNOSTIC', 'BETTER_OUTCOME', 'favourable prognosis'],
        ['SUPPORTS', 'PROGNOSTIC', 'POOR_OUTCOME', 'unfavourable prognosis'],
        ['NA', 'ONCOGENIC', 'NA', 'likely oncogenic'],
        ['NA', 'PREDISPOSING', 'NA', 'likely predisposing'],
    ])(
        '%s|%s|%s returns %s', (evidenceDirection, evidenceType, clinicalSignificance, expected) => {
            expect(translateRelevance(evidenceType, evidenceDirection, clinicalSignificance)).toEqual(expected);
        },
    );

    test.each([
        // Test cases that should throw an error
        ['DOES_NOT_SUPPORT', 'DIAGNOSTIC', 'POSITIVE'],
        ['DOES_NOT_SUPPORT', 'DIAGNOSTIC', 'NEGATIVE'],
        ['DOES_NOT_SUPPORT', 'DIAGNOSTIC', '--'],
        ['DOES_NOT_SUPPORT', 'FUNCTIONAL', 'LOSS_OF_FUNCTION'],
        ['DOES_NOT_SUPPORT', 'FUNCTIONAL', 'UNALTERED_FUNCTION'],
        ['DOES_NOT_SUPPORT', 'FUNCTIONAL', 'UNKNOWNED'],
        ['DOES_NOT_SUPPORT', 'FUNCTIONAL', '--'],
        ['DOES_NOT_SUPPORT', 'ONCOGENIC', 'PROTECTIVENESS'],
        ['DOES_NOT_SUPPORT', 'ONCOGENIC', '--'],
        ['DOES_NOT_SUPPORT', 'PREDICTIVE', 'ADVERSE_RESPONSE'],
        ['DOES_NOT_SUPPORT', 'PREDICTIVE', 'NA'],
        ['DOES_NOT_SUPPORT', 'PREDICTIVE', 'REDUCED_SENSITIVITY'],
        ['DOES_NOT_SUPPORT', 'PREDICTIVE', '--'],
        ['DOES_NOT_SUPPORT', 'PREDISPOSING', 'PREDISPOSITION'],
        ['DOES_NOT_SUPPORT', 'PREDISPOSING', 'PROTECTIVENESS'],
        ['DOES_NOT_SUPPORT', 'PREDISPOSING', '--'],
        ['DOES_NOT_SUPPORT', 'PROGNOSTIC', 'BETTER_OUTCOME'],
        ['DOES_NOT_SUPPORT', 'PROGNOSTIC', 'NA'],
        ['DOES_NOT_SUPPORT', 'PROGNOSTIC', 'POOR_OUTCOME'],
        ['DOES_NOT_SUPPORT', 'PROGNOSTIC', '--'],
        ['DOES_NOT_SUPPORT', '--', '--'],
        ['SUPPORTS', 'DIAGNOSTIC', '--'],
        ['SUPPORTS', 'FUNCTIONAL', 'UNKNOWNED'],
        ['SUPPORTS', 'FUNCTIONAL', '--'],
        ['SUPPORTS', 'ONCOGENIC', 'PROTECTIVENESS'],
        ['SUPPORTS', 'ONCOGENIC', '--'],
        ['SUPPORTS', 'PREDICTIVE', 'NA'],
        ['SUPPORTS', 'PREDICTIVE', '--'],
        ['SUPPORTS', 'PREDISPOSING', '--'],
        ['SUPPORTS', 'PROGNOSTIC', 'NA'],
        ['SUPPORTS', 'PROGNOSTIC', '--'],
        ['SUPPORTS', '--', '--'],
        ['NA', '--', '--'],
        ['--', '--', '--'],
    ])(
        '%s|%s|%s errors', (evidenceDirection, evidenceType, clinicalSignificance) => {
            expect(() => translateRelevance(evidenceType, evidenceDirection, clinicalSignificance)).toThrow('unable to process relevance');
        },
    );
});
