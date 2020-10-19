const { runLoader } = require('../src');
const { createOptionsMenu, fileExists } = require('../src/cli');
const { uploadFile } = require('../src/knowledgebases/cosmic');

const parser = createOptionsMenu();
parser.add_argument('CosmicResistanceMutations', {
    help: 'path to the file to be loaded',
    type: fileExists,
});
parser.add_argument('classification', {
    help: 'path to the cosmic classification file',
    type: fileExists,
});
const options = parser.parse_args();

runLoader(options, uploadFile, {
    filename: options.CosmicResistanceMutations,
    mappingFilename: options.classification,
});
