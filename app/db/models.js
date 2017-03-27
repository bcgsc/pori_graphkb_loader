const Base = require('./base');

class Publication extends Base { 
    constructor(db) {
        const clsname = 'V';
        const parameters = ['title', 'pubmed_id', 'journal', 'year'];
        super(db, clsname, parameters);
    }
};


module.exports = {Publication};
