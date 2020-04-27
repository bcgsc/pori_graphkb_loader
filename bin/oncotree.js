const { stdOptions, runLoader } = require('../src');
const { createOptionsMenu } = require('../src/cli');
const { upload } = require('../src/oncotree');


const options = createOptionsMenu([...stdOptions]);


runLoader(options, upload);
