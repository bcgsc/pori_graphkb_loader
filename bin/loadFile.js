/**
 * Parses clinical trial RSS Feed results
 */
const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');

const MODULES = {
    diseaseOntology: 'diseaseOntology',
    drugbank: 'drugs/drugbank',
    fdaSrs: 'drugs/fdaSrs',
    gscTherapeuticOntology: 'drugs/gscTherapeuticOntology',
    iprkb: 'iprkb',
    ncit: 'ncit',
    ncitFdaXref: 'drugs/ncitFdaXref',
    ontology: 'ontology',
};

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'path to the file to be loaded',
            name: 'filename',
            required: true,
            type: fileExists,
        },
        {
            description: 'module to run',
            enum: Object.keys(MODULES),
            name: 'module',
            required: true,
        },
    ],
);

const { uploadFile } = require(`./../src/${MODULES[options.module]}`); // eslint-disable-line


runLoader(options, uploadFile, { filename: options.filename });
