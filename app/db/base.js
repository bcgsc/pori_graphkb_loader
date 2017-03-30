const {AttributeError} = require('./error');
const uuidV4 = require('uuid/v4');

const errorJSON = function(error) {
    return {type: error.type, message: error.message};
}


class Base {
    constructor(dbClass) {
        this.dbClass = dbClass;
        dbClass.property.list()
            .then((list) => {
            }).catch((error) => {
                console.log('error in creating class', clsname, error);
            });
    }
    /**
     * getter for the class properties/attributes
     * @returns {Array} array of property names
     */
    get properties() {
        return Array.from(this.dbClass.properties, ({name}) => name);
    }
    create_record(opt) {
        
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
    static get clsname() {
        var clsname = this.name;
        clsname = clsname.replace(/([a-z])([A-Z])/, '$1_$2');
        return clsname.toLowerCase();
    }
    static loadClass(db) {
        return new Promise((resolve, reject) => {
            db.class.get(this.clsname)
                .then((cls) => {
                    console.log('got cls from db', cls.name);
                    const c = new this(cls);
                    resolve(c);
                }).catch((error) => {
                    reject(error);
                })
        });
    }
}

module.exports = Base;
