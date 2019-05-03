// required packages
const {AppServer, createConfig} = require('./app');
const {logger} = require('./app/repo/logging');

// process.on('uncaughtException', app.close);
let app;

(async () => {
    try {
        app = new AppServer(createConfig());
        await app.listen();

        // cleanup
        process.on('SIGINT', async () => {
            if (app) {
                await app.close();
            }
            process.exit(1);
        });
    } catch (err) {
        logger.log('error', `Failed to start server: ${err}`);
        logger.log('error', err.stack);
        app.close();
        throw err;
    }
})();
