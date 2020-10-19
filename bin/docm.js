const { runLoader } = require('../src');
const { createOptionsMenu } = require('../src/cli');
const { upload } = require('../src/knowledgebases/docm');


const options = createOptionsMenu().parse_args();


runLoader(options, upload);
