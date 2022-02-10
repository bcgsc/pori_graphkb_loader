const { pickEndpoint } = require('../src/ncit');

describe('pickEndpoint', () => {
    test.each([
        ['Some Anatomical Abnormality', 'Disease'],
        ['A Particular Anatomical Structure', 'AnatomicalEntity'],
        ['Prescribe Antibiotic', 'Therapy'],
    ])('Actual concept', (conceptName, output) => {
        expect(pickEndpoint(conceptName, '')).toBe(output);
    });

    test.each([
        ['Congenital Abnormality', 'Disease'],
        ['Body Location or Region', 'AnatomicalEntity'],
        ['Biologically Active Substance', 'Therapy'],
    ])('Parent concept fallback', (parentConcepts, output) => {
        expect(pickEndpoint('', parentConcepts)).toBe(output);
    });

    test('Both concept and parent do not correspond to any endpoint', () => {
        expect(() => pickEndpoint('A whale', 'A mammal'))
            .toThrow('Concept not implemented (A whale)');
    });

    test('Concept do not correspond to any endpoint and there is no parent', () => {
        expect(() => pickEndpoint('A demogorgon', ''))
            .toThrow('Concept not implemented (A demogorgon)');
    });
});
