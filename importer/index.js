/**
 * Migrates the data from the flatfiles to the graph database
 * @module importer
 * @ignore
 */

const {fileExists, createOptionsMenu} = require('./cli');

const {ApiConnection, PUBMED_DEFAULT_QS} = require('./util');
const {logger} = require('./logging');

const IMPORT_MODULES = {};
IMPORT_MODULES.civic = require('./civic');
IMPORT_MODULES.cosmic = require('./cosmic');
IMPORT_MODULES.diseaseOntology = require('./disease_ontology');
IMPORT_MODULES.docm = require('./docm');
IMPORT_MODULES.drugbank = require('./drugbank');
IMPORT_MODULES.ensembl = require('./ensembl');
IMPORT_MODULES.fda = require('./fda');
IMPORT_MODULES.hgnc = require('./hgnc');
IMPORT_MODULES.ipr = require('./ipr');
IMPORT_MODULES.ncit = require('./ncit');
IMPORT_MODULES.oncokb = require('./oncokb');
IMPORT_MODULES.oncotree = require('./oncotree');
IMPORT_MODULES.refseq = require('./refseq');
IMPORT_MODULES.sequenceOntology = require('./sequence_ontology');
IMPORT_MODULES.uberon = require('./uberon');
IMPORT_MODULES.vario = require('./vario');
IMPORT_MODULES.vocab = require('./vocab');
IMPORT_MODULES.ctg = require('./clinicaltrialsgov');
IMPORT_MODULES.mutsig = require('./cosmic/mutationSignatures');


const optionDefinitions = [
    {
        name: 'help',
        alias: 'h',
        description: 'Print this help menu'
    },
    {
        name: 'kb',
        description: 'The flatfile containing the kb entries',
        required: false,
        type: fileExists
    },
    {
        name: 'hgnc',
        alias: 'g',
        description: 'Flag to indicate if we should try loading the hugo genes',
        type: fileExists
    },
    {
        name: 'diseaseOntology',
        alias: 'd',
        type: fileExists,
        description: 'Flag to indicate if we should try loading the disease ontology'
    },
    {
        name: 'graphkb',
        default: `${process.env.KB_API_URL || 'https://graphkb-api.bcgsc.ca/api'}`,
        description: 'URL for the KB API',
        env: 'KB_API_URL'
    },
    {
        name: 'username',
        default: process.env.USER,
        required: true,
        description: 'ldap username required for access to the kb (KB_USER)',
        env: 'KB_USER'
    },
    {
        name: 'password',
        required: true,
        env: 'KB_PASSWORD',
        description: 'the password for access to the kb api (KB_PASSWORD)'
    },
    {
        name: 'pubmed',
        end: 'PUBMED_API_KEY',
        description: 'The pubmed API key to use for pubmed requests'
    },
    {
        name: 'uberon',
        alias: 'u',
        description: 'path to the uberon file to upload. Expected format is OWL',
        type: fileExists
    },
    {
        name: 'ncit',
        alias: 'n',
        description: 'path to the NCIT owl file to upload',
        type: fileExists
    },
    {
        name: 'oncotree',
        description: 'flag to indicate upload of oncotree latest stable release from their web API'
    },
    {
        name: 'drugbank',
        alias: 'b',
        description: 'path tp the drugbank xml file',
        type: fileExists
    },
    {
        name: 'refseq',
        description: 'path to the tab delmited refseq file',
        type: fileExists
    },
    {
        name: 'oncokb',
        description: 'path to the actionable variants JSON from oncokb'
    },
    {
        name: 'fda',
        alias: 'f',
        description: 'path to the FDA UNII list with NCIT linking metadata',
        type: fileExists
    },
    {
        name: 'ensembl',
        alias: 'e',
        description: 'path to the ensembl biomart export tab delimited file',
        type: fileExists
    },
    {
        name: 'civic',
        description: 'upload civic using their api'
    },
    {
        name: 'vocab',
        description: 'load the custom vocabulary terms and descriptions'
    },
    {
        name: 'cosmic',
        description: 'load the resistance mutations from cosmic (i.e. CosmicResitanceMutations.tsv)',
        type: fileExists
    },
    {
        name: 'mutsig',
        description: 'load the cosmic mutation signatures (ex. JSON file parsed from the COSMIC site)',
        type: fileExists
    },
    {
        name: 'ctg',
        description: 'load trials information from an XML export of a search result downloaded fomr clinicaltrials.gov',
        type: fileExists
    },
    {
        name: 'docm',
        description: 'load mutations from DOCM database api'
    },
    {
        name: 'vario',
        description: 'load the variation ontology file (OWL format)',
        type: fileExists
    },
    {
        name: 'sequenceOntology',
        alias: 's',
        description: 'path the sequence ontology owl file',
        type: fileExists
    },
    {
        name: 'ipr',
        description: 'path to the IPR CSV export file',
        type: fileExists
    }
];
const options = createOptionsMenu(optionDefinitions,
    {
        title: 'External Database Migration',
        description: 'Migrates the data from the flatfiles into the KB graph structure'
    });


const apiConnection = new ApiConnection(options.graphkb);

if (options.pubmed) {
    PUBMED_DEFAULT_QS.api_key = options.pubmed;
}

const upload = async () => {
    await apiConnection.setAuth(options);
    logger.info('Login Succeeded');
    const moduleOrder = [
        'vocab',
        'sequenceOntology',
        'vario',
        'ctg',
        'ncit',
        'fda',
        'drugbank',
        'diseaseOntology',
        'hgnc',
        'refseq',
        'ensembl',
        'uberon',
        'oncotree',
        'mutsig',
        'cosmic',
        'oncokb',
        'civic',
        'docm',
        'ipr'
    ];
    for (const moduleName of moduleOrder) {
        if (options[moduleName] !== undefined) {
            const currModule = IMPORT_MODULES[moduleName];
            if (currModule.uploadFile !== undefined) {
                await currModule.uploadFile({
                    conn: apiConnection,
                    filename: options[moduleName]
                });
            } else {
                await currModule.upload({
                    conn: apiConnection
                });
            }
        }
    }
    logger.info('upload complete');
};

upload();
