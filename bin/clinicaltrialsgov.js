/**
 * Parses clinical trial RSS Feed results
 */
const fs = require('fs');
const path = require('path');
const { runLoader } = require('../src');
const { upload, uploadFiles } = require('../src/clinicaltrialsgov');
const { fileExists, createOptionsMenu } = require('../src/cli');


const parser = createOptionsMenu();
const group = parser.add_mutually_exclusive_group({ required: true });

group.add_argument('--dir', {
    help: 'directory containing XML record files downloaded from NCT. 1 Trial per record',
    type: fileExists,
});
group.add_argument('--file', {
    help: 'XML record files downloaded from NCT. 1 Trial per record',
    nargs: '+',
    type: fileExists,
});
group.add_argument('--recent', {
    help: 'load recently updated (~2 weeks) clinical trial information',
});

const options = parser.parse_args();


const main = async () => {
    if (options.dir !== undefined) {
        const files = fs.readdirSync(options.dir).map(filename => path.join(options.dir, filename));
        await runLoader(options, uploadFiles, { files });
    } else if (options.file !== undefined) {
        await runLoader(options, uploadFiles, { files: options.file });
    } else {
        await runLoader(options, upload);
    }
};

main();
