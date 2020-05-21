const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/drugs/drugbank');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'path to the XML export of drugbank',
            name: 'filename',
            required: true,
            type: fileExists,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
