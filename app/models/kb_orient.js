const OrientDB = require('orientjs');

module.exports = (opt) => {
    const auth = {
        user: opt.dbUsername,
        pass: opt.dbPassword
    };
    
    // set up the database server
    const server = OrientDB({
        host: opt.host,
        HTTPport: opt.port,
        username: opt.serverUsername,
        password: opt.serverPassword,
        useToken: true
    });
    
    // try listing all the databases on the server
    /*
    const dbs = server.list()
    .then((dbs) => {
        console.log('dbs.length: ' + dbs.length);
    }).catch(error => {
        console.log('Exception:' + error);
    });
    
    console.log('dbs' + dbs);*/
    
    // connect to the database through the db server
    const db = server.use({
        name: opt.dbName,
        username: opt.dbUsername,
        password: opt.dbPassword
    });
    console.log('Using Database:'  + db.name);
    
    // build the schema
    /*
    db.class.create('box3', 'V, E', null, true) // name, parentName, cluster, isAbstract
    .then((resp) => {
        console.log('created class', resp.name, resp)
    }).catch(err => {
        console.log('couldn\'t create class', err);
    });*/
    return db
}; 
