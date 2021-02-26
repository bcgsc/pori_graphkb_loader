const fs = require('fs');
const path = require('path');

const { runLoader } = require('../src');
const { createOptionsMenu, fileExists } = require('../src/cli');

const civic = require('../src/civic');
const dgidb = require('../src/dgidb');
const docm = require('../src/docm');
const oncotree = require('../src/oncotree');
const fdaApprovals = require('../src/fdaApprovals');

const cancerhotspots = require('../src/cancerhotspots');
const cgi = require('../src/cancergenomeinterpreter');
const cgl = require('../src/cgl');
const diseaseOntology = require('../src/diseaseOntology');
const drugbank = require('../src/drugbank');
const ensembl = require('../src/ensembl');
const fdaSrs = require('../src/fdaSrs');
const gscTherapeuticOntology = require('../src/gscTherapeuticOntology');
const ncit = require('../src/ncit');
const ncitFdaXref = require('../src/ncit/ncitFdaXref');
const ontology = require('../src/ontology');
const refseq = require('../src/refseq');
const PMC4468049 = require('../src/PMC4468049');
const uberon = require('../src/uberon');

const clinicaltrialsgov = require('../src/clinicaltrialsgov');

const cosmicResistance = require('../src/cosmic/resistance');
const cosmicFusions = require('../src/cosmic/fusions');

const API_MODULES = {
    civic, clinicaltrialsgov, dgidb, docm, fdaApprovals, oncotree,
};

const FILE_MODULES = {
    PMC4468049,
    cancerhotspots,
    cgi,
    cgl,
    clinicaltrialsgov,
    diseaseOntology,
    drugbank,
    ensembl,
    fdaSrs,
    gscTherapeuticOntology,
    ncit,
    ncitFdaXref,
    ontology,
    refseq,
    uberon,
};

const COSMIC_MODULES = {
    fusions: cosmicFusions,
    resistance: cosmicResistance,
};

const ALL_MODULES = {
    ...API_MODULES,
    ...FILE_MODULES,
    ...COSMIC_MODULES,
};

const parser = createOptionsMenu();

const subparsers = parser.add_subparsers({ help: 'Sub-command help', required: true });
const apiParser = subparsers.add_parser('api');
apiParser.add_argument('module', {
    choices: Object.keys(API_MODULES),
    help: 'module to run',
});

const fileParser = subparsers.add_parser('file');
fileParser.add_argument('module', {
    choices: Object.keys(FILE_MODULES),
    help: 'module to run',
});
fileParser.add_argument('input', {
    help: 'path to the file/dir to be loaded',
    type: fileExists,
});

const cosmicParser = subparsers.add_parser('cosmic');
cosmicParser.add_argument('module', {
    choices: Object.keys(COSMIC_MODULES),
    help: 'module to run',
});
cosmicParser.add_argument('input', {
    help: 'path to the file to be loaded',
    type: fileExists,
});
cosmicParser.add_argument('classification', {
    help: 'path to the cosmic classification file',
    type: fileExists,
});

const options = parser.parse_args();

let loaderFunction;

if (options.input) {
    loaderFunction = ALL_MODULES[options.module].uploadFile;
} else {
    loaderFunction = ALL_MODULES[options.module].upload;
}

const loaderOptions = {};

if (options.input) {
    if (options.module === 'clinicaltrialsgov') {
        if (fs.lstatSync(options.input).isDirectory()) {
            const files = fs.readdirSync(options.input)
                .map(filename => path.join(options.input, filename));
            loaderOptions.files = files;
        } else {
            loaderOptions.files = [options.input];
        }
    } else {
        loaderOptions.filename = options.input;

        if (options.module === 'cosmic') {
            loaderOptions.mappingFilename = options.mappingFilename;
        }
    }
}

runLoader(options, loaderFunction, loaderOptions)
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
