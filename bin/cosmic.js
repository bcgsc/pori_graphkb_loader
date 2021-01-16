const { runLoader } = require('../src');
const { createOptionsMenu, fileExists } = require('../src/cli');
const { uploadFile: uploadResistanceFile } = require('../src/knowledgebases/cosmic');
const { uploadFile: uploadFusionsFile } = require('../src/knowledgebases/cosmicFusions');

const parser = createOptionsMenu();
parser.add_argument('fileType', {
    choices: ['resistance', 'fusions'],
    help: 'Type of cosmic File being Loaded',
});
parser.add_argument('mainFile', {
    help: 'path to the file to be loaded',
    type: fileExists,
});
parser.add_argument('classification', {
    help: 'path to the cosmic classification file',
    type: fileExists,
});
const options = parser.parse_args();

runLoader(
    options,
    options.fileType === 'fusions'
        ? uploadFusionsFile
        : uploadResistanceFile,
    {
        filename: options.mainFile,
        mappingFilename: options.classification,
    },
)
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
