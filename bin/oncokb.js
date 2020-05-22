const { stdOptions, runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { upload } = require('../src/knowledgebases/oncokb');

const options = createOptionsMenu(
    [
        ...stdOptions,
        {
            description: 'path to the directory with the JSON file dumps',
            name: 'filename',
            required: true,
            type: fileExists,
        },
    ],
);


runLoader(options, upload, { url: options.filename });
