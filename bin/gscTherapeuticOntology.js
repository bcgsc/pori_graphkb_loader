const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/drugs/gscTherapeuticOntology');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            name: 'filename',
            description: 'path to the tab delimited file containing the GSC drug ontology',
            type: fileExists,
            required: true,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
