/**
 * Parses clinical trial RSS Feed results
 */
const { runLoader } = require('../src');
const { createOptionsMenu } = require('../src/cli');

const MODULES = {
    civic: 'knowledgebases/civic',
    dgidb: 'drugs/dgidb',
    docm: 'knowledgebases/docm',
    oncotree: 'oncotree',
};

const parser = createOptionsMenu();
parser.add_argument('module', {
    choices: Object.keys(MODULES),
    help: 'module to run',
});
const options = parser.parse_args();

const { upload } = require(`./../src/${MODULES[options.module]}`); // eslint-disable-line


runLoader(options, upload);
