const {AttributeError} = require('./error');

const errorJSON = function(error) {
    return {type: error.type, message: error.message};
}


class Base {
    constructor(db, clsname='V', parameters=[]) {
        this.db = db;
        this.clsname = clsname;
        this.parameters = parameters;
    }
    get_by_id(id){
        console.log('get_by_id', id);
        return this.db.record.get(`#${id}`);
    }
    get(opt){
        return new Promise((resolve, reject) => {
            const queryArgs = [];
            for (let key of Object.keys(opt)) {
                if (this.parameters.includes(key)) {
                    queryArgs.push(`${key}=:${key}`);
                } else {
                    reject(new AttributeError(`invalid parameter ${key}`));
                }
            }
            if (queryArgs.length > 0){
                console.log(`select * from ${this.clsname} where ${queryArgs.join(' AND ')}`, opt);
                this.db.select().from(this.clsname).where(opt).all()
                    .then((result) => {
                        resolve(result);
                    }).catch((error) => {
                        reject(error);
                    });
            } else {
                console.log(`select * from ${this.clsname}`);
                this.db.select().from(this.clsname).all()
                    .then((result) => {
                        resolve(result);
                    }).catch((error) => {
                        reject(error);
                    });
            }
        });
    }
}

module.exports = Base;
