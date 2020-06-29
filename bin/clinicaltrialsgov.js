/**
 * Parses clinical trial RSS Feed results
 */
const fs = require('fs');
const path = require('path');
const { stdOptions, runLoader } = require('../src');
const { upload, uploadFiles } = require('../src/clinicaltrialsgov');
const { fileExists, createOptionsMenu } = require('../src/cli');


const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'directory containing XML record files downloaded from NCT. 1 Trial per record',
            name: 'dir',
            type: fileExists,
        },
        {
            description: 'XML record files downloaded from NCT. 1 Trial per record',
            multiple: true,
            name: 'file',
            type: fileExists,
        },
        {
            description: 'load recently updated (~2 weeks) clinical trial information',
            name: 'recent',
        },
    ],
);


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
