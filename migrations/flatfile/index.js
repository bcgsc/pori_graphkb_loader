/*
 * Migrates the data from the flatfiles to the graph database
 */

const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const fs = require('fs');
const {uploadDiseaseOntology} = require('./disease_ontology');
//const ensHg19 = require('./../ensembl69_hg19_annotations');
const {uploadHugoGenes} = require('./hgnc');
const {uploadKbFlatFile} = require('./kb');
const {uploadUberon} = require('./uberon');
const {uploadNCIT} = require('./ncit');
const {uploadOncoTree} = require('./oncotree');
const {uploadDrugBank} = require('./drugbank');
const path = require('path');
const request = require('request-promise');
const {uploadRefSeq} = require('./refseq');
const {upload: uploadOncoKB} = require('./oncokb');
const {upload: uploadFDA} = require('./fda');
const {upload: uploadCivic} = require('./civic');
const {upload: uploadVocab} = require('./vocab');

const argumentError = (usage, msg) => {
    console.log(usage);
    console.error(`Argument Error: ${msg}\n`);
    process.exit(2);
};


const fileExists = (fileName) => {
    if (! fs.existsSync(fileName)) {
        throw new Error(`File does not exist: ${fileName}`);
    }
    return path.resolve(fileName);
};


const optionDefinitions = [
    {
        name: 'help',
        alias: 'h',
        description: 'Print this help menu'
    },
    {
        name: 'reference-flatfile',
        alias: 'r',
        description: 'The flatfile containing the kb entries',
        required: false,
        type: fileExists
    },
    {
        name: 'hugo',
        alias: 'g',
        description: 'Flag to indicate if we should try loading the hugo genes',
        type: fileExists
    },
    {
        name: 'disease-ontology',
        alias: 'd',
        type: fileExists,
        description: 'Flag to indicate if we should try loading the disease ontology'
    },
    {
        name: 'host',
        default: '127.0.0.1',
        description: 'server hosting the KB API',
        required: true
    },
    {
        name: 'port',
        type: parseInt,
        default: 8080,
        required: true,
        description: 'port number for the server hosting the KB API'
    },
    {
        name: 'username',
        default: process.env.KB_USER || process.env.USER,
        required: true,
        description: 'ldap username required for access to the kb (KB_USER)'
    },
    {
        name: 'password',
        default: process.env.KB_PASSWORD,
        required: true,
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
    }
];

const usage = commandLineUsage([
    {
        header: 'Initial Migration',
        content: 'Migrates the data from the flatfiles into the KB graph structure'
    },
    {
        header: 'Options',
        optionList: optionDefinitions
    }
]);

let options;
try {
    options = commandLineArgs(optionDefinitions);
} catch (err) {
    argumentError(usage, err.message);
}
// check if they are looking for the help menu
if (options.help !== undefined) {
    console.log(usage);
    process.exit(0);
}

// check all required arguments
for (let opt of optionDefinitions) {
    if (options[opt.name] === undefined) {
        if (opt.default !== undefined) {
            options[opt.name] = opt.default;
        } else if (opt.required) {
            argumentError(usage, `--${opt.name} is a required argument`);
        }
    }
}

/**
 * wrapper to make requests less verbose
 */
class ApiRequest {
    constructor(options) {
        this.baseUrl = `http://${options.host}:${options.port}/api/v${process.env.npm_package_version}`;
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
    if (options.vocab !== undefined) {
        await uploadVocab(apiConnection);
    }
    if (options['ncit']) {
        await uploadNCIT({conn: apiConnection, filename: options['ncit']});
    }
    if (options['fda']) {
        await uploadFDA({conn: apiConnection, filename: options['fda']});
    }
    if (options.drugbank) {
        await uploadDrugBank({conn: apiConnection, filename: options.drugbank});
    }
    if (options['disease-ontology']) {
        await uploadDiseaseOntology({conn: apiConnection, filename: options['disease-ontology']});
    }
    if (options['hugo']) {
        await uploadHugoGenes({conn: apiConnection,  filename: options['hugo']});
    }
    if (options['refseq']) {
        await uploadRefSeq({conn: apiConnection, filename: options['refseq']});
    }
    if (options['uberon']) {
        await uploadUberon({conn: apiConnection, filename: options['uberon']});
    }
    if (options.oncotree !== undefined) {
        await uploadOncoTree(apiConnection);
    }
    if (options['reference-flatfile']) {
        await uploadKbFlatFile({conn: apiConnection, filename: options['reference-flatfile']});
    }
    if (options.oncokb !== undefined) {
        await uploadOncoKB(apiConnection);
    }
    if (options.civic !== undefined) {
        await uploadCivic(apiConnection);
    }
};

upload();



