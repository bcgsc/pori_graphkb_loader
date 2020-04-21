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
            name: 'xml',
            description: 'load trials information from an XML export of a search result downloaded from clinicaltrials.gov',
            type: fileExists,
        },
        {
            name: 'recent',
            description: 'load recently updated (~2 weeks) clinical trial information',
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
