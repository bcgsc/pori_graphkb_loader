const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/diseaseOntology');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'path to the JSON file containing your disease ontology export',
            name: 'filename',
            required: true,
            type: fileExists,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
