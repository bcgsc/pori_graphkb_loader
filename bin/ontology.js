const { runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/ontology');

const parser = createOptionsMenu();
parser.add_argument('filename', {
    help: 'path to the JSON file containing your ontology definitions',
    type: fileExists,
});
const options = parser.parse_args();

runLoader(options, uploadFile, { filename: options.filename });
