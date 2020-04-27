const { stdOptions, runLoader } = require('../src');
const { createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/knowledgebases/iprkb');
const { fileExists } = require('../src/util');


const options = createOptionsMenu([
    ...stdOptions,
    {
        name: 'filename',
        description: 'path to the tab delimited export of IPRKb',
        type: fileExists,
        required: true,
    },
]);


runLoader(options, uploadFile, { filename: options.filename });
