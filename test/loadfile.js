const path = require('path');

const diseaseOntology = require('../src/disease_ontology');
const drugbank = require('../src/drugbank');
const {rid} = require('../src/util');

const api = {
    addRecord: jest.fn().mockImplementation(async ({content}) => content),
    getUniqueRecordBy: jest.fn().mockImplementation(async ({where}) => where)
};


jest.mock('../src/util', () => {
    const original = require.requireActual('../src/util');
    return {...original, requestWithRetry: jest.fn()};
});


afterEach(() => {
    jest.clearAllMocks();
});


describe('diseaseOntology', () => {
    test('uploadFile', async () => {
        const filename = path.join(__dirname, 'data/doid.sample.json');
        await diseaseOntology.uploadFile({conn: api, filename});
        expect(api.addRecord).toHaveBeenCalled();
    });
});

describe('drugBank', () => {
    test('uploadFile', async () => {
        const filename = path.join(__dirname, 'data/drugbank_sample.xml');
        await drugbank.uploadFile({conn: api, filename});
        expect(api.addRecord).toHaveBeenCalled();
        expect(api.addRecord).toHaveBeenNthCalledWith(2, {
            target: 'therapies',
            content: {
                source: rid(drugbank.SOURCE_DEFN),
                sourceId: 'DB00530',
                name: 'Erlotinib',
                molecularFormula: 'C22H23N3O4',
                iupacName: 'N-(3-ethynylphenyl)-6,7-bis(2-methoxyethoxy)quinazolin-4-amine',
                sourceIdVersion: '2019-07-02',
                mechanismOfAction: 'The mechanism of clinical antitumor action of erlotinib is not fully characterized. Erlotinib inhibits the intracellular phosphorylation of tyrosine kinase associated with the epidermal growth factor receptor (EGFR). Specificity of inhibition with regard to other tyrosine kinase receptors has not been fully characterized. EGFR is expressed on the cell surface of normal cells and cancer cells.',
                description: 'Erlotinib is an inhibitor of the epidermal growth factor receptor (EGFR) tyrosine kinase that is used in the treatment of non-small cell lung cancer, pancreatic cancer and several other types of cancer. It is typically marketed under the trade name Tarceva. Erlotinib binds to the epidermal growth factor receptor (EGFR) tyrosine kinase in a reversible fashion at the adenosine triphosphate (ATP) binding site of the receptor. Recent studies demonstrate that erlotinib is also a potent inhibitor of JAK2V617F, which is a mutant form of tyrosine kinase JAK2 found in most patients with polycythemia vera (PV) and a substantial proportion of patients with idiopathic myelofibrosis or essential thrombocythemia. This finding introduces the potential use of erlotinib in the treatment of JAK2V617F-positive PV and other myeloproliferative disorders.'
            },
            existsOk: true,
            fetchConditions: {
                sourceIdVersion: '2019-07-02',
                source: rid(drugbank.SOURCE_DEFN),
                sourceId: 'DB00530',
                name: 'Erlotinib'
            }
        });
    });
});
