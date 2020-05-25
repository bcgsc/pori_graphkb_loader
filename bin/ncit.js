const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/ncit');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'path to the OWL file containing NCIt ontology definitions',
            name: 'filename',
            required: true,
            type: fileExists,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
