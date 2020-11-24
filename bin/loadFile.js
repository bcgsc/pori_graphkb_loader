/**
 * Parses clinical trial RSS Feed results
 */
const { runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');

const MODULES = {
    cgi: 'knowledgebases/cancergenomeinterpreter',
    cgl: 'knowledgebases/cgl',
    diseaseOntology: 'diseaseOntology',
    drugbank: 'drugs/drugbank',
    fdaSrs: 'drugs/fdaSrs',
    gscTherapeuticOntology: 'drugs/gscTherapeuticOntology',
    iprkb: 'iprkb',
    ncit: 'ncit',
    ncitFdaXref: 'drugs/ncitFdaXref',
    ontology: 'ontology',
};

const parser = createOptionsMenu();
parser.add_argument('module', {
    choices: Object.keys(MODULES),
    help: 'module to run',
});
parser.add_argument('filename', {
    help: 'path to the file to be loaded',
    type: fileExists,
});
const options = parser.parse_args();

const { uploadFile } = require(`./../src/${MODULES[options.module]}`); // eslint-disable-line


runLoader(options, uploadFile, { filename: options.filename });
