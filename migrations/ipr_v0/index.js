const {main} = require('./migrate');

main()
    .then(() => {
        process.exit(0);
    });
