const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/drugs/drugbank');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            name: 'filename',
            description: 'path to the XML export of drugbank',
            type: fileExists,
            required: true,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
