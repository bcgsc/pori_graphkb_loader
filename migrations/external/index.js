/**
 * Migrates the data from the flatfiles to the graph database
 * @module
 * @ignore
 */

const request = require('request-promise');

const {fileExists, createOptionsMenu} = require('./../cli');

const IMPORT_MODULES = {};
IMPORT_MODULES.civic = require('./civic');
IMPORT_MODULES.cosmic = require('./cosmic');
IMPORT_MODULES.diseaseOntology = require('./disease_ontology');
IMPORT_MODULES.docm = require('./docm');
IMPORT_MODULES.drugbank = require('./drugbank');
IMPORT_MODULES.fda = require('./fda');
IMPORT_MODULES.hgnc = require('./hgnc');
IMPORT_MODULES.ncit = require('./ncit');
IMPORT_MODULES.oncokb = require('./oncokb');
IMPORT_MODULES.oncotree = require('./oncotree');
IMPORT_MODULES.refseq = require('./refseq');
IMPORT_MODULES.uberon = require('./uberon');
IMPORT_MODULES.vocab = require('./vocab');


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
        name: 'host',
        default: '127.0.0.1',
        description: 'server hosting the KB API',
        env: 'KB_HOST'
    },
    {
        name: 'port',
        type: Number,
        default: 8080,
        env: 'KB_PORT',
        description: 'port number for the server hosting the KB API'
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
        name: 'docm',
        description: 'load mutations from DOCM database api'
    }
];
const options = createOptionsMenu(optionDefinitions,
    {
        title: 'External Database Migration',
        description: 'Migrates the data from the flatfiles into the KB graph structure'
    });


/**
 * wrapper to make requests less verbose
 */
class ApiRequest {
    constructor(opt) {
        this.baseUrl = `http://${opt.host}:${opt.port}/api`;
        this.headers = {};
    }

    async setAuth({username, password}) {
        const token = await request({
            method: 'POST',
            uri: `${this.baseUrl}/token`,
            json: true,
            body: {username, password}
        });
        this.headers.Authorization = token.kbToken;
    }

    request(opt) {
        const req = {
            method: opt.method || 'GET',
            headers: this.headers,
            uri: `${this.baseUrl}/${opt.uri}`,
            json: true
        };
        if (opt.body) {
            req.body = opt.body;
        }
        if (opt.qs) {
            req.qs = opt.qs;
        }
        return req;
    }
}

const apiConnection = new ApiRequest(options);

const upload = async () => {
    await apiConnection.setAuth(options);
    console.log('Login Succeeded\n');
    const moduleOrder = [
        'vocab',
        'ncit',
        'fda',
        'drugbank',
        'diseaseOntology',
        'hgnc',
        'refseq',
        'uberon',
        'oncotree',
        'cosmic',
        'civic',
        'docm'
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
};

upload();
