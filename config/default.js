


const server = {
    pass: process.env.DATABASE_SERVER_PASS || 'root',
    user: process.env.DATABASE_SERVER_USER || 'root',
    port: process.env.DATABASE_PORT || 2480,
    host: process.env.DATABASE_HOST || 'localhost' 
}

const db = {
    name: process.env.DATABASE || 'load_testing',
    pass: process.env.DATABASE_PASS || 'admin',
    user: process.env.DATABASE_USER || 'admin',
    host: server.host,
    port: server.port
}

module.exports = {server, db, app: {port: process.env.PORT || 8080}}
