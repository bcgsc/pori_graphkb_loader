const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/ontology');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            name: 'filename',
            description: 'path to the JSON file containing your ontology definitions',
            type: fileExists,
            required: true,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
