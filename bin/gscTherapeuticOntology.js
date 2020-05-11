const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/drugs/gscTherapeuticOntology');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'path to the tab delimited file containing the GSC drug ontology',
            name: 'filename',
            required: true,
            type: fileExists,
        },
    ],
);


runLoader(options, uploadFile, { filename: options.filename });
