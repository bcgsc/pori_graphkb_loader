

const conf = {
    serverPassword: process.env.KB_DBSERVER_PASS || 'root',
    serverUsername: process.env.KB_DBSERVER_USER || 'root',
    port: process.env.KB_DB_PORT || 2480,
    host: process.env.KB_DB_HOST || 'localhost' ,
    dbPassword: process.env.KB_DB_PASS || 'admin',
    dbUsername: process.env.KB_DB_USER || 'admin',
    dbName: process.env.KB_DB_NAME || 'test'
};

module.exports = conf
