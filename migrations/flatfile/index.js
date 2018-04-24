/*
 * Migrates the data from the flatfiles to the graph database
 */

const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const fs = require('fs');
const { uploadDiseaseOntology } = require('./disease_ontology');
//const ensHg19 = require('./../ensembl69_hg19_annotations');
const { uploadHugoGenes } = require('./hgnc');
const _ = require('lodash');
const request = require('request-promise');

const PERM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Im5hbWUiOiJhZG1pbiIsIkByaWQiOiIjNDE6MCJ9LCJpYXQiOjE1MjQyNDgwODgsImV4cCI6MTE1MjQyNDgwODh9.-PkTFeYCB7NyNs0XOap3ptPTp3icWxGbEBi2Hlku-kQ';

const argumentError = (usage, msg) => {
    console.log(usage);
    console.error(`Argument Error: ${msg}\n`);
    process.exit(2);
}


const fileExists = (fileName) => {
    if (! fs.existsSync(fileName)) {
        throw new Error(`File does not exist: ${fileName}`);
    }
    return fileName;
}

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
    if (opt.required && options[opt.name] === undefined) {
        argumentError(usage, `--${opt.name} is a required argument`);
    }
}


//uploadDiseaseOntology();
uploadHugoGenes(PERM_TOKEN);
