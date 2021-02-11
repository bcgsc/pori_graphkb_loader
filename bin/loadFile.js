/**
 * Parses clinical trial RSS Feed results
 */
const { runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');

const MODULES = {
    cgi: 'cancergenomeinterpreter',
    cgl: 'cgl',
    diseaseOntology: 'diseaseOntology',
    cancerhotspots: 'cancerhotspots',
    drugbank: 'drugbank',
    ensembl: 'ensembl',
    fdaSrs: 'fdaSrs',
    gscTherapeuticOntology: 'gscTherapeuticOntology',
    iprkb: 'iprkb',
    ncit: 'ncit',
    ncitFdaXref: 'ncit/ncitFdaXref',
    ontology: 'ontology',
    refseq: 'refseq',
    tcgaFusions: 'tcgaFusions',
    uberon: 'uberon',
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


runLoader(options, uploadFile, { filename: options.filename })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
