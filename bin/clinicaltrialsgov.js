/**
 * Parses clinical trial RSS Feed results
 */

const { stdOptions, runLoader } = require('../src');
const { upload, uploadFile } = require('../src/clinicaltrialsgov');
const { fileExists, createOptionsMenu } = require('../src/cli');


const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'load trials information from an XML export of a search result downloaded from clinicaltrials.gov',
            name: 'xml',
            type: fileExists,
        },
        {
            description: 'load recently updated (~2 weeks) clinical trial information',
            name: 'recent',
        },
    ],
);


const main = async () => {
    if (options.xml !== undefined) {
        await runLoader(options, uploadFile, { filename: options.xml });
    } else {
        await runLoader(options, upload);
    }
};

main();
