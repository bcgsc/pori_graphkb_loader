const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/ontology');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'path to the JSON file containing your ontology definitions',
            name: 'filename',
            required: true,
            type: fileExists,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
