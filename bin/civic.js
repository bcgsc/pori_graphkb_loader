const { stdOptions, runLoader } = require('../src');
const { createOptionsMenu } = require('../src/cli');
const { upload } = require('../src/knowledgebases/civic');


const options = createOptionsMenu([...stdOptions]);


runLoader(options, upload);
