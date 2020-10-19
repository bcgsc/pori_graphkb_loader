const { runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { upload } = require('../src/knowledgebases/oncokb');

const parser = createOptionsMenu();
parser.add_argument('dirname', {
    help: 'path to the directory with the JSON file dumps',
    type: fileExists,
});
const options = parser.parse_args();


runLoader(options, upload, { url: options.dirname });
