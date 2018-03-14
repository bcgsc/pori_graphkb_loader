/*
 * defines the js functions to be loaded to the server
 */

// db.query('CREATE FUNCTION getUserByName "select * from User where name = :name and deletedAt is null" PARAMETERS [name] IDEMPOTENT true LANGUAGE sql');
const createFunction = async (db, func) => {
    return await db.query(
        `CREATE FUNCTION ${func.name} :code PARAMETERS [${func.params.join(',')}] IDEMPOTENT :idempotent LANGUAGE ${func.language === 'javascript' ? 'javascript' : 'sql'}`, 
        {params: {
            code: func.code, 
            idempotent: func.idempotent || false
        }}
    );
}


const createRepoFunctions = async (db) => {
    // getters for unique
    const repoFunctions = [];
    for (let table of ['Feature', 'Disease', 'Therapy', 'Pathway', 'MutationSignature', 'User']) {
        repoFunctions.push({name: `getUniq${table}ByName`, params: ['name'], idempotent: true, language: 'javascript', code: `
var selection = orient.getDatabase().query("select * from ${table} where name = ? and deletedAt is null", [name]);
if (selection.length === 1) {
  return selection;
} else {
  return null;
}
    `});
    }
    await Promise.all(Array.from(repoFunctions, x => createFunction(db, x)));
}

module.exports = {createRepoFunctions};
