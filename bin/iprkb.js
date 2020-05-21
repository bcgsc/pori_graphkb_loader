const { stdOptions, runLoader } = require('../src');
const { createOptionsMenu } = require('../src/cli');
const { uploadFile } = require('../src/knowledgebases/iprkb');
const { fileExists } = require('../src/util');


const options = createOptionsMenu([
    ...stdOptions,
    {
        description: 'path to the tab delimited export of IPRKb',
        name: 'filename',
        required: true,
        type: fileExists,
    },
]);


runLoader(options, uploadFile, { filename: options.filename });
