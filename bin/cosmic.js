/**
 * Parses clinical trial RSS Feed results
 */
const { runLoader } = require('../src');
const { createOptionsMenu, fileExists } = require('../src/cli');
const { uploadFile } = require('../src/knowledgebases/cosmic');

const parser = createOptionsMenu();
parser.add_argument('resistance', {
    help: 'path to the file to be loaded',
    type: fileExists,
});
parser.add_argument('diseaseMapping', {
    help: 'path to the disease mapping file to use in mapping diseases',
    type: fileExists,
});
const options = parser.parse_args();

runLoader(options, uploadFile, {
    filename: options.resistance,
    mapping: options.diseaseMapping,
});
